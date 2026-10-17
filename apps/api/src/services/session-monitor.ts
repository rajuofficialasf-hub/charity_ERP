import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { boundedRead } from '../core/bounded-read';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  parseSort,
  searchWhere,
} from '../core/pagination';
import type { PrismaService } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';

export interface ActiveSessionQuery {
  limit: number;
  cursor?: string;
  q?: string;
  kind?: 'staff' | 'volunteer';
}

export interface ActiveSessionView {
  id: string;
  person: { id: string; name: string; kind: string; systemOwner: boolean };
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
}

/** Only these fields leave the server: never a token hash or an address. */
const SELECT = {
  id: true,
  deviceName: true,
  platform: true,
  appVersion: true,
  createdAt: true,
  lastSeenAt: true,
  user: { select: { id: true, displayName: true, kind: true, isSystemOwner: true } },
} satisfies Prisma.DeviceSessionSelect;

/**
 * Every active device session for the Department Head and the Monitoring Team (docs/DECISION_LOG.md,
 * the admin and settings decision of 2026-10-17), newest started first, with a search by
 * person. Ending one goes through the existing revoke of a user's session, which keeps the Main
 * Admin's sessions for the Main Admin.
 */
export class SessionMonitorService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(actor: Principal, query: ActiveSessionQuery) {
    // newest started first: session ids are time-ordered (UUID version 7) and unique, so the
    // keyset holds exactly, which a microsecond timestamp read into milliseconds would not
    const sort = parseSort(undefined, ['id'], [{ field: 'id', direction: 'desc' }]);
    const binding = `sessions.active|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const person = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(searchWhere(query.q, ['displayName', 'mobile', 'email', 'jobId']) ?? {}),
    };
    const filter: Prisma.DeviceSessionWhereInput = {
      revokedAt: null,
      expiresAt: { gt: this.clock.now() },
      user: { kind: { not: 'system' }, ...person },
    };
    const fetched = await boundedRead(this.prisma, (tx) =>
      tx.deviceSession.findMany({
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
      rows: rows.map((r): ActiveSessionView => ({
        id: r.id,
        person: {
          id: r.user.id,
          name: r.user.displayName,
          kind: r.user.kind,
          systemOwner: r.user.isSystemOwner,
        },
        deviceName: r.deviceName,
        platform: r.platform,
        appVersion: r.appVersion,
        createdAt: r.createdAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
      })),
      meta,
    };
  }
}
