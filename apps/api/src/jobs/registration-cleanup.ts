import type { Logger } from 'pino';
import type { PrismaService } from '../core/prisma.service';
import type { Bucket, StorageDriver } from '../storage';

/** Daily at 03:30 Dhaka time on the maintenance queue. */
export const REGISTRATION_CLEANUP_CRON = '30 3 * * *';

/**
 * Deletes unsubmitted registration drafts past their expiry with their photos. The rows go through
 * the database function `purge_expired_registration_drafts`, which returns the stored objects; an
 * object that cannot be removed is logged and stays unreachable in the private bucket (no row
 * points at it). Idempotent: a second run finds nothing.
 */
export class RegistrationCleanup {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly logger: Logger,
  ) {}

  async run(batch = 500, maxBatches = 20): Promise<{ files: number }> {
    let files = 0;
    // Batches keep each transaction short; a backlog is worked off in one run.
    for (let i = 0; i < maxBatches; i += 1) {
      const { removed, drafts } = await this.purge(batch);
      files += removed;
      if (drafts < batch) break;
    }
    this.logger.info({ files }, 'expired registration drafts purged');
    return { files };
  }

  private async purge(batch: number): Promise<{ removed: number; drafts: number }> {
    const rows = await this.prisma.$queryRaw<
      { bucket: string | null; object_key: string | null; drafts: number }[]
    >`SELECT bucket, object_key, drafts FROM purge_expired_registration_drafts(${batch}::int)`;
    let removed = 0;
    for (const row of rows) {
      if (!row.bucket || !row.object_key) continue;
      removed += 1;
      try {
        await this.storage.remove(row.bucket as Bucket, row.object_key);
      } catch (error) {
        this.logger.warn({ err: error, bucket: row.bucket }, 'draft photo object not removed');
      }
    }
    return { removed, drafts: rows[0]?.drafts ?? 0 };
  }
}
