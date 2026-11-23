import { buffer } from 'node:stream/consumers';
import { KIND_TYPES, type FileKind, type FileType } from '@css/shared/files';
import type { Logger } from 'pino';
import type { PrismaService } from '../core/prisma.service.js';
import { checkImage } from '../files/images-process.js';
import { knownBucket, type StorageDriver } from '../storage/index.js';

/** Nightly at 01:45 Dhaka time on its own queue (jobs/queues.ts); also at the worker's start. */
export const FILE_DIMENSIONS_CRON = '45 1 * * *';
export const FILE_DIMENSIONS_QUEUE = 'file-dimensions' as const;

/** Photos per read: each is read whole once, so a batch stays small. */
const BATCH = 50;
/** The photos the server decodes (the others never had a size). */
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
/** A photo the processing finished with; one still waiting or refused is left to it. */
const DONE = ['clean', 'skipped'];
/** Below the smallest uuid, where the walk by id starts. */
const FIRST_ID = '00000000-0000-0000-0000-000000000000';

export interface FileDimensionsResult {
  filled: number;
  skipped: number;
  failed: number;
}

/** The largest size an upload of this kind and type may have, or null for one it never takes. */
function largestUpload(kind: string, mime: string): number | null {
  const types = KIND_TYPES[kind as FileKind] as Partial<Record<FileType, number>> | undefined;
  return types?.[mime as FileType] ?? null;
}

/**
 * The width and height of the photos stored before the size was kept (docs/architecture/
 * FILES_AND_DOCUMENTS.md, the photo viewer): each photo without them is read once from the driver
 * its row names, measured as the processing measures a new one (turned upright), and written only
 * while still empty, so a second run writes nothing and never overwrites the processing. A photo
 * larger than its kind's largest upload is skipped without being read; one that cannot be read or
 * measured keeps no size; each is logged once by id, never with its content. Walks by id in small
 * batches, so a run of thousands of photos holds no long transaction.
 */
export class FileDimensionsJob {
  private readonly batchSize: number;
  private readonly drivers = new Map<string, StorageDriver>();

  constructor(
    private readonly prisma: Pick<PrismaService, 'file'>,
    /** The driver a row names: the current one, or another while files are being moved. */
    private readonly driverFor: (name: StorageDriver['name']) => StorageDriver,
    private readonly logger: Pick<Logger, 'info' | 'warn'>,
    options: { batchSize?: number } = {},
  ) {
    this.batchSize = options.batchSize ?? BATCH;
  }

  /** Whether any processed photo has no size yet: the worker queues a run at its start then. */
  async hasWaiting(): Promise<boolean> {
    const waiting = await this.prisma.file.findFirst({
      where: { width: null, deletedAt: null, mime: { in: IMAGES }, virusScan: { in: DONE } },
      select: { id: true },
    });
    return waiting !== null;
  }

  async run(): Promise<FileDimensionsResult> {
    const result: FileDimensionsResult = { filled: 0, skipped: 0, failed: 0 };
    for (let after = FIRST_ID; ;) {
      const rows = await this.prisma.file.findMany({
        where: {
          id: { gt: after },
          width: null,
          deletedAt: null,
          mime: { in: IMAGES },
          virusScan: { in: DONE },
        },
        orderBy: { id: 'asc' },
        take: this.batchSize,
        select: {
          id: true,
          bucket: true,
          objectKey: true,
          storageDriver: true,
          kind: true,
          mime: true,
          sizeBytes: true,
        },
      });
      if (!rows.length) break;
      for (const row of rows) {
        const largest = largestUpload(row.kind, row.mime);
        if (largest === null || row.sizeBytes > BigInt(largest)) {
          result.skipped += 1;
          this.logger.warn(
            { fileId: row.id },
            'file sizes: a photo larger than its kind allows is left without a size',
          );
          continue;
        }
        try {
          const driver = this.driver(row.storageDriver as StorageDriver['name']);
          const bytes = await buffer(await driver.get(knownBucket(row.bucket), row.objectKey));
          const { width, height } = await checkImage(bytes);
          const written = await this.prisma.file.updateMany({
            where: { id: row.id, width: null },
            data: { width, height },
          });
          result.filled += written.count;
        } catch (error) {
          result.failed += 1;
          this.logger.warn(
            { fileId: row.id, reason: error instanceof Error ? error.name : 'unknown' },
            'file sizes: a photo could not be read or measured and keeps no size',
          );
        }
      }
      after = rows[rows.length - 1]!.id;
    }
    this.logger.info(result, 'file sizes: the photos without a size were measured');
    return result;
  }

  private driver(name: StorageDriver['name']): StorageDriver {
    let driver = this.drivers.get(name);
    if (!driver) {
      driver = this.driverFor(name);
      this.drivers.set(name, driver);
    }
    return driver;
  }
}
