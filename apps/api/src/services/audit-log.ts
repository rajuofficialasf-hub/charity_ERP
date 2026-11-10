import { isoDateInDhaka } from '@css/shared/format';
import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import type { Clock } from '../core/clock.js';
import { boundedRead } from '../core/bounded-read.js';
import { buildPage, decodeCursor, parseRange } from '../core/pagination.js';
import type { PrismaService } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';

export interface AuditListQuery {
  limit: number;
  cursor?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditEntryView {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  actorRole: string | null;
  reason: string | null;
  ip: string | null;
  deviceSessionId: string | null;
  old: unknown;
  new: unknown;
}

/** The default window when no date is given, and the widest one allowed (days). */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const DAY = 86_400_000;

/** Keys that could hold a secret; their values never leave the server, at any depth. */
const SECRET_KEY =
  /password|hash|token|secret|otp|api_?key|credential|authorization|cookie|signature|jwt/i;

/** A snapshot with every secret-looking key dropped, as a safety net over what writers store. */
export function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, v]) => [key, withoutSecrets(v)]),
  );
}

const SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entityType: true,
  entityId: true,
  actorRole: true,
  reason: true,
  ip: true,
  deviceSessionId: true,
  old: true,
  new: true,
  actorUser: { select: { id: true, displayName: true } },
} satisfies Prisma.AuditLogSelect;

/**
 * The audit viewer (docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17): the
 * Department Head and the Monitoring Team read the log newest first, filtered by actor, entity,
 * action and a date range of at most a year, so the monthly partitions are pruned. The drill-down
 * of an entity is the same list filtered by its type and id. Values that look like secrets are
 * dropped from the answer.
 */
export class AuditLogService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(actor: Principal, query: AuditListQuery) {
    const { from, to } = this.window(query.from, query.to, Boolean(query.entityId));
    const range = parseRange(from, to)!;
    const binding = `audit.list|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const inRange = Prisma.sql`created_at BETWEEN ${range.gte} AND ${range.lte}`;
    const conditions = [
      inRange,
      ...(query.actorUserId ? [Prisma.sql`actor_user_id = ${query.actorUserId}::uuid`] : []),
      ...(query.entityType ? [Prisma.sql`entity_type = ${query.entityType}`] : []),
      ...(query.entityId ? [Prisma.sql`entity_id = ${query.entityId}::uuid`] : []),
      ...(query.action ? [Prisma.sql`action = ${query.action}`] : []),
    ];
    // The cursor names the boundary row by id; its exact time comes from the row itself, because a
    // JavaScript date keeps milliseconds and the column keeps microseconds (rows written in one
    // transaction share one time and would be skipped between pages).
    const boundary = typeof cursor?.v[0] === 'string' ? cursor.v[0] : null;
    if (cursor && !boundary) throw new ApiError('validation.failed', 422);
    if (boundary)
      conditions.push(
        direction === 'next'
          ? Prisma.sql`(created_at, id) < (SELECT created_at, id FROM audit_log WHERE id = ${boundary}::uuid AND ${inRange})`
          : Prisma.sql`(created_at, id) > (SELECT created_at, id FROM audit_log WHERE id = ${boundary}::uuid AND ${inRange})`,
      );
    const order = direction === 'next' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const fetched = await boundedRead(this.prisma, async (tx) => {
      const ids = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM audit_log WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY created_at ${order}, id ${order} LIMIT ${query.limit + 1}`;
      const found = await tx.auditLog.findMany({
        where: { id: { in: ids.map((r) => r.id) }, createdAt: range },
        select: SELECT,
      });
      const byId = new Map(found.map((r) => [r.id, r]));
      return ids.map((r) => byId.get(r.id)!).filter(Boolean);
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: [{ field: 'id', direction: 'desc' }],
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    return {
      rows: rows.map((r): AuditEntryView => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actorUser ? { id: r.actorUser.id, name: r.actorUser.displayName } : null,
        actorRole: r.actorRole,
        reason: r.reason,
        ip: r.ip,
        deviceSessionId: r.deviceSessionId,
        old: withoutSecrets(r.old),
        new: withoutSecrets(r.new),
      })),
      meta: { ...meta, from, to },
    };
  }

  /**
   * The date range (Dhaka days, inclusive), never over a year: the last 30 days by default, and
   * the widest range for the history of one entity, so its drill-down shows the whole year.
   */
  private window(from?: string, to?: string, oneEntity = false): { from: string; to: string } {
    const today = isoDateInDhaka(this.clock.now());
    const end = to ?? today;
    const back = oneEntity ? MAX_DAYS - 1 : DEFAULT_DAYS;
    const start = from ?? isoDateInDhaka(new Date(Date.parse(`${end}T12:00:00Z`) - back * DAY));
    const days = (Date.parse(end) - Date.parse(start)) / DAY;
    if (days < 0 || days >= MAX_DAYS)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'from', code: 'audit.range_required' },
      ]);
    return { from: start, to: end };
  }
}
