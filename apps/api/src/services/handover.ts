import { handoverScopeSchema, uuidv7 } from '@css/shared';
import type { z } from 'zod';
import type { Scope } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { PermissionVersionService } from '../auth/permission-version.service';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import {
  type HandoverItem,
  type HandoverItemType,
  pendingHandoverItems,
  pickItems,
  providerOf,
} from '../handover/providers';
import { ApiError } from '../i18n/api-error';
import type { RegistrationEvents } from '../notifications/registration-events';

type HandoverScope = z.infer<typeof handoverScopeSchema>;
type HandoverRow = { id: string; scope: unknown; completedAt: Date | null };

export interface HandoverAssign {
  toUserId: string;
  items?: { itemType: HandoverItemType; itemId: string }[];
}

/**
 * The staff handover (BD-08, BR-034; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R13, R14): the
 * Department Head or the Monitoring Team sees an official's pending work by category, reassigns
 * items one by one or all at once to an active official of a fitting role, and completes the
 * handover when nothing is left. The first assignment starts the handover (the "to be
 * deactivated" mark); completion does not deactivate, the account-state change does (and needs
 * the completed handover).
 */
export class HandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly versions: PermissionVersionService,
    private readonly events: RegistrationEvents,
  ) {}

  private pending(db: Tx, userId: string): Promise<HandoverItem[]> {
    return pendingHandoverItems(db, userId);
  }

  /** The official in scope (staff only), 404 otherwise; locked when a transaction is given. */
  private async official(scope: Scope, userId: string, db: Tx, lock = false) {
    if (lock) await db.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await this.access.findUser(scope, userId, { id: true, kind: true }, db);
    if (user.kind !== 'staff') {
      this.access.denied(scope.actorId, scope.permission, scope.entity);
      throw new ApiError('permission.not_found', 404);
    }
    return user;
  }

  private view(userId: string, handover: HandoverRow | null, pending: HandoverItem[]) {
    return {
      id: handover?.id ?? null,
      fromUserId: userId,
      pending: pending.map(({ requiredRole: _role, ...item }) => item),
      scope: handover ? handoverScopeSchema.parse(handover.scope) : { items: [] },
      outstandingCount: pending.length,
      completedAt: handover?.completedAt?.toISOString() ?? null,
    };
  }

  private latest(db: Tx, userId: string) {
    return db.handover.findFirst({
      where: { fromUserId: userId },
      orderBy: [{ completedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
      select: { id: true, scope: true, completedAt: true },
    });
  }

  async get(scope: Scope, userId: string) {
    await this.official(scope, userId, this.prisma);
    const [handover, pending] = await Promise.all([
      this.latest(this.prisma, userId),
      this.pending(this.prisma, userId),
    ]);
    return this.view(userId, handover, pending);
  }

  /** The open handover of an official, started by this call when there is none. */
  private async open(tx: Tx, actor: Principal, userId: string, toUserId: string | null) {
    const open = await tx.handover.findFirst({
      where: { fromUserId: userId, completedAt: null },
      select: { id: true, scope: true, completedAt: true },
    });
    if (open) return { handover: open, started: false };
    const created = await tx.handover.create({
      data: {
        id: uuidv7(),
        fromUserId: userId,
        toUserId,
        scope: { items: [] },
        approvedBy: actor.userId,
      },
      select: { id: true, scope: true, completedAt: true },
    });
    await this.audit.record(tx, {
      action: 'auth.handover_started',
      entityType: 'user',
      entityId: userId,
      new: { handoverId: created.id },
    });
    return { handover: created, started: true };
  }

  async assign(actor: Principal, scope: Scope, userId: string, body: HandoverAssign) {
    const result = await this.prisma.$transaction(async (tx) => {
      // both accounts locked in id order: a state change of either waits (no deadlock)
      const ids = [userId, body.toUserId].sort();
      await tx.$queryRaw`SELECT id FROM users WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      await this.official(scope, userId, tx);
      const target = await tx.user.findFirst({
        where: { id: body.toUserId, kind: 'staff', state: 'active', NOT: { id: userId } },
        select: {
          id: true,
          userRolesUser: { where: { revokedAt: null }, select: { roleKey: true } },
        },
      });
      if (!target) throw new ApiError('handover.target_invalid', 422);
      const roles = new Set(target.userRolesUser.map((r) => r.roleKey));
      const pending = await this.pending(tx, userId);
      const picked = pickItems(pending, body.items);
      if (picked.some((i) => i.requiredRole !== null && !roles.has(i.requiredRole)))
        throw new ApiError('handover.target_invalid', 422);
      const { handover, started } = await this.open(tx, actor, userId, target.id);
      const recorded: HandoverScope = handoverScopeSchema.parse(handover.scope);
      const now = this.clock.now();
      for (const item of picked) {
        await providerOf(item.itemType).reassign(tx, item, userId, target.id, actor.userId);
        recorded.items.push({
          item_type: item.itemType,
          item_id: item.itemId,
          ...(item.projectId ? { project_id: item.projectId } : {}),
          new_owner_user_id: target.id,
          done_at: now.toISOString(),
        });
      }
      const saved = await tx.handover.update({
        where: { id: handover.id },
        data: { toUserId: target.id, scope: handoverScopeSchema.parse(recorded) },
        select: { id: true, scope: true, completedAt: true },
      });
      if (picked.length) {
        const entry = { count: picked.length, handoverId: handover.id };
        await this.versions.bump(tx, userId, {
          action: 'auth.handover_assigned',
          new: { ...entry, toUserId: target.id },
        });
        await this.versions.bump(tx, target.id, {
          action: 'auth.handover_received',
          new: { ...entry, fromUserId: userId },
        });
      }
      const left = picked.length ? await this.pending(tx, userId) : pending;
      return { view: this.view(userId, saved, left), started, moved: picked.length, to: target.id };
    });
    if (result.started) this.events.emit({ type: 'user.handover_started', userId });
    if (result.moved) {
      this.events.emit({ type: 'user.handover_assigned', userId });
      this.events.emit({ type: 'user.handover_received', userId: result.to });
    }
    return result.view;
  }

  /** Completes the handover once nothing is left; the deactivation stays the state change. */
  async complete(actor: Principal, scope: Scope, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.official(scope, userId, tx, true);
      const pending = await this.pending(tx, userId);
      if (pending.length) throw new ApiError('handover.items_outstanding', 409);
      // a repeated completion writes no second row or entry: there is nothing left to complete
      const latest = await this.latest(tx, userId);
      if (latest?.completedAt) throw new ApiError('user.transition_not_allowed', 409);
      const { handover } = await this.open(tx, actor, userId, null);
      const saved = await tx.handover.update({
        where: { id: handover.id },
        data: { completedAt: this.clock.now() },
        select: { id: true, scope: true, completedAt: true },
      });
      await this.audit.record(tx, {
        action: 'auth.handover_completed',
        entityType: 'user',
        entityId: userId,
        new: { handoverId: saved.id },
      });
      return this.view(userId, saved, pending);
    });
    this.events.emit({ type: 'user.handover_completed', userId });
    return result;
  }
}
