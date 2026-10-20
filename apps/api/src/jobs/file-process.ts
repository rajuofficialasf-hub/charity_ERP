import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import type { Logger } from 'pino';
import type { PrismaService, Tx } from '../core/prisma.service';
import { UPLOAD_RULES } from '@css/shared/files';
import { readPhotoMetadata } from '../files/exif';
import { photoFlags, projectPhotoSource } from '../files/flags';
import {
  checkImage,
  differenceHash,
  ImageRefused,
  NEAR_DUPLICATE_BITS,
  THUMBNAILS,
  thumbnail,
} from '../files/images-process';
import type { ScanResult, Scanner } from '../files/scanner';
import { knownBucket, type StorageDriver } from '../storage';
import { Prisma } from '../generated/prisma/client';
import type { JobRunner } from './job-runner';
import { JOBS_SCHEMA } from './queues';

/** The queue of photo post-processing and duplicate hashing (jobs/queues.ts). */
export const FILE_PROCESS_QUEUE = 'photos' as const;

export interface FileProcessJob {
  fileId: string;
}

/** A file in one of these states has been processed; a second run changes nothing. */
const DONE = new Set(['clean', 'skipped', 'infected']);

/** Enqueues the processing of a new file in the transaction that wrote it, once per file. */
export function enqueueFileProcess(jobs: JobRunner, tx: Tx, fileId: string): Promise<unknown> {
  return jobs.enqueue<FileProcessJob>(FILE_PROCESS_QUEUE, { fileId }, { tx, singletonKey: fileId });
}

/**
 * Queues every file the scan has not cleared yet: files stored before the processing existed (the
 * registration photos), files whose job was lost, and files that ended `failed` (a scanner outage
 * longer than the retries, or a photo the processing refused, which is then refused again). Run
 * when the consumers start, a page at a time; a file whose job still waits or runs is skipped.
 */
