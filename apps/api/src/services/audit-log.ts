import { isoDateInDhaka } from '@css/shared/format';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { boundedRead } from '../core/bounded-read';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  parseRange,
  parseSort,
} from '../core/pagination';
import type { PrismaService } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

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

/** The default window when no date is given, and the widest one allowed. */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const DAY = 86_400_000;

/** Keys that could hold a secret; their values never leave the server, at any depth. */
const SECRET_KEY = /password|hash|token|secret|otp/i;

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
    const { from, to } = this.window(query.from, query.to);
    const sort = parseSort(
      undefined,
      ['createdAt', 'id'],
      [{ field: 'createdAt', direction: 'desc' }],
    );
    const binding = `audit.list|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter: Prisma.AuditLogWhereInput = {
      createdAt: parseRange(from, to),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
    };
    const fetched = await boundedRead(this.prisma, (tx) =>
      tx.auditLog.findMany({
        where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
        orderBy: orderBy(sort, direction),
        take: query.limit + 1,
        select: SELECT,
      }),
    );
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
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

  /** The date range (Dhaka days, inclusive): the last 30 days by default, never over a year. */
  private window(from?: string, to?: string): { from: string; to: string } {
    const today = isoDateInDhaka(this.clock.now());
    const end = to ?? today;
    const start =
      from ?? isoDateInDhaka(new Date(Date.parse(`${end}T12:00:00Z`) - DEFAULT_DAYS * DAY));
    const days = (Date.parse(end) - Date.parse(start)) / DAY;
    if (days < 0 || days >= MAX_DAYS)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'from', code: 'audit.range_required' },
      ]);
    return { from: start, to: end };
  }
}
