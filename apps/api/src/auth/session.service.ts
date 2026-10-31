import { uuidv7 } from '@css/shared';
import type { DevicePlatform } from '@css/shared/auth';
import { type AuditWriter } from '../audit/audit-writer';
import type { Clock } from '../core/clock';
import { type PrismaService, type Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import { encodeLocalKey, newLocalKey, openLocalKey, sealLocalKey } from './local-key';
import { hashRefreshToken, type TokenService } from './token.service';
import type { AccountEvents } from '../notifications/account-events';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Session lifetimes and limits (AUTH.md 5, O-05, O-25, D-070). */
export const SESSION_RULES = {
  hardLimitMs: 180 * DAY,
  refreshWindowMs: 30 * DAY,
  idleTimeoutMs: 12 * 60 * MINUTE,
  deviceLimit: 5,
  cacheMs: 60_000,
  touchEveryMs: 5 * MINUTE,
  /** A rotated token replayed this soon is a parallel refresh from another tab, not theft. */
  reuseGraceMs: 30_000,
} as const;

/** Everything a request needs about its session and user, cached per session (AUTH.md 5). */
export interface SessionFacts {
  sessionId: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  kind: string;
  state: string;
  permissionVersion: number;
  /** A new password is due before anything else (DECISION_LOG O-66). */
  passwordChangeRequired: boolean;
  roles: string[];
  globalScope: boolean;
  isSystemOwner: boolean;
}

interface CacheEntry {
  facts: SessionFacts;
  loadedAt: number;
  touchedAt: number;
}

export interface NewSession {
  userId: string;
  kind: string;
  device?: { name?: string; platform?: DevicePlatform; appVersion?: string };
  ip?: string;
}

/**
 * How long after the first handback the phone may ask for an ended session's key again: a login
 * answer lost on a poor network must not cost the outbox.
 */
export const LOCAL_KEY_RECOVERY_GRACE_MS = 15 * 60_000;

/** What a phone asking for an ended session's key gets, and why not. */
export type RecoveredKey =
  | { key: string }
  | { key: null; reason: 'unknown' | 'foreign' | 'live' | 'revoked' | 'gone' | 'unopenable' };

export interface RevokeBy {
  /** Official or user who revoked; null for the system (device limit, reuse). */
  by: string | null;
  reason: string;
}

/**
 * Device sessions (AUTH.md 5 and 8): creation with the device limit, refresh-token rotation with
 * reuse detection, revocation and the cached per-request check. Revocation evicts the cache entry
 * at once on this process; other processes see it within the cache time (one process today).
 */
export class SessionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly events: AccountEvents,
    /** Active sessions a user may hold; the E2E run raises it. */
    private readonly deviceLimit: number,
    /** The current secret first, then the previous one during a rotation. */
    private readonly localKeySecrets: string[],
  ) {}

  private get sealingSecret(): string {
    const [current] = this.localKeySecrets;
    if (!current) throw new Error('local key secret missing');
    return current;
  }

  /** Creates a session; the sixth active session of a user revokes the oldest (O-25). */
  async create(
    tx: Tx,
    input: NewSession,
  ): Promise<{ id: string; refreshToken: string; expiresAt: Date; localKey: string }> {
    const now = this.clock.now();
    const open = await tx.deviceSession.findMany({
      where: { userId: input.userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, expiresAt: true, lastSeenAt: true, idleTimeout: true },
    });
    // a session that idled past its refresh window cannot be used any more, so it neither counts
    // against the limit nor is revoked for it: revoking it would only drop the device key a
    // phone may still recover
    const live = open.filter((s) => !this.ended(s, now));
    const surplus = live.length - (this.deviceLimit - 1);
    for (const old of live.slice(0, Math.max(0, surplus)))
      await this.revoke(tx, old.id, { by: null, reason: 'device_limit' });

    const id = uuidv7();
    const refreshToken = this.tokens.newRefreshToken(id);
    const expiresAt = new Date(now.getTime() + SESSION_RULES.hardLimitMs);
    const localKey = newLocalKey();
    await tx.deviceSession.create({
      data: {
        id,
        userId: input.userId,
        deviceName: input.device?.name ?? null,
        platform: input.device?.platform ?? null,
        appVersion: input.device?.appVersion ?? null,
        refreshTokenHash: hashRefreshToken(refreshToken),
        lastSeenAt: now,
        lastIp: input.ip ?? null,
        idleTimeout: input.kind === 'staff' && input.device?.platform === 'desktop',
        expiresAt,
        createdAt: now,
        createdBy: input.userId,
        localKey: sealLocalKey(localKey, id, this.sealingSecret),
      },
    });
    return { id, refreshToken, expiresAt, localKey: encodeLocalKey(localKey) };
  }

  /** A session the refresh would refuse: past its hard limit, or idle beyond its window. */
  private ended(
    session: { expiresAt: Date; lastSeenAt: Date; idleTimeout: boolean },
    now: Date,
  ): boolean {
    const idleLimit = session.idleTimeout
      ? SESSION_RULES.idleTimeoutMs
      : SESSION_RULES.refreshWindowMs;
    return (
      session.expiresAt <= now ||
      now.getTime() - session.lastSeenAt.getTime() >
        Math.min(idleLimit, SESSION_RULES.refreshWindowMs)
    );
  }

  /**
   * The device key of an ended session, handed back to its own user: the first handback is
   * stamped, and the phone may ask again for a short while in case the answer was lost; after
   * that the key is dropped. Nothing for a live, revoked or foreign session, or one whose key the
   * cleanup job already dropped.
   */
  async recoverKey(tx: Tx, sessionId: string, userId: string): Promise<RecoveredKey> {
    const now = this.clock.now();
    const session = await tx.deviceSession.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        idleTimeout: true,
        localKey: true,
        localKeyRecoveredAt: true,
      },
    });
    if (!session) return { key: null, reason: 'unknown' };
    if (session.userId !== userId) return { key: null, reason: 'foreign' };
    if (session.revokedAt) return { key: null, reason: 'revoked' };
    if (!session.localKey) return { key: null, reason: 'gone' };
    if (!this.ended(session, now)) return { key: null, reason: 'live' };
    const firstAt = session.localKeyRecoveredAt;
    if (firstAt && now.getTime() - firstAt.getTime() > LOCAL_KEY_RECOVERY_GRACE_MS) {
      await tx.deviceSession.update({ where: { id: sessionId }, data: { localKey: null } });
      return { key: null, reason: 'gone' };
    }
    const key = openLocalKey(session.localKey, sessionId, this.localKeySecrets);
    if (!key) return { key: null, reason: 'unopenable' };
    if (!firstAt)
      await tx.deviceSession.update({
        where: { id: sessionId },
        data: { localKeyRecoveredAt: now },
      });
    return { key: encodeLocalKey(key) };
  }

  /**
   * Exchanges a refresh token for a new one (AUTH.md 5). Expired, idle or unknown tokens are
   * `auth.refresh_invalid` (log in again, keep the outbox); a revoked session is
   * `auth.session_revoked`; replaying an already-rotated token revokes the session
   * (`auth.refresh_reused`), except within a few seconds of the rotation (parallel tabs).
   */
  async rotate(
    refreshToken: string,
    ip: string | undefined,
    csrf: { header?: string; cookie?: string },
  ): Promise<{
    sessionId: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    localKey: string;
  }> {
    const now = this.clock.now();
    const hash = hashRefreshToken(refreshToken);
    const session = await this.prisma.deviceSession.findUnique({
      where: { refreshTokenHash: hash },
    });
    if (!session) {
      await this.detectReuse(hash, now);
      throw new ApiError('auth.refresh_invalid', 401);
    }
    if (
      !csrf.header ||
      csrf.header !== csrf.cookie ||
      !this.tokens.csrfValid(session.id, csrf.header)
    )
      throw new ApiError('auth.csrf_failed', 403);
    if (session.revokedAt) throw new ApiError('auth.session_revoked', 401);
    if (this.ended(session, now)) throw new ApiError('auth.refresh_invalid', 401);

    const next = this.tokens.newRefreshToken(session.id);
    // a session from before the device keys gets one now; a key sealed under the previous secret
    // is sealed again under the current one; a key no secret opens (a rotation that dropped the
    // previous secret too early) is replaced, and the loss is on record so it is noticed
    const opened = session.localKey
      ? openLocalKey(session.localKey, session.id, this.localKeySecrets)
      : null;
    if (session.localKey && !opened)
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'sync.outbox_unrecoverable',
          entityType: 'device_session',
          entityId: session.id,
          actorUserId: session.userId,
          new: { reason: 'seal_unopenable' },
        }),
      );
    const localKey = opened ?? newLocalKey();
    const updated = await this.prisma.deviceSession.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: {
        refreshTokenHash: hashRefreshToken(next),
        previousTokenHash: hash,
        lastSeenAt: now,
        lastIp: ip ?? session.lastIp,
        localKey: sealLocalKey(localKey, session.id, this.sealingSecret),
      },
    });
    // Another refresh with the same token won the race: treat like a parallel tab.
    if (updated.count === 0) throw new ApiError('auth.refresh_invalid', 401);
    this.touchCache(session.id, now.getTime());
    return {
      sessionId: session.id,
      userId: session.userId,
      refreshToken: next,
      expiresAt: session.expiresAt,
      localKey: encodeLocalKey(localKey),
    };
  }

  private async detectReuse(hash: string, now: Date): Promise<void> {
    const stolen = await this.prisma.deviceSession.findFirst({
      where: { previousTokenHash: hash },
    });
    if (!stolen || stolen.revokedAt) return;
    if (now.getTime() - stolen.lastSeenAt.getTime() <= SESSION_RULES.reuseGraceMs) return;
    await this.prisma.$transaction(async (tx) => {
      await this.revoke(tx, stolen.id, { by: null, reason: 'refresh_reuse' });
      await this.audit.record(tx, {
        action: 'auth.refresh_reuse_detected',
        entityType: 'device_session',
        entityId: stolen.id,
        actorUserId: stolen.userId,
      });
      await this.events.refreshReused(tx, stolen.userId, stolen.id);
    });
    throw new ApiError('auth.refresh_reused', 401);
  }

  /** Revokes one session (idempotent) and evicts it from the cache. */
  async revoke(tx: Tx, sessionId: string, by: RevokeBy): Promise<boolean> {
    // the device key goes with the session: a revoked phone recovers nothing
    const result = await tx.deviceSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: {
        revokedAt: this.clock.now(),
        revokedBy: by.by,
        revokeReason: by.reason,
        localKey: null,
      },
    });
    this.cache.delete(sessionId);
    return result.count > 0;
  }

  /** Revokes every active session of a user, optionally keeping one; returns the revoked ids. */
  async revokeAll(tx: Tx, userId: string, by: RevokeBy, keep?: string): Promise<string[]> {
    const active = await tx.deviceSession.findMany({
      where: { userId, revokedAt: null, ...(keep ? { id: { not: keep } } : {}) },
      select: { id: true },
    });
    for (const s of active) await this.revoke(tx, s.id, by);
    this.evictUser(userId);
    return active.map((s) => s.id);
  }

  /** Active sessions of a user for the device list, newest activity first. */
  list(userId: string) {
    return this.prisma.deviceSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** Session and user facts for one request, cached for at most a minute (AUTH.md 5). */
  async facts(sessionId: string): Promise<SessionFacts | null> {
    const now = this.clock.now().getTime();
    const hit = this.cache.get(sessionId);
    if (hit && now - hit.loadedAt < SESSION_RULES.cacheMs) return hit.facts;
    const row = await this.prisma.deviceSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        user: {
          select: {
            kind: true,
            state: true,
            permissionVersion: true,
            passwordChangeRequired: true,
            isSystemOwner: true,
            userRolesUser: {
              where: { revokedAt: null },
              select: { roleKey: true, role: { select: { globalScope: true } } },
            },
          },
        },
      },
    });
    if (!row) return null;
    const roles = row.user.userRolesUser;
    const facts: SessionFacts = {
      sessionId: row.id,
      userId: row.userId,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
      kind: row.user.kind,
      state: row.user.state,
      permissionVersion: row.user.permissionVersion,
      passwordChangeRequired: row.user.passwordChangeRequired,
      roles: roles.map((r) => r.roleKey).sort(),
      globalScope: roles.some((r) => r.role.globalScope),
      isSystemOwner: row.user.isSystemOwner,
    };
    this.cache.set(sessionId, {
      facts,
      loadedAt: now,
      touchedAt: hit?.touchedAt ?? row.lastSeenAt.getTime(),
    });
    return facts;
  }

  /** Records activity at most every five minutes per session (D-070). */
  async touch(sessionId: string, ip: string | undefined): Promise<void> {
    const now = this.clock.now();
    const entry = this.cache.get(sessionId);
    if (entry && now.getTime() - entry.touchedAt < SESSION_RULES.touchEveryMs) return;
    if (entry) entry.touchedAt = now.getTime();
    await this.prisma.deviceSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastSeenAt: now, ...(ip ? { lastIp: ip } : {}) },
    });
  }

  /** Drops cached facts of every session of a user (state, role or permission change). */
  evictUser(userId: string): void {
    for (const [id, entry] of this.cache) if (entry.facts.userId === userId) this.cache.delete(id);
  }

  private touchCache(sessionId: string, at: number): void {
    const entry = this.cache.get(sessionId);
    if (entry) entry.touchedAt = at;
  }
}
