import { uuidv7 } from '@css/shared';
import { formatBenNo, type MergeRequest } from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service';
import { beneficiaryWhere, projectWhere, type Scope } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import { isUniqueViolation, isVolunteerMobileRefusal } from '../core/db-errors';
import type { PrismaService, Tx } from '../core/prisma.service';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { BeneficiaryMergeCandidatesService } from './beneficiary-merge-candidates';

/** A UUID may arrive in capitals; the pair map and the stored rows use lower case. */
const lowerIds = (body: MergeRequest): MergeRequest => ({
  ...body,
  keptId: body.keptId.toLowerCase(),
  mergedId: body.mergedId.toLowerCase(),
});

/**
 * Every row that points to a beneficiary, by table and column: a merge moves them from the retired
 * profile to the kept one, and a revert moves exactly the same ids back. The names are fixed here,
 * never input. `where` narrows a polymorphic table to its beneficiary rows.
 */
const MOVES = [
  { key: 'applications', table: 'applications', column: 'beneficiary_id' },
  { key: 'candidateApplications', table: 'applications', column: 'candidate_beneficiary_id' },
  { key: 'familyMembers', table: 'beneficiary_family_members', column: 'beneficiary_id' },
  { key: 'mediaConsents', table: 'media_consents', column: 'beneficiary_id' },
  { key: 'classAttendance', table: 'class_attendance', column: 'beneficiary_id' },
  { key: 'learningProgress', table: 'learning_progress', column: 'beneficiary_id' },
  { key: 'examResults', table: 'exam_results', column: 'beneficiary_id' },
  { key: 'callLogs', table: 'call_logs', column: 'beneficiary_id' },
  { key: 'followUps', table: 'followup_evaluations', column: 'beneficiary_id' },
  { key: 'mediaSubjects', table: 'media_subjects', column: 'beneficiary_id' },
  {
    key: 'fileLinks',
    table: 'file_links',
    column: 'entity_id',
    where: "entity_type = 'beneficiary'",
  },
  { key: 'alerts', table: 'alerts', column: 'subject_id', where: "subject_type = 'beneficiary'" },
] as const;
type MoveKey = (typeof MOVES)[number]['key'];

/**
 * The application states before review; such an application can still be deleted, so a duplicate
 * one stops a merge until an official deletes it. Any later state stays on the retired profile.
 */
const PENDING_STATES = ['draft', 'submitted', 'needs_verification'];

/** What a merge moved, by kind; the revert moves exactly these ids back. */
const snapshotSchema = z.object({
  moved: z.partialRecord(
    z.enum(MOVES.map((m) => m.key) as [MoveKey, ...MoveKey[]]),
    z.array(z.uuid()),
  ),
  leftBehind: z.array(z.uuid()),
  rejectedCorrections: z.array(z.uuid()),
  /** The block of the retired profile, released by the merge, and the copy it gave the kept one. */
  block: z.object({ released: z.uuid().nullable(), created: z.uuid().nullable() }),
});
type Snapshot = z.infer<typeof snapshotSchema>;

const VIEW = {
  id: true,
  keptId: true,
  mergedId: true,
  status: true,
  reason: true,
  proposedBy: true,
  proposedAt: true,
  mergedBy: true,
  mergedAt: true,
  revertedBy: true,
  revertedAt: true,
  snapshot: true,
  kept: { select: { benNo: true, name: true } },
  merged: { select: { benNo: true, name: true } },
} as const;
type MergeRow = Prisma.ProfileMergeGetPayload<{ select: typeof VIEW }>;

/**
 * Profile merges (the merge rules in docs/DECISION_LOG.md, the decision on profile merges): an RPM
 * proposes, a PM or a global role merges from a proposal or directly, choosing the profile to keep;
 * the Monitoring Team or the Department Head reverts. A merge moves every row of the retired profile
 * to the kept one and lists the moved ids in the snapshot, which the revert moves back exactly; rows
 * added to the kept profile later stay. An application past pending in a project both profiles
 * applied to stays on the retired profile; a pending one stops the merge. A merge never lifts a
 * block. Both profiles are locked in id order and must lie in the caller's scope.
 */
