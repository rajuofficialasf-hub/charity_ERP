import type { AuditWriter } from '../audit/audit-writer';
import type { PrismaService } from '../core/prisma.service';
import { knownBucket, type StorageDriver } from './types';

type DriverName = StorageDriver['name'];

export interface CopyOptions {
  prisma: PrismaService;
  audit: AuditWriter;
  from: StorageDriver;
  fromName: DriverName;
  to: StorageDriver;
  toName: DriverName;
  /** Counts the rows still on the source driver and copies nothing. */
  dryRun?: boolean;
  /** Stops after this many rows, for a first trial run. */
  limit?: number;
  batchSize?: number;
  /** The system actor the audit entries name. */
  actorUserId?: string | null;
}

export interface CopyReport {
  /** Rows still on the source driver before the run. */
  pending: number;
  copied: number;
  /** Rows whose main object is not on the source driver; they stay there. */
  missing: string[];
  /** Rows whose copy did not arrive whole or could not be written; they stay on the source. */
  failed: string[];
}

interface Row {
  id: string;
  bucket: string;
  objectKey: string;
  thumbnailSmallKey: string | null;
  thumbnailMediumKey: string | null;
}

/** Copies one object and proves the target holds as many bytes as the source; false when it doesn't. */
async function copyObject(
  from: StorageDriver,
  to: StorageDriver,
  bucket: ReturnType<typeof knownBucket>,
  key: string,
): Promise<'copied' | 'missing' | 'failed'> {
  const info = await from.stat(bucket, key);
  if (!info) return 'missing';
  try {
    await to.put(bucket, key, await from.get(bucket, key), {
      contentType: info.contentType ?? 'application/octet-stream',
      size: info.size,
    });
    const copied = await to.stat(bucket, key);
    return copied?.size === info.size ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Copies the files of one storage driver to another, row by row in id order: each object and its
 * thumbnails are streamed across and checked by size before the row is marked as held by the
 * target, so a stopped run is simply run again and a row is never pointed at a damaged copy. The
 * source is never changed. Each batch writes one audit entry with its counts.
 */
export async function copyFiles(options: CopyOptions): Promise<CopyReport> {
  const { prisma, audit, from, fromName, to, toName } = options;
  if (fromName === toName) throw new Error('the copy needs two different drivers');
  const batchSize = options.batchSize ?? 100;
  const pending = await prisma.file.count({ where: { storageDriver: fromName } });
  const report: CopyReport = { pending, copied: 0, missing: [], failed: [] };
  if (options.dryRun) return report;

  let after: string | undefined;
  let seen = 0;
  for (;;) {
    const take = Math.min(batchSize, (options.limit ?? Infinity) - seen);
    if (take <= 0) break;
    const rows: Row[] = await prisma.file.findMany({
      where: { storageDriver: fromName, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' },
      take,
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        thumbnailSmallKey: true,
        thumbnailMediumKey: true,
      },
    });
    if (rows.length === 0) break;
    seen += rows.length;
    after = rows[rows.length - 1]!.id;

    let copied = 0;
    for (const row of rows) {
      const bucket = knownBucket(row.bucket);
      const main = await copyObject(from, to, bucket, row.objectKey);
      if (main === 'missing') {
        report.missing.push(row.id);
        continue;
      }
      const thumbnails = [row.thumbnailSmallKey, row.thumbnailMediumKey].filter(
        (key): key is string => key !== null,
      );
      const results: string[] = [main];
      for (const key of thumbnails) results.push(await copyObject(from, to, bucket, key));
      // a thumbnail the source lacks is no reason to keep the photo itself off the target
      if (results.some((r) => r === 'failed')) {
        report.failed.push(row.id);
        continue;
      }
      const moved = await prisma.file.updateMany({
        where: { id: row.id, storageDriver: fromName },
        data: { storageDriver: toName },
      });
      copied += moved.count;
    }
    report.copied += copied;
    await prisma.$transaction((tx) =>
      audit.record(tx, {
        action: 'storage.copied',
        entityType: 'file',
        actorUserId: options.actorUserId ?? null,
        new: { from: fromName, to: toName, copied, rows: rows.length },
      }),
    );
  }
  return report;
}
