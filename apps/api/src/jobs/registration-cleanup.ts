import type { Logger } from 'pino';
import type { PrismaService } from '../core/prisma.service';
import type { Bucket, StorageDriver } from '../storage';

/** Daily at 03:30 Dhaka time on the maintenance queue (ADR-004). */
export const REGISTRATION_CLEANUP_CRON = '30 3 * * *';

/**
 * Deletes unsubmitted registration drafts past their expiry with their photos (plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R20; DECISION_LOG D-082).
 * The rows go through the database function `purge_expired_registration_drafts`, which returns the
 * stored objects; an object that cannot be removed is logged and stays unreachable in the private
 * bucket (no row points at it). Idempotent: a second run finds nothing.
 */
export class RegistrationCleanup {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly logger: Logger,
  ) {}

  async run(limit = 500): Promise<{ files: number }> {
    const rows = await this.prisma.$queryRaw<{ bucket: string; object_key: string }[]>`
      SELECT bucket, object_key FROM purge_expired_registration_drafts(${limit}::int)`;
    for (const row of rows) {
      try {
        await this.storage.remove(row.bucket as Bucket, row.object_key);
      } catch (error) {
        this.logger.warn({ err: error, bucket: row.bucket }, 'draft photo object not removed');
      }
    }
    this.logger.info({ files: rows.length }, 'expired registration drafts purged');
    return { files: rows.length };
  }
}
