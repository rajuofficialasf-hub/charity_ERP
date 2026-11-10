import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { AuditWriter } from '../audit/audit-writer';
import type { PrismaService } from '../core/prisma.service';
import { type Bucket, knownBucket, type StorageDriver } from './types';

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
  /** Rows read and audited together. */
  batchSize?: number;
  /** The system actor the audit entries name. */
  actorUserId?: string | null;
}

export interface CopyReport {
  /** Rows on the source driver before the run. */
  pending: number;
  copied: number;
  /** Rows on the source driver after the run; the switch waits until this is 0. */
  remaining: number;
  /** Rows whose object is not on the source driver; they stay there. */
  missing: string[];
  /** Rows whose copy did not arrive whole or could not be read or written; they stay there. */
  failed: string[];
  /** Rows whose upload is still being processed (its thumbnails may come later); copied on a later run. */
  unprocessed: string[];
  /** Rows copied without a thumbnail the source did not have. */
  thumbnailsMissing: string[];
}

interface Row {
  id: string;
  bucket: string;
  objectKey: string;
  sha256: string;
  virusScan: string;
  thumbnailSmallKey: string | null;
  thumbnailMediumKey: string | null;
}

type Outcome = 'copied' | 'missing' | 'failed';

/** The SHA-256 of what a driver holds, read back in a stream. */
async function hashOf(driver: StorageDriver, bucket: Bucket, key: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of await driver.get(bucket, key)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/**
 * Copies one object and proves the target holds it whole: the same size, and for the file itself
 * the SHA-256 its row recorded at upload, read back from the target.
 */
async function copyObject(
  from: StorageDriver,
  to: StorageDriver,
  bucket: Bucket,
  key: string,
  sha256?: string,
): Promise<Outcome> {
  let source: Readable | undefined;
  try {
    const info = await from.stat(bucket, key);
    if (!info) return 'missing';
    source = await from.get(bucket, key);
    await to.put(bucket, key, source, {
      contentType: info.contentType ?? 'application/octet-stream',
      size: info.size,
    });
    const copied = await to.stat(bucket, key);
    if (copied?.size !== info.size) return 'failed';
    if (sha256 !== undefined && (await hashOf(to, bucket, key)) !== sha256) return 'failed';
    return 'copied';
  } catch {
    source?.destroy();
    return 'failed';
  }
}

/**
 * Copies the files of one storage driver to another, row by row in id order: each object and its
 * thumbnails are streamed across and checked (size, and the file's SHA-256) before the row is
 * marked as held by the target, so a stopped run is simply run again and a row is never pointed at
 * a damaged copy. A row whose upload is still being processed waits for a later run, since its
 * thumbnails are written after the upload. The source is never changed. Each batch writes one audit
 * entry with its counts. The switch of STORAGE_DRIVER waits for a run that leaves nothing behind
 * with the app stopped (docs/ops/RUNBOOK.md, "Moving the files to the NAS").
 */
export async function copyFiles(options: CopyOptions): Promise<CopyReport> {
  const { prisma, audit, from, fromName, to, toName } = options;
  if (fromName === toName) throw new Error('the copy needs two different drivers');
  const batchSize = options.batchSize ?? 100;
  const onSource = () => prisma.file.count({ where: { storageDriver: fromName } });
  const pending = await onSource();
  const report: CopyReport = {
    pending,
    copied: 0,
    remaining: pending,
    missing: [],
    failed: [],
    unprocessed: [],
    thumbnailsMissing: [],
  };
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
        sha256: true,
        virusScan: true,
        thumbnailSmallKey: true,
        thumbnailMediumKey: true,
      },
    });
    if (rows.length === 0) break;
    seen += rows.length;
    after = rows[rows.length - 1]!.id;

    let copied = 0;
    try {
      for (const row of rows) {
        if (row.virusScan === 'pending') {
          report.unprocessed.push(row.id);
          continue;
        }
        let bucket: Bucket;
        try {
          bucket = knownBucket(row.bucket);
        } catch {
          report.failed.push(row.id);
          continue;
        }
        const main = await copyObject(from, to, bucket, row.objectKey, row.sha256);
        if (main !== 'copied') {
          (main === 'missing' ? report.missing : report.failed).push(row.id);
          continue;
        }
        const thumbnails = [row.thumbnailSmallKey, row.thumbnailMediumKey].filter(
          (key): key is string => key !== null,
        );
        const results: Outcome[] = [];
        for (const key of thumbnails) results.push(await copyObject(from, to, bucket, key));
        if (results.includes('failed')) {
          report.failed.push(row.id);
          continue;
        }
        // a thumbnail the source lacks is reported, but keeps the photo itself on the source no longer
        if (results.includes('missing')) report.thumbnailsMissing.push(row.id);
        const moved = await prisma.file.updateMany({
          where: { id: row.id, storageDriver: fromName },
          data: { storageDriver: toName },
        });
        copied += moved.count;
      }
    } finally {
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
  }
  report.remaining = await onSource();
  return report;
}