export class BeneficiaryMergesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly candidates: BeneficiaryMergeCandidatesService,
  ) {}

  private notFound(actor: Principal, scope: Scope): never {
    this.access.denied(actor.userId, scope.permission, 'beneficiary');
    throw new ApiError('permission.not_found', 404);
  }

  /** Locks both profiles in id order and checks they are live and in scope (404 otherwise). */
  private async lockPair(tx: Tx, actor: Principal, scope: Scope, a: string, b: string) {
    const ids = [a, b].map((id) => id.toLowerCase()).sort();
    for (const id of ids)
      await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${id}::uuid FOR UPDATE`;
    const found = await tx.beneficiary.findMany({
      where: { AND: [{ id: { in: ids } }, beneficiaryWhere(scope)] },
      select: { id: true, benNo: true, mergedIntoId: true },
    });
    if (found.length !== 2) this.notFound(actor, scope);
    return new Map(found.map((r) => [r.id, r]));
  }

  async propose(actor: Principal, scope: Scope, request: MergeRequest) {
    const body = lowerIds(request);
    return this.prisma.$transaction(async (tx) => {
      const pair = await this.lockPair(tx, actor, scope, body.keptId, body.mergedId);
      if ([...pair.values()].some((p) => p.mergedIntoId)) this.notFound(actor, scope);
      const open = await tx.profileMerge.count({
        where: {
          status: 'proposed',
          OR: [
            { keptId: body.keptId, mergedId: body.mergedId },
            { keptId: body.mergedId, mergedId: body.keptId },
          ],
        },
      });
      if (open) throw new ApiError('user.transition_not_allowed', 409);
      const row = await tx.profileMerge.create({
        data: {
          id: uuidv7(),
          keptId: body.keptId,
          mergedId: body.mergedId,
          reason: body.reason,
          proposedBy: actor.userId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        select: VIEW,
      });
      await this.audit.record(tx, {
        action: 'beneficiary.merge_proposed',
        entityType: 'beneficiary',
        entityId: body.keptId,
        new: { mergeId: row.id, mergedId: body.mergedId },
        reason: body.reason,
      });
      return view(row);
    });
  }

  /** A merge without a proposal: the caller proposes and merges in one step. */
  async direct(actor: Principal, scope: Scope, request: MergeRequest) {
    const body = lowerIds(request);
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const pair = await this.lockPair(tx, actor, scope, body.keptId, body.mergedId);
        const row = await tx.profileMerge.create({
          data: {
            id: uuidv7(),
            keptId: body.keptId,
            mergedId: body.mergedId,
            reason: body.reason,
            proposedBy: actor.userId,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          select: { id: true },
        });
        return this.merge(tx, actor, pair, row.id, body.keptId, body.mergedId);
      }),
    );
  }

  async execute(actor: Principal, scope: Scope, mergeId: string, keptId?: string) {
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM profile_merges WHERE id = ${mergeId}::uuid FOR UPDATE`;
        const found = await tx.profileMerge.findUnique({ where: { id: mergeId } });
        if (!found) this.notFound(actor, scope);
        const pair = await this.lockPair(tx, actor, scope, found.keptId, found.mergedId);
        if (found.status !== 'proposed') throw new ApiError('user.transition_not_allowed', 409);
        if ([...pair.values()].some((p) => p.mergedIntoId))
          throw new ApiError('beneficiary.merge_stale', 409);
        // the database answers ids in lower case; a caller may send either
        const kept = keptId?.toLowerCase() ?? found.keptId;
        if (kept !== found.keptId && kept !== found.mergedId)
          throw new ApiError('validation.failed', 422, undefined, [
            { path: 'keptId', code: 'validation.failed' },
          ]);
        const retired = kept === found.keptId ? found.mergedId : found.keptId;
        return this.merge(tx, actor, pair, mergeId, kept, retired);
      }),
    );
  }

  /** Maps the refusals that come from the database's backstops to the merge's own answers. */
  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isVolunteerMobileRefusal(error))
        throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
      if (isUniqueViolation(error)) throw new ApiError('beneficiary.merge_conflict', 409);
      throw error;
    }
  }

  /** The merge itself, inside the transaction that locked both profiles. */
  private async merge(
    tx: Tx,
    actor: Principal,
    pair: Awaited<ReturnType<BeneficiaryMergesService['lockPair']>>,
    mergeId: string,
    keptId: string,
    retiredId: string,
  ) {
    const kept = pair.get(keptId)!;
    if (kept.mergedIntoId || pair.get(retiredId)!.mergedIntoId)
      throw new ApiError('beneficiary.merge_stale', 409);
    await this.assertWithinReach(tx, actor, retiredId);
    await this.assertNoClash(tx, keptId, retiredId);
    const shared = await tx.$queryRaw<{ id: string; project_id: string; status: string }[]>`
      SELECT r.id, r.project_id, r.status FROM applications r
      WHERE r.beneficiary_id = ${retiredId}::uuid AND r.status <> 'deleted'
        AND EXISTS (SELECT 1 FROM applications k WHERE k.beneficiary_id = ${keptId}::uuid
                    AND k.project_id = r.project_id AND k.status <> 'deleted')`;
    const pending = shared.filter((a) => PENDING_STATES.includes(a.status));
    if (pending.length) {
      // the project and application are named only where the caller reaches the project
      const scope = await this.access.scopeOfUser(actor.userId, 'project.view', 'project', tx);
      const visible = new Set(
        (
          await tx.project.findMany({
            where: { AND: [{ id: { in: pending.map((a) => a.project_id) } }, projectWhere(scope)] },
            select: { id: true },
          })
        ).map((p) => p.id),
      );
      throw new ApiError(
        'beneficiary.merge_conflict',
        409,
        undefined,
        pending.map((a, i) => ({
          path: `applications.${i}`,
          code: 'beneficiary.merge_conflict',
          ...(visible.has(a.project_id)
            ? { params: { projectId: a.project_id, applicationId: a.id } }
            : {}),
        })),
      );
    }
    const leftBehind = shared.map((a) => a.id);
    const snapshot: Snapshot = {
      moved: {},
      leftBehind,
      rejectedCorrections: [],
      block: { released: null, created: null },
    };
    for (const move of MOVES) {
      const extra = 'where' in move ? Prisma.raw(` AND ${move.where}`) : Prisma.empty;
      const skip =
        // an application left on the retired profile keeps every pointer it has
        move.table === 'applications' && leftBehind.length
          ? Prisma.sql` AND id <> ALL(${leftBehind}::uuid[])`
          : Prisma.empty;
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE ${Prisma.raw(move.table)} SET ${Prisma.raw(move.column)} = ${keptId}::uuid
        WHERE ${Prisma.raw(move.column)} = ${retiredId}::uuid${extra}${skip}
        RETURNING id`);
      if (rows.length) snapshot.moved[move.key] = rows.map((r) => r.id);
    }
    const rejected = await tx.$queryRaw<{ id: string }[]>`
      UPDATE profile_correction_requests
      SET status = 'rejected', decided_by = ${actor.userId}::uuid, decided_at = now(),
          updated_by = ${actor.userId}::uuid
      WHERE beneficiary_id = ${retiredId}::uuid AND status = 'submitted' RETURNING id`;
    snapshot.rejectedCorrections = rejected.map((r) => r.id);
    snapshot.block = await this.carryBlock(tx, actor, keptId, retiredId, formatBenNo(kept.benNo));
    await tx.beneficiary.update({
      where: { id: retiredId },
      data: { mergedIntoId: keptId, updatedBy: actor.userId },
    });
    const row = await tx.profileMerge.update({
      where: { id: mergeId },
      data: {
        keptId,
        mergedId: retiredId,
        status: 'merged',
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        mergedBy: actor.userId,
        mergedAt: this.clock.now(),
        updatedBy: actor.userId,
      },
      select: VIEW,
    });
    await this.candidates.refreshFor(tx, [keptId, retiredId]);
    await this.audit.record(tx, {
      action: 'beneficiary.merge',
      entityType: 'beneficiary',
      entityId: keptId,
      new: { mergeId, mergedId: retiredId, moved: counts(snapshot), leftBehind: leftBehind.length },
      reason: row.reason,
    });
    return view(row);
  }

  /**
   * A merge moves applications only inside the merging official's reach: every application of the
   * retired profile must belong to a project the caller's merge permission reaches (a PM's program);
   * otherwise the Monitoring Team or the Department Head carries the merge out.
   */
  private async assertWithinReach(tx: Tx, actor: Principal, retiredId: string) {
    const reach = await this.access.scopeOfUser(actor.userId, 'beneficiary.merge', 'project', tx);
    // a revoked project stays outside even a GLOBAL reach (D-120)
    if (reach.instances.global && !reach.instances.revokedProjectIds.length) return;
    const outside = await tx.application.count({
      where: {
        beneficiaryId: retiredId,
        status: { not: 'deleted' },
        NOT: { project: projectWhere(reach) },
      },
    });
    if (outside) {
      this.access.denied(actor.userId, 'beneficiary.merge', 'beneficiary');
      throw new ApiError('beneficiary.merge_needs_global', 403);
    }
  }

  /** Refuses a merge whose moves would clash with a unique of the kept profile. */
  private async assertNoClash(tx: Tx, keptId: string, retiredId: string) {
    const clashes = await tx.$queryRaw<{ what: string; ref: string }[]>`
      SELECT 'class_attendance' AS what, r.class_id::text AS ref FROM class_attendance r
        JOIN class_attendance k ON k.class_id = r.class_id AND k.beneficiary_id = ${keptId}::uuid
         AND k.family_member_id IS NULL
        WHERE r.beneficiary_id = ${retiredId}::uuid AND r.family_member_id IS NULL
      UNION ALL
      SELECT 'learning_progress', r.topic_id::text FROM learning_progress r
        JOIN learning_progress k ON k.topic_id = r.topic_id AND k.beneficiary_id = ${keptId}::uuid
         AND k.family_member_id IS NULL
        WHERE r.beneficiary_id = ${retiredId}::uuid AND r.family_member_id IS NULL
      UNION ALL
      SELECT 'exam_results', r.exam_id::text FROM exam_results r
        JOIN exam_results k ON k.exam_id = r.exam_id AND k.beneficiary_id = ${keptId}::uuid
         AND k.family_member_id IS NULL
        WHERE r.beneficiary_id = ${retiredId}::uuid AND r.family_member_id IS NULL
      UNION ALL
      SELECT 'media_subjects', coalesce(r.project_id::text, 'none') FROM media_subjects r
        JOIN media_subjects k ON k.beneficiary_id = ${keptId}::uuid
         AND k.project_id IS NOT DISTINCT FROM r.project_id
        WHERE r.beneficiary_id = ${retiredId}::uuid
      UNION ALL
      SELECT 'file_links', r.file_id::text FROM file_links r
        JOIN file_links k ON k.entity_type = 'beneficiary' AND k.entity_id = ${keptId}::uuid
         AND k.file_id = r.file_id AND k.slot = r.slot
        WHERE r.entity_type = 'beneficiary' AND r.entity_id = ${retiredId}::uuid
      UNION ALL
      SELECT 'alerts', r.kind FROM alerts r
        JOIN alerts k ON k.subject_type = 'beneficiary' AND k.subject_id = ${keptId}::uuid
         AND k.kind = r.kind AND k.status <> 'resolved'
        WHERE r.subject_type = 'beneficiary' AND r.subject_id = ${retiredId}::uuid
          AND r.status <> 'resolved'`;
    if (clashes.length)
      throw new ApiError(
        'beneficiary.merge_conflict',
        409,
        undefined,
        clashes.map((c, i) => ({
          path: `${c.what}.${i}`,
          code: 'beneficiary.merge_conflict',
        })),
      );
  }

  /**
   * A block of the retired profile is released by the merge; the kept profile gets a copy with the
   * same reason unless it is blocked already, so a merge never lifts a block. New rows instead of a
   * changed subject, so the flag of each profile follows its own rows.
   */
  private async carryBlock(
    tx: Tx,
    actor: Principal,
    keptId: string,
    retiredId: string,
    keptBenNo: string,
  ): Promise<Snapshot['block']> {
    const retiredBlock = await tx.blocklist.findFirst({
      where: { subjectType: 'beneficiary', subjectId: retiredId, active: true },
    });
    if (!retiredBlock) return { released: null, created: null };
    const keptBlocked = await tx.blocklist.count({
      where: { subjectType: 'beneficiary', subjectId: keptId, active: true },
    });
    await tx.blocklist.update({
      where: { id: retiredBlock.id },
      data: {
        active: false,
        releasedBy: actor.userId,
        releasedAt: this.clock.now(),
        releaseReason: `released by the merge into ${keptBenNo}`,
      },
    });
    let created: string | null = null;
    if (!keptBlocked) {
      created = uuidv7();
      await tx.blocklist.create({
        data: {
          id: created,
          subjectType: 'beneficiary',
          subjectId: keptId,
          reason: retiredBlock.reason,
          blockedBy: retiredBlock.blockedBy,
          blockedAt: this.clock.now(),
        },
      });
    }
    return { released: retiredBlock.id, created };
  }

  async revert(actor: Principal, scope: Scope, mergeId: string, reason: string) {
    return this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM profile_merges WHERE id = ${mergeId}::uuid FOR UPDATE`;
        const found = await tx.profileMerge.findUnique({ where: { id: mergeId } });
        if (!found) this.notFound(actor, scope);
        const pair = await this.lockPair(tx, actor, scope, found.keptId, found.mergedId);
        if (found.status !== 'merged') throw new ApiError('user.transition_not_allowed', 409);
        if (pair.get(found.keptId)?.mergedIntoId)
          throw new ApiError('beneficiary.merge_revert_order', 409);
        const snapshot = snapshotSchema.parse(found.snapshot);
        for (const move of MOVES) {
          const ids = snapshot.moved[move.key];
          if (!ids?.length) continue;
          const back = await tx.$executeRaw(Prisma.sql`
            UPDATE ${Prisma.raw(move.table)} SET ${Prisma.raw(move.column)} = ${found.mergedId}::uuid
            WHERE id = ANY(${ids}::uuid[]) AND ${Prisma.raw(move.column)} = ${found.keptId}::uuid`);
          // a moved row now on a third profile would be taken from it: refuse instead
          if (back !== ids.length) throw new ApiError('beneficiary.merge_revert_order', 409);
        }
        await this.restoreBlock(tx, actor, found.mergedId, snapshot.block);
        await tx.beneficiary.update({
          where: { id: found.mergedId },
          data: { mergedIntoId: null, updatedBy: actor.userId },
        });
        const row = await tx.profileMerge.update({
          where: { id: mergeId },
          data: {
            status: 'reverted',
            revertedBy: actor.userId,
            revertedAt: this.clock.now(),
            updatedBy: actor.userId,
          },
          select: VIEW,
        });
        await this.candidates.refreshFor(tx, [found.keptId, found.mergedId]);
        await this.audit.record(tx, {
          action: 'beneficiary.merge_reverted',
          entityType: 'beneficiary',
          entityId: found.keptId,
          new: { mergeId, mergedId: found.mergedId, moved: counts(snapshot) },
          reason,
        });
        return view(row);
      }),
    );
  }

  /** The retired profile gets its block back; the copy the merge gave the kept profile is released. */
  private async restoreBlock(
    tx: Tx,
    actor: Principal,
    retiredId: string,
    block: Snapshot['block'],
  ) {
    if (!block.released) return;
    if (block.created)
      await tx.blocklist.updateMany({
        where: { id: block.created, active: true },
        data: {
          active: false,
          releasedBy: actor.userId,
          releasedAt: this.clock.now(),
          releaseReason: 'released by the revert of a merge',
        },
      });
    const original = await tx.blocklist.findUniqueOrThrow({ where: { id: block.released } });
    await tx.blocklist.create({
      data: {
        id: uuidv7(),
        subjectType: 'beneficiary',
        subjectId: retiredId,
        reason: original.reason,
        blockedBy: original.blockedBy,
        blockedAt: this.clock.now(),
      },
    });
  }

  /**
   * The merges with a profile in the caller's scope, newest first: one side is enough, because a
   * merge moves the retired profile's applications and with them a program's reach. An open proposal
   * whose profiles are no longer both live is left out; carrying it out would be refused.
   */
  async list(scope: Scope, status: 'proposed' | 'merged' | 'reverted' | undefined, limit: number) {
    const inScope = beneficiaryWhere(scope);
    const stillOpen: Prisma.ProfileMergeWhereInput = {
      OR: [
        { status: { not: 'proposed' } },
        { kept: { mergedIntoId: null }, merged: { mergedIntoId: null } },
      ],
    };
    const rows = await this.prisma.profileMerge.findMany({
      where: {
        AND: [
          status ? { status } : {},
          { OR: [{ kept: inScope }, { merged: inScope }] },
          stillOpen,
        ],
      },
      orderBy: { proposedAt: 'desc' },
      take: limit,
      select: VIEW,
    });
    return rows.map(view);
  }
}

const counts = (snapshot: Snapshot) =>
  Object.fromEntries(Object.entries(snapshot.moved).map(([k, ids]) => [k, ids?.length ?? 0]));

function view(row: MergeRow) {
  const snapshot = row.snapshot ? snapshotSchema.parse(row.snapshot) : null;
  return {
    id: row.id,
    keptId: row.keptId,
    mergedId: row.mergedId,
    keptBenNo: formatBenNo(row.kept.benNo),
    mergedBenNo: formatBenNo(row.merged.benNo),
    keptName: row.kept.name,
    mergedName: row.merged.name,
    status: row.status as 'proposed' | 'merged' | 'reverted',
    reason: row.reason,
    proposedBy: row.proposedBy,
    proposedAt: row.proposedAt.toISOString(),
    mergedBy: row.mergedBy,
    mergedAt: row.mergedAt ? row.mergedAt.toISOString() : null,
    revertedBy: row.revertedBy,
    revertedAt: row.revertedAt ? row.revertedAt.toISOString() : null,
    moved: snapshot ? counts(snapshot) : {},
    leftBehind: snapshot?.leftBehind.length ?? 0,
  };
}
