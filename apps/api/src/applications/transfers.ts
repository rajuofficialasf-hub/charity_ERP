import { uuidv7 } from '@css/shared';
import { reasonRequestSchema } from '@css/shared/auth';
import { z } from 'zod';
import type { EffectiveAccess } from '../access/effective';
import { applicationWhere, holdsPermission, projectWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { ApplicationEvents } from '../notifications/application-events';
import type { ProjectVolunteersService } from '../services/project-volunteers';
import { liveApplicationCounts } from './limit';

/** Moves applications from one volunteer to another; the RPM, or an Executive the RPM grants. */
const TRANSFER = 'application.transfer';
/** Moves the old volunteer's team under the new one; the RPM. */
const TEAM_TRANSFER = 'volunteer.team.transfer';
/** Assigns the new volunteer to the project in the same request. */
const ASSIGN = 'volunteer.assign_project';
/** The most applications one transfer moves. */
const MAX_MOVED = 500;

const uuid = z.uuid();

/** A transfer of all or some applications of one volunteer to another, with a reason. */
export const transferSchema = z
  .strictObject({
    fromVolunteerId: uuid,
    toVolunteerId: uuid,
    /** The applications to move; absent moves every application of the volunteer on the project. */
    applicationIds: z.array(uuid).min(1).max(MAX_MOVED).optional(),
    reason: reasonRequestSchema.shape.reason,
    /** Moves the old volunteer's team members on the project under the new volunteer. */
    moveTeam: z.boolean().default(false),
    /** Assigns the new volunteer to the project in the same request. */
    assign: z.boolean().default(false),
  })
  .refine((v) => v.fromVolunteerId !== v.toVolunteerId, {
    path: ['toVolunteerId'],
    message: 'application.transfer_same',
  });
export type TransferRequest = z.infer<typeof transferSchema>;

/** What one transfer did: its batch, the applications moved, the team members moved, the limit. */
export const transferResult = z.object({
  batchId: uuid,
  moved: z.array(uuid),
  teamMoved: z.number().int(),
  /** The new volunteer now holds more applications than the project's limit; a warning. */
  overLimit: z.boolean(),
});
interface TransferResult extends Prisma.JsonObject {
  batchId: string;
  moved: string[];
  teamMoved: number;
  overLimit: boolean;
}

/** An application a transfer may pick, as the picker lists it. */
export const transferCandidate = z.object({
  id: uuid,
  appNo: z.string().nullable(),
  beneficiaryName: z.string().nullable(),
  status: z.string(),
});
export type TransferCandidate = z.infer<typeof transferCandidate>;

/**
 * The application transfer: an RPM, or an Executive the RPM granted it, moves all or some
 * applications of one volunteer on an active project to another volunteer assigned there, with a
 * reason. The new volunteer takes the owner's place, so they read, edit and send the applications
 * by state from then on, and an open unlock waits for them; the old volunteer, and their team
 * unless it moves too, no longer reach them. Each application keeps a transfer row and a timeline
 * step, one audit entry names the batch, and the two volunteers are told how many moved.
 */
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly idempotency: IdempotencyService,
    private readonly events: ApplicationEvents,
    private readonly assignments: ProjectVolunteersService,
  ) {}

  /** The applications of a volunteer on the project the caller may move, for the picker. */
  async candidates(
    principal: Principal,
    projectId: string,
    volunteerId: string,
  ): Promise<TransferCandidate[]> {
    const access = await this.access.load(principal.userId);
    this.assertHolds(principal, access, TRANSFER);
    const scope = await this.access.scopeFor(principal, access, TRANSFER, 'application');
    const rows = await this.prisma.application.findMany({
      where: {
        AND: [
          { projectId, ownerVolunteerId: volunteerId, status: { not: 'deleted' } },
          applicationWhere(scope),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_MOVED,
      select: {
        id: true,
        appNo: true,
        status: true,
        beneficiary: { select: { name: true } },
        applicantName: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      appNo: r.appNo,
      beneficiaryName: r.beneficiary?.name ?? r.applicantName ?? null,
      status: r.status,
    }));
  }

  async transfer(
    principal: Principal,
    projectId: string,
    key: string | undefined,
    body: TransferRequest,
  ): Promise<{ replay: boolean; result: TransferResult }> {
    const access = await this.access.load(principal.userId);
    this.assertHolds(principal, access, TRANSFER);
    if (body.moveTeam) this.assertHolds(principal, access, TEAM_TRANSFER);
    if (body.assign) this.assertHolds(principal, access, ASSIGN);
    const scope = await this.access.scopeFor(principal, access, TRANSFER, 'application');
    if (body.moveTeam) {
      // the team moves only on a project the caller's team scope reaches
      const teamScope = await this.access.scopeFor(principal, access, TEAM_TRANSFER, 'project');
      const reached = await this.prisma.project.count({
        where: { AND: [{ id: projectId }, projectWhere(teamScope)] },
      });
      if (!reached) {
        this.access.denied(principal.userId, TEAM_TRANSFER, 'project');
        throw new ApiError('permission.not_found', 404);
      }
    }
    // a volunteer not yet on the project is assigned first, through the assignment's own checks,
    // once everything the move checks has passed, so a refused transfer assigns nobody
    if (body.assign && !(await this.assigned(this.prisma, projectId, body.toVolunteerId))) {
      await this.plan(this.prisma, principal, scope, projectId, body, true);
      await this.assignments.assign(
        {
          principal,
          scope: await this.access.scopeFor(principal, access, ASSIGN, 'project'),
        },
        projectId,
        { volunteers: [{ volunteerId: body.toVolunteerId, isPaid: false }] },
      );
    }
    const outcome = await this.idempotency.runWithKey<TransferResult>(
      key,
      { userId: principal.userId, deviceSessionId: principal.sessionId },
      1,
      async (tx) => [await this.move(tx, principal, scope, projectId, body)],
      { requestHash: JSON.stringify([projectId, body]) },
    );
    return { replay: outcome.replay, result: outcome.results[0]! };
  }

  /**
   * What a transfer moves, after every check it makes: a running project; a new volunteer who is
   * active, not blocklisted and on the project (unless being assigned); the chosen applications
   * the old volunteer's on the project and inside the caller's scope (not found otherwise, so a
   * refusal never tells what lies outside it), or every such application at once, at most 500;
   * and, when the team moves, nothing of the old volunteer left behind on the project.
   */
  private async plan(
    db: Tx | PrismaService,
    principal: Principal,
    scope: Awaited<ReturnType<AccessService['scopeFor']>>,
    projectId: string,
    body: TransferRequest,
    assigning = false,
  ) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { status: true, perVolunteerLimit: true },
    });
    if (!project) throw new ApiError('permission.not_found', 404);
    // a project that does not run takes no transfer, as it takes no unlock
    if (project.status !== 'active') throw new ApiError('workflow.guard.project_active', 409);
    const [from, to] = await Promise.all([
      this.volunteer(db, body.fromVolunteerId),
      this.volunteer(db, body.toVolunteerId),
    ]);
    if (!from) throw refuse('fromVolunteerId', 'validation.option_unknown');
    if (!to) throw refuse('toVolunteerId', 'validation.option_unknown');
    if (to.state !== 'active' || to.blocked)
      throw refuse('toVolunteerId', 'application.transfer_target_unfit');
    if (!assigning && !(await this.assigned(db, projectId, to.id)))
      throw refuse('toVolunteerId', 'application.transfer_target_not_assigned');
    const owned = await db.application.findMany({
      where: {
        AND: [
          {
            projectId,
            ownerVolunteerId: from.id,
            status: { not: 'deleted' },
            ...(body.applicationIds ? { id: { in: body.applicationIds } } : {}),
          },
          applicationWhere(scope),
        ],
      },
      select: { id: true, status: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_MOVED + 1,
    });
    if (body.applicationIds) {
      if (owned.length !== new Set(body.applicationIds).size) {
        this.access.denied(principal.userId, TRANSFER, 'application');
        throw new ApiError('permission.not_found', 404);
      }
    } else {
      if (!owned.length) throw refuse('applicationIds', 'application.transfer_not_owned');
      if (owned.length > MAX_MOVED) throw refuse('applicationIds', 'application.transfer_too_many');
    }
    if (body.moveTeam) {
      // a team moved away from applications that stay would lose the ones its members created
      const left = await db.application.count({
        where: {
          projectId,
          ownerVolunteerId: from.id,
          status: { not: 'deleted' },
          id: { notIn: owned.map((a) => a.id) },
        },
      });
      if (left) throw refuse('moveTeam', 'application.transfer_team_partial');
    }
    return { project, from, to, owned };
  }

  private async move(
    tx: Tx,
    principal: Principal,
    scope: Awaited<ReturnType<AccessService['scopeFor']>>,
    projectId: string,
    body: TransferRequest,
  ): Promise<TransferResult> {
    const { project, from, to, owned } = await this.plan(tx, principal, scope, projectId, body);
    const ids = owned.map((a) => a.id);
    const now = this.clock.now();
    const actor = principal.userId;
    // the owner changes only where it is still the old volunteer, so two transfers never both move one
    const changed = await tx.application.updateMany({
      where: { id: { in: ids }, ownerVolunteerId: from.id },
      data: { ownerVolunteerId: to.id, updatedAt: now, updatedBy: actor },
    });
    if (changed.count !== ids.length) throw new ApiError('conflict.stale_version', 409);
    const batchId = uuidv7();
    await tx.applicationTransfer.createMany({
      data: ids.map((applicationId) => ({
        id: uuidv7(),
        applicationId,
        fromVolunteerId: from.id,
        toVolunteerId: to.id,
        approvedBy: actor,
        reason: body.reason,
        transferBatch: batchId,
        createdBy: actor,
      })),
    });
    for (const a of owned)
      await this.audit.record(tx, {
        action: 'application.transferred',
        entityType: 'application',
        entityId: a.id,
        old: { status: a.status, ownerVolunteerId: from.id },
        new: {
          status: a.status,
          action: 'transfer',
          ownerVolunteerId: to.id,
          comment: `${from.name} → ${to.name}`,
          batch: batchId,
        },
        reason: body.reason,
      });
    const teamMoved = body.moveTeam ? await this.moveTeam(tx, projectId, from.id, to.id, actor) : 0;
    await this.audit.record(tx, {
      action: 'application.transfer',
      entityType: 'project',
      entityId: projectId,
      new: {
        batch: batchId,
        fromVolunteerId: from.id,
        toVolunteerId: to.id,
        count: ids.length,
        teamMoved,
      },
      reason: body.reason,
    });
    await this.events.publishTransfer(tx, {
      projectId,
      count: ids.length,
      toUserId: to.userId,
      fromUserId: from.userId,
      batchId,
      actorId: actor,
    });
    const counts = await liveApplicationCounts(tx, [{ projectId, ownerVolunteerId: to.id }]);
    const overLimit =
      project.perVolunteerLimit !== null && counts(projectId, to.id) > project.perVolunteerLimit;
    return { batchId, moved: ids, teamMoved, overLimit };
  }

  /**
   * The old volunteer's team members on the project move under the new volunteer: the old rows end
   * and new ones open, the consent carried over (it is to the project's rules, not to the lead).
   */
  private async moveTeam(
    tx: Tx,
    projectId: string,
    fromId: string,
    toId: string,
    actor: string,
  ): Promise<number> {
    const members = await tx.volunteerTeam.findMany({
      where: { projectId, leadVolunteerId: fromId, removedAt: null },
      select: { id: true, memberVolunteerId: true, consentStatus: true, consentAt: true },
    });
    if (!members.length) return 0;
    const now = this.clock.now();
    await tx.volunteerTeam.updateMany({
      where: { id: { in: members.map((m) => m.id) } },
      data: { removedAt: now, updatedBy: actor, updatedAt: now },
    });
    await tx.volunteerTeam.createMany({
      data: members
        // the new volunteer never becomes a member under themselves
        .filter((m) => m.memberVolunteerId !== toId)
        .map((m) => ({
          id: uuidv7(),
          projectId,
          leadVolunteerId: toId,
          memberVolunteerId: m.memberVolunteerId,
          consentStatus: m.consentStatus,
          consentAt: m.consentAt,
          createdBy: actor,
          updatedBy: actor,
        })),
    });
    return members.filter((m) => m.memberVolunteerId !== toId).length;
  }

  private async volunteer(db: Tx | PrismaService, id: string) {
    const row = await db.volunteer.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        user: { select: { state: true, displayName: true } },
      },
    });
    if (!row) return null;
    const blocked = await db.blocklist.count({
      where: { subjectType: 'volunteer', subjectId: id, active: true },
    });
    return {
      id: row.id,
      userId: row.userId,
      name: row.user.displayName,
      state: row.user.state,
      blocked: blocked > 0,
    };
  }

  private async assigned(db: Tx | PrismaService, projectId: string, volunteerId: string) {
    return (
      (await db.projectVolunteer.count({ where: { projectId, volunteerId, endedAt: null } })) > 0
    );
  }

  private assertHolds(principal: Principal, access: EffectiveAccess, permission: string): void {
    if (holdsPermission(permission, access.grants)) return;
    this.access.denied(principal.userId, permission, 'application');
    throw new ApiError('permission.denied', 403);
  }
}

const refuse = (path: string, code: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path, code }]);