export async function enqueuePendingFiles(
  prisma: PrismaService,
  jobs: JobRunner,
  pageSize = 500,
): Promise<number> {
  let queued = 0;
  let after: string | undefined;
  for (;;) {
    const page = await prisma.file.findMany({
      where: {
        virusScan: { in: ['pending', 'failed'] },
        kind: { not: 'export' },
        deletedAt: null,
        ...(after ? { id: { gt: after } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: pageSize,
    });
    // a file whose job still waits or runs is not queued again
    const open = page.length
      ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT data->>'fileId' AS id FROM ${Prisma.raw(`${JOBS_SCHEMA}.job`)}
           WHERE name = ${FILE_PROCESS_QUEUE} AND state IN ('created', 'retry', 'active')
             AND data->>'fileId' = ANY (${page.map((f) => f.id)}::text[])`)
      : [];
    const waiting = new Set(open.map((o) => o.id));
    const fresh = page.filter((file) => !waiting.has(file.id));
    await Promise.all(
      fresh.map((file) =>
        jobs.enqueue<FileProcessJob>(
          FILE_PROCESS_QUEUE,
          { fileId: file.id },
          { singletonKey: file.id },
        ),
      ),
    );
    queued += fresh.length;
    if (page.length < pageSize) return queued;
    after = page[page.length - 1]!.id;
  }
}

/** Where the thumbnails of a stored object go: a `thumb` folder beside it. */
export function thumbnailKey(objectKey: string, fileId: string, size: 's' | 'm'): string {
  const folder = objectKey.slice(0, objectKey.lastIndexOf('/'));
  return `${folder}/thumb/${fileId}-${size}.jpg`;
}

/**
 * The processing of one uploaded file (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload
 * pipeline" step 5): the virus scan, then for a photo the capture time and position from its own
 * metadata where the phone sent none, the two thumbnails, the difference hash and the near
 * duplicates in the same project, and the data-quality flags. A scanner that fails leaves the file
 * `failed` and the job is retried; a photo the processing may not decode (over 40 megapixels,
 * another format, damaged) ends `failed`, never clean. Idempotent: a processed file is left alone.
 */
export class FileProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly scanner: Scanner,
    private readonly logger: Logger,
  ) {}

  async process(fileId: string): Promise<{ virusScan: string }> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt) return { virusScan: 'missing' };
    if (DONE.has(file.virusScan)) return { virusScan: file.virusScan };
    const bucket = knownBucket(file.bucket);
    const bytes = await buffer(await this.storage.get(bucket, file.objectKey));
    let scan: ScanResult;
    try {
      scan = await this.scanner.scan(bytes);
    } catch (error) {
      // never clean on a failure: the file stays quarantined and the job is tried again
      await this.setScan(fileId, 'failed');
      this.logger.warn({ err: error, fileId, scanner: this.scanner.name }, 'virus scan failed');
      throw error;
    }
    if (scan === 'infected') {
      await this.setScan(fileId, 'infected');
      this.logger.error({ event: 'security.malware_detected', fileId }, 'infected file blocked');
      return { virusScan: 'infected' };
    }
    if (!file.mime.startsWith('image/') || file.kind === 'document') {
      await this.setScan(fileId, scan);
      return { virusScan: scan };
    }
    const photo = await this.photoParts(fileId, bytes);
    if (!photo) {
      await this.setScan(fileId, 'failed');
      return { virusScan: 'failed' };
    }
    const small = thumbnailKey(file.objectKey, fileId, 's');
    const medium = thumbnailKey(file.objectKey, fileId, 'm');
    for (const [key, image] of [
      [small, photo.small],
      [medium, photo.medium],
    ] as const)
      await this.storage.put(bucket, key, Readable.from([image]), {
        contentType: 'image/jpeg',
        size: image.length,
      });
    // the photo's own capture time wins over a declared one; a declared position stays (the
    // phone's location service at capture), the photo's own fills one that is missing
    const declaredPosition = file.latitude !== null && file.longitude !== null;
    const capturedAt = photo.metadata.capturedAt ?? file.capturedAt;
    const declaredElsewhere =
      !!photo.metadata.capturedAt &&
      !!file.capturedAt &&
      Math.abs(photo.metadata.capturedAt.getTime() - file.capturedAt.getTime()) >
        UPLOAD_RULES.staleCaptureMs;
    const gps = declaredPosition ? null : photo.metadata.gps;
    try {
      await this.prisma.$transaction(async (tx) => {
        // one file of a project at a time, so two near copies processed together see each other
        if (file.projectId)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${file.projectId}, 2))`;
        const [current] = await tx.$queryRaw<{ flags: string[] }[]>`
          SELECT flags FROM files WHERE id = ${fileId}::uuid FOR UPDATE`;
        const near = file.projectId
          ? await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM files
               WHERE project_id = ${file.projectId}::uuid AND id <> ${fileId}::uuid
                 AND phash IS NOT NULL AND deleted_at IS NULL
                 AND bit_count((phash # ${photo.hash})::bit(64)) <= ${NEAR_DUPLICATE_BITS}`
          : [];
        const flags: string[] = photoFlags({
          kind: file.kind,
          mime: file.mime,
          capturedAt,
          hasPosition: declaredPosition || gps !== null,
          recordCreatedAt: file.recordCreatedAt,
          receivedAt: file.uploadedAt,
          source: file.source,
          projectSource: file.projectId
            ? await projectPhotoSource(tx, file.projectId, file.kind)
            : null,
        });
        // a declared time far from the photo's own says the photo is not the one it claims
        if (declaredElsewhere && !flags.includes('stale_capture')) flags.push('stale_capture');
        if (near.length || current?.flags.includes('duplicate_suspect'))
          flags.push('duplicate_suspect');
        await tx.file.update({
          where: { id: fileId },
          data: {
            virusScan: scan,
            capturedAt,
            ...(gps ? { latitude: gps.lat, longitude: gps.lng } : {}),
            flags,
            phash: photo.hash,
            thumbnailSmallKey: small,
            thumbnailMediumKey: medium,
          },
        });
        if (near.length)
          await tx.$executeRaw`
            UPDATE files SET flags = array_append(flags, 'duplicate_suspect')
             WHERE id = ANY (${near.map((n) => n.id)}::uuid[])
               AND NOT ('duplicate_suspect' = ANY (flags))`;
      });
    } catch (error) {
      // the job is tried again and writes the same keys; until then nothing points at them
      for (const key of [small, medium])
        await this.storage.remove(bucket, key).catch(() => undefined);
      throw error;
    }
    return { virusScan: scan };
  }

  /**
   * The thumbnails, the hash and the metadata, or null when the photo may not be decoded: refused
   * from its header (over 40 megapixels, another format) or damaged. Decoded once: the small
   * thumbnail and the hash come from the medium one, which bounds the worker's memory.
   */
  private async photoParts(fileId: string, bytes: Buffer) {
    try {
      await checkImage(bytes);
      const medium = await thumbnail(bytes, THUMBNAILS.medium);
      const small = await thumbnail(medium, THUMBNAILS.small);
      const hash = await differenceHash(medium);
      const metadata = await readPhotoMetadata(bytes);
      return { small, medium, hash, metadata };
    } catch (error) {
      const reason = error instanceof ImageRefused ? error.reason : 'damaged';
      this.logger.warn({ fileId, reason }, 'photo not processed; it stays quarantined');
      return null;
    }
  }

  /** Queues the files still waiting for their scan (see `enqueuePendingFiles`). */
  queuePending(jobs: JobRunner): Promise<number> {
    return enqueuePendingFiles(this.prisma, jobs);
  }

  private async setScan(fileId: string, virusScan: ScanResult | 'failed'): Promise<void> {
    await this.prisma.file.update({ where: { id: fileId }, data: { virusScan } });
  }
}
