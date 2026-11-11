import { EXPORT_LIMITS } from '@css/shared/exports';
import type { Logger } from 'pino';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { ExportEvents } from '../notifications/export-events.js';
import { knownBucket, type StorageDriver } from '../storage/types.js';
import { readFrozenRecord } from '../exports/records.js';
import { clearedOf, exportObjectKey } from './export-run.js';
import { QUEUES } from './queues.js';

/** Daily at 03:30 Dhaka time, after the night's other housekeeping. */
export const EXPORT_SWEEP_CRON = '30 3 * * *';

/** The scheduled sweep's job on the exports queue. */
export interface ExportSweepData {
  kind: 'export-sweep';
}

const BATCH = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * The daily export sweep (docs/api/API_STANDARDS.md, "Export job pattern"): a job left waiting or
 * running past its time limit becomes failed (`export.timed_out`) with whatever its attempts left
 * removed, and a finished file past its keep time is deleted from storage, then marked deleted;
 * the job row stays. Works in batches and changes nothing more when run again.
 */
export class ExportSweep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly clock: Clock,
    private readonly logger: Pick<Logger, 'info' | 'error'>,
    private readonly events?: Pick<ExportEvents, 'failed'>,
  ) {}

  async run(): Promise<{ timedOut: number; expired: number }> {
    const timedOut = await this.failStuck();
    const expired = await this.expireFiles();
    if (timedOut || expired) this.logger.info({ timedOut, expired }, 'export sweep');
    return { timedOut, expired };
  }

  private async failStuck(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - EXPORT_LIMITS.stuckMinutes * MINUTE_MS);
    let failed = 0;
    // a job that could not be ended today is left for tomorrow, never in the way of the others
    const skipped: string[] = [];
    for (;;) {
      const stuck = await this.prisma.exportJob.findMany({
        where: {
          status: { in: ['queued', 'running'] },
          createdAt: { lt: cutoff },
          ...(skipped.length > 0 ? { id: { notIn: skipped } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
        select: {
          id: true,
          kind: true,
          format: true,
          requestedBy: true,
          createdAt: true,
          access: true,
        },
      });
      for (const job of stuck) {
        // a record job keeps no copy of its record once it ends, however it ends
        const cleared = clearedOf(readFrozenRecord(job.access));
        try {
          for (let attempt = 0; attempt <= QUEUES.exports.retryLimit; attempt += 1)
            await this.storage.remove(
              'exports',
              exportObjectKey(job.id, attempt, job.kind, job.format, job.createdAt),
            );
          const now = this.clock.now();
          await this.prisma.$transaction(async (tx) => {
            const ended = await tx.exportJob.updateMany({
              where: { id: job.id, status: { in: ['queued', 'running'] } },
              data: {
                status: 'failed',
                errorCode: 'export.timed_out',
                finishedAt: now,
                updatedAt: now,
                ...(cleared ? { access: cleared } : {}),
              },
            });
            if (ended.count > 0) {
              failed += 1;
              await this.events?.failed(tx, job);
            }
          });
        } catch (error) {
          this.logger.error({ err: error, jobId: job.id }, 'export sweep: job not ended');
          skipped.push(job.id);
        }
      }
      if (stuck.length < BATCH) return failed;
    }
  }

  private async expireFiles(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - EXPORT_LIMITS.keepDays * DAY_MS);
    let expired = 0;
    // a file whose object could not be removed today is left for tomorrow, never in the way of
    // the files after it
    const skipped: string[] = [];
    for (;;) {
      const files = await this.prisma.file.findMany({
        where: {
          kind: 'export',
          deletedAt: null,
          exportJobsFile: { some: { finishedAt: { lt: cutoff } } },
          ...(skipped.length > 0 ? { id: { notIn: skipped } } : {}),
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        select: { id: true, bucket: true, objectKey: true },
      });
      for (const file of files) {
        try {
          // the object goes first; a file row marked deleted never points at a kept object
          await this.storage.remove(knownBucket(file.bucket), file.objectKey);
        } catch (error) {
          this.logger.error({ err: error, fileId: file.id }, 'export sweep: file not removed');
          skipped.push(file.id);
          continue;
        }
        const now = this.clock.now();
        await this.prisma.file.updateMany({
          where: { id: file.id, deletedAt: null },
          data: { deletedAt: now, updatedAt: now },
        });
        expired += 1;
      }
      if (files.length < BATCH) return expired;
    }
  }
}
