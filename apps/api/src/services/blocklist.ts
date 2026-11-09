import { uuidv7 } from '@css/shared';
import { beneficiaryWhere, type Scope, volunteerWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { SessionService } from '../auth/session.service';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { AccountEvents } from '../notifications/account-events';

type Entry = {
  id: string;
  subjectType: string;
  subjectId: string;
  active: boolean;
  blockedAt: Date;
  releasedAt: Date | null;
};

/** The entry as the contract shows it; the reason stays in the audit log (class blocklist.reason). */
function entryView(e: Entry) {
  return {
    id: e.id,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    active: e.active,
    blockedAt: e.blockedAt.toISOString(),
    releasedAt: e.releasedAt?.toISOString() ?? null,
  };
}

/**
 * The volunteer blocklist: the RPM, the PM, the Monitoring Team
 * and the Department Head block a volunteer in their scope with a reason and lift the block with a
 * reason. The trigger `sync_blocklist_flags` moves an active account to `blocked` and back and
 * bumps its permission version; this service also ends the volunteer's sessions. A blocked pending
 * registration stays pending and cannot be approved (registrations service).
 */
export class BlocklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly sessions: SessionService,
    private readonly events: AccountEvents,
  ) {}

  private notFound(scope: Scope): never {
    this.access.denied(scope.actorId, scope.permission, scope.entity);
    throw new ApiError('permission.not_found', 404);
  }

  /**
   * The volunteer in scope with the account state; the user row is locked first, in the same
   * order as an approval, so a block and an approval at once wait instead of deadlocking.
   */
  private async volunteerInScope(tx: Tx, scope: Scope, volunteerId: string) {
    await tx.$queryRaw`SELECT u.id FROM users u JOIN volunteers v ON v.user_id = u.id
      WHERE v.id = ${volunteerId}::uuid FOR UPDATE OF u`;
    const volunteer = await tx.volunteer.findFirst({
      where: { AND: [{ id: volunteerId }, volunteerWhere(scope)] },
      select: { id: true, userId: true, user: { select: { state: true } } },
    });
    if (!volunteer) return this.notFound(scope);
    return volunteer;
  }

  async block(actor: Principal, scope: Scope, volunteerId: string, reason: string) {
    const { entry, userId } = await this.prisma.$transaction(async (tx) => {
      const volunteer = await this.volunteerInScope(tx, scope, volunteerId);
      const active = await tx.blocklist.count({
        where: { subjectType: 'volunteer', subjectId: volunteer.id, active: true },
      });
      // an account blocked through the account state is not put on the blocklist: lifting
      // that entry would let the trigger reactivate an account a higher role blocked
      if (active || volunteer.user.state === 'blocked')
        throw new ApiError('user.transition_not_allowed', 409);
      const created = await tx.blocklist.create({
        data: {
          id: uuidv7(),
          subjectType: 'volunteer',
          subjectId: volunteer.id,
          reason,
          blockedBy: actor.userId,
          blockedAt: this.clock.now(),
        },
      });
      await this.sessions.revokeAll(tx, volunteer.userId, {
        by: actor.userId,
        reason: 'blocklisted',
      });
      await this.audit.record(tx, {
        action: 'blocklist.set',
        entityType: 'volunteer',
        entityId: volunteer.id,
        new: { blocklistId: created.id },
        reason,
      });
      await this.events.blockChanged(tx, volunteer.userId, true, actor.userId);
      return { entry: created, userId: volunteer.userId };
    });
    // revokeAll evicted inside the transaction; a request in between may have cached the old facts
    this.sessions.evictUser(userId);
    return entryView(entry);
  }

  /**
   * The live beneficiary in scope, its row locked first: the gate of a new application locks the
   * same row, so a block and an application at once wait for each other.
   */
  private async beneficiaryInScope(tx: Tx, scope: Scope, beneficiaryId: string) {
    await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${beneficiaryId}::uuid FOR UPDATE`;
    const found = await tx.beneficiary.findFirst({
      where: { AND: [{ id: beneficiaryId, mergedIntoId: null }, beneficiaryWhere(scope)] },
      select: { id: true },
    });
    if (!found) return this.notFound(scope);
    return found;
  }

  /**
   * Blocks a beneficiary with a reason: no new application in any project from now on,
   * the ongoing ones go on unchanged. The trigger `sync_blocklist_flags` sets the profile's flag;
   * the reason stays with the entry and the audit log, for officials only.
   */
  async blockBeneficiary(actor: Principal, scope: Scope, beneficiaryId: string, reason: string) {
    const entry = await this.prisma.$transaction(async (tx) => {
      const b = await this.beneficiaryInScope(tx, scope, beneficiaryId);
      const active = await tx.blocklist.count({
        where: { subjectType: 'beneficiary', subjectId: b.id, active: true },
      });
      if (active) throw new ApiError('user.transition_not_allowed', 409);
      const created = await tx.blocklist.create({
        data: {
          id: uuidv7(),
          subjectType: 'beneficiary',
          subjectId: b.id,
          reason,
          blockedBy: actor.userId,
          blockedAt: this.clock.now(),
        },
      });
      await this.audit.record(tx, {
        action: 'blocklist.set',
        entityType: 'beneficiary',
        entityId: b.id,
        new: { blocklistId: created.id },
        reason,
      });
      return created;
    });
    return entryView(entry);
  }

  /** Lifts a beneficiary's block with a reason; the person may apply again. */
  async unblockBeneficiary(actor: Principal, scope: Scope, beneficiaryId: string, reason: string) {
    const entry = await this.prisma.$transaction(async (tx) => {
      const b = await this.beneficiaryInScope(tx, scope, beneficiaryId);
      const active = await tx.blocklist.findFirst({
        where: { subjectType: 'beneficiary', subjectId: b.id, active: true },
        select: { id: true },
      });
      if (!active) throw new ApiError('user.transition_not_allowed', 409);
      const released = await tx.blocklist.update({
        where: { id: active.id },
        data: {
          active: false,
          releasedBy: actor.userId,
          releasedAt: this.clock.now(),
          releaseReason: reason,
        },
      });
      await this.audit.record(tx, {
        action: 'blocklist.lift',
        entityType: 'beneficiary',
        entityId: b.id,
        new: { blocklistId: released.id },
        reason,
      });
      return released;
    });
    return entryView(entry);
  }

  async unblock(actor: Principal, scope: Scope, volunteerId: string, reason: string) {
    const { entry, userId } = await this.prisma.$transaction(async (tx) => {
      const volunteer = await this.volunteerInScope(tx, scope, volunteerId);
      const active = await tx.blocklist.findFirst({
        where: { subjectType: 'volunteer', subjectId: volunteer.id, active: true },
        select: { id: true },
      });
      if (!active) return this.notFound(scope);
      const released = await tx.blocklist.update({
        where: { id: active.id },
        data: {
          active: false,
          releasedBy: actor.userId,
          releasedAt: this.clock.now(),
          releaseReason: reason,
        },
      });
      await this.audit.record(tx, {
        action: 'blocklist.lift',
        entityType: 'volunteer',
        entityId: volunteer.id,
        new: { blocklistId: released.id },
        reason,
      });
      await this.events.blockChanged(tx, volunteer.userId, false, actor.userId);
      return { entry: released, userId: volunteer.userId };
    });
    // the trigger changed the account state: the cached session facts must not keep the old one
    this.sessions.evictUser(userId);
    return entryView(entry);
  }
}
