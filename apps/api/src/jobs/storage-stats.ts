import type { Logger } from 'pino';
import type { Clock } from '../core/clock.js';
import { dhakaDayStart } from '../core/dhaka-day.js';
import type { PrismaService } from '../core/prisma.service.js';

/** Nightly at 02:15 Dhaka time on its own queue (jobs/queues.ts). */
export const STORAGE_STATS_CRON = '15 2 * * *';
export const STORAGE_STATS_QUEUE = 'storage-stats' as const;

/** A sum over every file record may take a while on a large table. */
const SNAPSHOT_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };

/**
 * The nightly storage figures for the IT team (docs/architecture/FILES_AND_DOCUMENTS.md, "Locks,
 * retention and storage growth"): one `storage_stats` row per bucket and project with the bytes and
 * the number of stored files, all with one capture time. One snapshot per Dhaka day: a second run
 * on the same day writes nothing. The system health page compares the latest figures with the
 * snapshot of a month before to show the growth.
 */
export class StorageStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<{ rows: number }> {
    const now = this.clock.now();
    const rows = await this.prisma.$transaction(async (tx) => {
      // one snapshot at a time, so two runs of the same day cannot both write
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('storage-stats', 0))`;
      const today = await tx.storageStat.count({
        where: { capturedAt: { gte: dhakaDayStart(now) } },
      });
      if (today) return 0;
      return tx.$executeRaw`
        INSERT INTO storage_stats (id, captured_at, bucket, project_id, bytes, objects)
        SELECT gen_random_uuid(), ${now}, bucket, project_id, sum(size_bytes), count(*)
          FROM files WHERE deleted_at IS NULL
         GROUP BY bucket, project_id`;
    }, SNAPSHOT_TRANSACTION);
    this.logger.info({ rows }, 'storage figures recorded');
    return { rows };
  }
}
