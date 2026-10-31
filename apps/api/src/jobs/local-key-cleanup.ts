import type { Logger } from 'pino';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';

/** Daily at 03:50 Dhaka time on the maintenance queue (ADR-004). */
export const LOCAL_KEY_CLEANUP_CRON = '50 3 * * *';

/** How long after a session can no longer be refreshed its device key may still be recovered. */
export const LOCAL_KEY_KEEP_DAYS = 30;
const REFRESH_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

/**
 * Drops the sealed device key of sessions that ended long ago (docs/architecture/AUTH.md "Tokens
 * and device sessions"): a key is kept for thirty days after the session expired or fell out of
 * its refresh window, so a phone that was offline that long can still recover its outbox after
 * a new login; after that the key goes and the outbox on such a phone is reported as lost.
 * Idempotent: a second run finds nothing.
 */
export class LocalKeyCleanup {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<{ sessions: number }> {
    const now = this.clock.now();
    const expiredBefore = new Date(now.getTime() - LOCAL_KEY_KEEP_DAYS * DAY_MS);
    const idleBefore = new Date(
      now.getTime() - (LOCAL_KEY_KEEP_DAYS + REFRESH_WINDOW_DAYS) * DAY_MS,
    );
    const result = await this.prisma.deviceSession.updateMany({
      where: {
        localKey: { not: null },
        OR: [{ expiresAt: { lt: expiredBefore } }, { lastSeenAt: { lt: idleBefore } }],
      },
      data: { localKey: null },
    });
    this.logger.info({ sessions: result.count }, 'old device keys dropped');
    return { sessions: result.count };
  }
}
