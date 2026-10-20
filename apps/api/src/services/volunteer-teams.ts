import { uuidv7 } from '@css/shared';
import { TEAM_LEAD_TYPES } from '@css/shared/projects';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { ProjectEvents } from '../notifications/project-events';

/** A team is built while the project runs. */
const RUNNING = ['active', 'closing'];

/**
 * A main volunteer's team on a project (BR-040, BR-041; DECISION_LOG D-096): a General or a
 * দাঈ-স্বেচ্ছাসেবক volunteer working on the project (assignment not ended, rules accepted) adds the
 * volunteers registered with them as reference, and removes them. A member is on one team of a
 * project at most and never also assigned to it; a new member accepts the rules on their own
 * before working. Candidates carry only their name and type. Everything is the caller's own.
 */
export class VolunteerTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly clock: Clock,
    private readonly events: ProjectEvents,
  ) {}

  /**
   * The caller as main volunteer on the project: 404 when not on it, 403 when not a lead type or,
   * unless only removing, when the current rules are not accepted (a lead may always take a member
   * off their team).
   */
  private async lead(db: Tx, principal: Principal, projectId: string, removing = false) {
    const row = await db.projectVolunteer.findFirst({
      where: {
        projectId,
        endedAt: null,
        volunteer: { userId: principal.userId },
        project: { status: { in: RUNNING } },
      },
      select: { volunteerId: true, consentStatus: true, volunteer: { select: { type: true } } },
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    const type = VOLUNTEER_TYPES.find((t) => t === row.volunteer.type);
    const working = removing || row.consentStatus === 'accepted';
    if (!working || !type || !TEAM_LEAD_TYPES.includes(type)) {
      this.access.denied(principal.userId, 'volunteer.team.manage', 'self');
      throw new ApiError('permission.denied', 403);
    }
    return row.volunteerId;
  }

  private async read(db: Tx, projectId: string, leadId: string) {
    // the blocked registrants of the lead leave the query, so the cap counts only those offered
    const registrants = await db.volunteer.findMany({
      where: { referenceVolunteerId: leadId },
      select: { id: true },
    });
    const blocked = await this.blocked(
      db,
      registrants.map((r) => r.id),
    );
    const [members, candidates] = await Promise.all([
      db.volunteerTeam.findMany({
        where: { projectId, leadVolunteerId: leadId, removedAt: null },
        orderBy: { addedAt: 'asc' },
        select: {
          memberVolunteerId: true,
          consentStatus: true,
          addedAt: true,
          memberVolunteer: { select: { type: true, user: { select: { displayName: true } } } },
        },
      }),
      db.volunteer.findMany({
        where: { ...this.candidateWhere(projectId, leadId), id: { notIn: [...blocked] } },
        orderBy: { id: 'asc' },
        take: 200,
        select: { id: true, type: true, user: { select: { displayName: true } } },
      }),
    ]);
    return {
      members: members.map((m) => ({
        volunteerId: m.memberVolunteerId,
        displayName: m.memberVolunteer.user.displayName,
        type: m.memberVolunteer.type,
        consentStatus: m.consentStatus === 'accepted' ? 'accepted' : 'pending',
        addedAt: m.addedAt.toISOString(),
      })),
      candidates: candidates.map((c) => ({
        volunteerId: c.id,
        displayName: c.user.displayName,
        type: c.type,
      })),
    };
  }

  /** Registered under the lead, approved, and neither on a team of the project nor assigned to it. */
  private candidateWhere(projectId: string, leadId: string) {
    return {
      referenceVolunteerId: leadId,
      user: { state: 'active' },
      volunteerTeamsMemberVolunteer: { none: { projectId, removedAt: null } },
      projectVolunteersVolunteer: { none: { projectId, endedAt: null } },
    };
  }

  private async blocked(db: Tx, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await db.blocklist.findMany({
      where: { subjectType: 'volunteer', active: true, subjectId: { in: ids } },
      select: { subjectId: true },
    });
    return new Set(rows.map((r) => r.subjectId));
  }

  async get(principal: Principal, projectId: string) {
    const leadId = await this.lead(this.prisma, principal, projectId);
    return this.read(this.prisma, projectId, leadId);
  }

  /** Adds members; all or nothing. The project row is locked, so an assignment cannot race it. */
  async add(principal: Principal, projectId: string, memberIds: string[]) {
    const ids = [...new Set(memberIds)];
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      const leadId = await this.lead(tx, principal, projectId);
      const [mine, blocked, onTeam, assigned] = await Promise.all([
        tx.volunteer.findMany({
          where: { id: { in: ids }, referenceVolunteerId: leadId, user: { state: 'active' } },
          select: { id: true },
        }),
        this.blocked(tx, ids),
        tx.volunteerTeam.count({
          where: { projectId, removedAt: null, memberVolunteerId: { in: ids } },
        }),
        tx.projectVolunteer.count({
          where: { projectId, endedAt: null, volunteerId: { in: ids } },
        }),
      ]);
      if (mine.length !== ids.length || ids.some((id) => blocked.has(id)))
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'memberVolunteerIds', code: 'validation.option_unknown' },
        ]);
      if (onTeam) throw new ApiError('volunteer.already_on_team', 409);
      if (assigned) throw new ApiError('volunteer.already_assigned', 409);
      await tx.volunteerTeam.createMany({
        data: ids.map((memberVolunteerId) => ({
          id: uuidv7(),
          projectId,
          leadVolunteerId: leadId,
          memberVolunteerId,
          createdBy: principal.userId,
          updatedBy: principal.userId,
        })),
      });
      await this.audit.record(tx, {
        action: 'volunteer.team_added',
        entityType: 'project',
        entityId: projectId,
        new: { leadVolunteerId: leadId, memberVolunteerIds: ids },
      });
      await this.events.teamMembersAdded(tx, projectId, ids, principal.userId);
      return this.read(tx, projectId, leadId);
    });
  }

  async remove(principal: Principal, projectId: string, memberId: string) {
    await this.prisma.$transaction(async (tx) => {
      const leadId = await this.lead(tx, principal, projectId, true);
      const removed = await tx.volunteerTeam.updateMany({
        where: { projectId, leadVolunteerId: leadId, memberVolunteerId: memberId, removedAt: null },
        data: { removedAt: this.clock.now(), updatedBy: principal.userId },
      });
      if (!removed.count) throw new ApiError('permission.not_found', 404);
      await this.audit.record(tx, {
        action: 'volunteer.team_removed',
        entityType: 'project',
        entityId: projectId,
        old: { leadVolunteerId: leadId, memberVolunteerId: memberId },
      });
    });
  }
}
