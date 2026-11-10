import type { Logger } from 'pino';
import type { PrismaService } from '../core/prisma.service';
import { dropParts } from '../files/parts';
import { sweepUnclaimedPublicPhotos } from '../services/public-photos';
import type { StorageDriver } from '../storage';

/** Daily at 03:45 Dhaka time on the maintenance queue, after the registration cleanup. */
export const UPLOAD_SWEEP_CRON = '45 3 * * *';

/**
 * Removes upload sessions that expired before they were finalized, and their stored parts
 * (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload pipeline"). The rows go through the database
 * function `purge_expired_upload_sessions`, the only way a session is deleted; parts that cannot
 * be removed are logged. The public photos no submission claimed within a day go the same night. Idempotent: a second run finds nothing.
 */
export class UploadSweep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly logger: Logger,
  ) {}

  async run(batch = 500, maxBatches = 20): Promise<{ sessions: number; publicPhotos: number }> {
    let sessions = 0;
    for (let i = 0; i < maxBatches; i += 1) {
      const rows = await this.prisma.$queryRaw<{ session_id: string }[]>`
        SELECT session_id FROM purge_expired_upload_sessions(${batch}::int)`;
      for (const row of rows) {
        try {
          await dropParts(this.storage, row.session_id);
        } catch (error) {
          this.logger.warn({ err: error }, 'expired upload parts not removed');
        }
      }
      sessions += rows.length;
      if (rows.length < batch) break;
    }
    const publicPhotos = await sweepUnclaimedPublicPhotos(
      this.prisma,
      this.storage,
      this.logger,
      new Date(),
    );
    this.logger.info({ sessions, publicPhotos }, 'expired upload sessions swept');
    return { sessions, publicPhotos };
  }
}
