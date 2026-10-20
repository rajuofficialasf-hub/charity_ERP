import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import type { Logger } from 'pino';
import type { PrismaService, Tx } from '../core/prisma.service';
import { readPhotoMetadata } from '../files/exif';
import { photoFlags, projectPhotoSource } from '../files/flags';
import {
  checkImage,
  differenceHash,
  NEAR_DUPLICATE_BITS,
  THUMBNAILS,
  thumbnail,
} from '../files/images-process';
import type { Scanner } from '../files/scanner';
import type { Bucket, StorageDriver } from '../storage';
import type { JobRunner } from './job-runner';

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
    if (!file) return { virusScan: 'missing' };
    if (DONE.has(file.virusScan)) return { virusScan: file.virusScan };
    const bucket = file.bucket as Bucket;
    const bytes = await buffer(await this.storage.get(bucket, file.objectKey));
    let scan: Awaited<ReturnType<Scanner['scan']>>;
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
    const photo = await this.photoParts(bytes);
    if (!photo) {
      await this.setScan(fileId, 'failed');
      this.logger.warn({ fileId }, 'photo not processed: refused before decoding or damaged');
      return { virusScan: 'failed' };
    }
    const small = thumbnailKey(file.objectKey, fileId, 's');
    const medium = thumbnailKey(file.objectKey, fileId, 'm');
    await this.storage.put(bucket, small, Readable.from([photo.small]), {
      contentType: 'image/jpeg',
      size: photo.small.length,
    });
    await this.storage.put(bucket, medium, Readable.from([photo.medium]), {
      contentType: 'image/jpeg',
      size: photo.medium.length,
    });
    // what the phone declared stays; the photo's own metadata fills only what is missing
    const capturedAt = file.capturedAt ?? photo.metadata.capturedAt;
    const gps = file.latitude !== null && file.longitude !== null ? null : photo.metadata.gps;
    const hasPosition = (file.latitude !== null && file.longitude !== null) || gps !== null;
    await this.prisma.$transaction(async (tx) => {
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
        hasPosition,
        recordCreatedAt: file.recordCreatedAt,
        receivedAt: file.uploadedAt,
        source: file.source,
        projectSource: file.projectId
          ? await projectPhotoSource(tx, file.projectId, file.kind)
          : null,
      });
      if (near.length || file.flags.includes('duplicate_suspect')) flags.push('duplicate_suspect');
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
    return { virusScan: scan };
  }

  /** The thumbnails, the hash and the metadata, or null when the photo may not be decoded. */
  private async photoParts(bytes: Buffer) {
    try {
      await checkImage(bytes);
      const [small, medium, hash, metadata] = await Promise.all([
        thumbnail(bytes, THUMBNAILS.small),
        thumbnail(bytes, THUMBNAILS.medium),
        differenceHash(bytes),
        readPhotoMetadata(bytes),
      ]);
      return { small, medium, hash, metadata };
    } catch (error) {
      this.logger.debug({ err: error }, 'photo refused');
      return null;
    }
  }

  private async setScan(fileId: string, virusScan: string): Promise<void> {
    await this.prisma.file.update({ where: { id: fileId }, data: { virusScan } });
  }
}
