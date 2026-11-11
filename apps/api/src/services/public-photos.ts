import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Logger } from 'pino';
import { uuidv7 } from '@css/shared';
import { PUBLIC_PHOTO_LIMITS } from '@css/shared/files';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { cleanImage, type CleanImage } from '../files/images.js';
import { ApiError } from '../i18n/api-error.js';
import { enqueueFileProcess, thumbnailKey } from '../jobs/file-process.js';
import type { JobRunner } from '../jobs/job-runner.js';
import type { StorageDriver } from '../storage/index.js';
import { readDefinition } from './forms.js';
import { type OpenLink, resolveOpenLink } from './public-link-rules.js';

const BUCKET = 'photos' as const;
const KIND = 'form_photo' as const;
const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
/** The link entity a photo waits under until a submission claims it; never readable through the file routes. */
const PENDING_CLAIM = 'public_submission' as const;
const HOUR_SECONDS = 3600;

/** The folder of a link's photos: the token is hashed, so a key never carries the capability. */
function linkFolder(token: string): string {
  return `public/${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}

/**
 * The photos of a public application before and after its submission (docs/architecture/
 * FILES_AND_DOCUMENTS.md, "Upload pipeline", the public path): one request per photo bound to the
 * link and the applicant's client id, cleaned of its metadata, scanned like every file; at most
 * five per submission and a bounded number per link until the submission claims them; whatever no
 * submission claims within a day is swept away. The applicant learns the file id and nothing else.
 */
export class PublicPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly audit: AuditWriter,
    private readonly jobs: JobRunner,
    private readonly logger: Logger,
    private readonly clock: Clock,
  ) {}

  async upload(input: {
    token: string;
    clientUuid: string;
    fieldKey: string;
    body: unknown;
  }): Promise<{ fileId: string }> {
    const link = await resolveOpenLink(this.prisma, this.clock.now(), input.token);
    const definition = await readDefinition(this.prisma, link.version.id, 'volunteer');
    const field = definition.sections
      .flatMap((s) => s.fields)
      .find((f) => f.fieldKey === input.fieldKey && f.type === 'photo');
    if (!field)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: input.fieldKey, code: 'form.unknown_field' },
      ]);
    const image = imageOf(input.body);
    const id = uuidv7();
    const key = `${linkFolder(input.token)}/${input.clientUuid}/${id}.${EXTENSION[image.mime]}`;
    await this.storage.put(BUCKET, key, Readable.from(image.bytes), {
      contentType: image.mime,
      size: image.bytes.length,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        // the counts and the insert under one lock per client id and one per link, so parallel
        // uploads cannot pass the ceilings together or take the same position
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'public-photo:' + input.clientUuid}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'public-link:' + linkFolder(input.token)}))`;
        await this.assertRoom(tx, input.token, input.clientUuid);
        await tx.file.create({
          data: {
            id,
            bucket: BUCKET,
            storageDriver: this.storage.name,
            objectKey: key,
            kind: KIND,
            mime: image.mime,
            sizeBytes: image.bytes.length,
            sha256: createHash('sha256').update(image.bytes).digest('hex'),
            projectId: link.projectId,
            source: 'gallery',
            uploadedBy: null,
            clientUuid: input.clientUuid,
          },
        });
        await tx.fileLink.create({
          data: {
            id: uuidv7(),
            fileId: id,
            entityType: PENDING_CLAIM,
            entityId: input.clientUuid,
            slot: input.fieldKey,
            position: await tx.fileLink.count({
              where: { entityType: PENDING_CLAIM, entityId: input.clientUuid },
            }),
          },
        });
        // the scan and the thumbnails, as for every upload; the photo is viewable once cleared
        await enqueueFileProcess(this.jobs, tx, id);
        await this.audit.record(tx, {
          action: 'file.uploaded',
          entityType: 'file',
          entityId: id,
          clientUuid: input.clientUuid,
          new: { slot: input.fieldKey, size: image.bytes.length, publicLink: true },
        });
      });
    } catch (error) {
      await this.removeQuietly(key);
      throw error;
    }
    return { fileId: id };
  }

  /**
   * Binds the photos a submission names to the application, inside the submission's transaction:
   * every id must be a photo this client id uploaded through this link and nothing has claimed.
   */
  async claim(
    tx: Tx,
    link: OpenLink,
    clientUuid: string,
    applicationId: string,
    named: { fieldKey: string; fileIds: string[] }[],
  ): Promise<void> {
    if (!named.some((n) => n.fileIds.length)) return;
    const total = named.reduce((n, item) => n + item.fileIds.length, 0);
    if (total > PUBLIC_PHOTO_LIMITS.perSubmission)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: named[0]!.fieldKey, code: 'public.photo_limit' },
      ]);
    const own = await tx.fileLink.findMany({
      where: {
        entityType: PENDING_CLAIM,
        entityId: clientUuid,
        file: {
          deletedAt: null,
          projectId: link.projectId,
          objectKey: { startsWith: `${linkFolder(link.token)}/` },
        },
      },
      select: { id: true, fileId: true, slot: true },
    });
    const byFile = new Map(own.map((l) => [l.fileId, l]));
    const claimed: string[] = [];
    for (const { fieldKey, fileIds } of named)
      for (const fileId of fileIds) {
        const row = byFile.get(fileId);
        if (!row || row.slot !== fieldKey)
          throw new ApiError('validation.failed', 422, undefined, [
            { path: fieldKey, code: 'public.photo_unknown' },
          ]);
        claimed.push(row.id);
      }
    await tx.fileLink.updateMany({
      where: { id: { in: claimed } },
      data: { entityType: 'application', entityId: applicationId },
    });
  }

  /** Room for one more photo: five per client id, and the link's unclaimed ceiling. */
  private async assertRoom(tx: Tx, token: string, clientUuid: string): Promise<void> {
    const [mine, [unclaimed]] = await Promise.all([
      tx.fileLink.count({
        where: { entityType: PENDING_CLAIM, entityId: clientUuid, file: { deletedAt: null } },
      }),
      tx.$queryRaw<{ files: bigint; bytes: bigint | null }[]>`
        SELECT count(*) AS files, sum(f.size_bytes) AS bytes
          FROM files f
          JOIN file_links l ON l.file_id = f.id AND l.entity_type = ${PENDING_CLAIM}
         WHERE f.deleted_at IS NULL AND f.object_key LIKE ${`${linkFolder(token)}/%`}`,
    ]);
    if (mine >= PUBLIC_PHOTO_LIMITS.perSubmission)
      throw new ApiError('public.photo_limit', 429, undefined, undefined, HOUR_SECONDS);
    if (
      Number(unclaimed?.files ?? 0) >= PUBLIC_PHOTO_LIMITS.perLinkFiles ||
      Number(unclaimed?.bytes ?? 0) >= PUBLIC_PHOTO_LIMITS.perLinkBytes
    )
      throw new ApiError('public.link_full', 429, undefined, undefined, HOUR_SECONDS);
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.remove(BUCKET, key);
    } catch (error) {
      // the row is gone or never existed, so the object is unreachable; logged for the IT team
      this.logger.warn({ err: error, bucket: BUCKET }, 'public photo object not removed');
    }
  }
}

/**
 * Removes the public photos no submission claimed within a day: the rows go through the narrow
 * database function (the only way a file row is deleted), then the objects and thumbnails they
 * named, a batch at a time until the backlog is empty. Idempotent: a second run finds nothing.
 */
export async function sweepUnclaimedPublicPhotos(
  prisma: PrismaService,
  storage: StorageDriver,
  logger: Logger,
  now: Date,
  batch = 200,
  maxBatches = 20,
): Promise<number> {
  const before = new Date(now.getTime() - PUBLIC_PHOTO_LIMITS.unclaimedLifeMs);
  let removed = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    const rows = await prisma.$queryRaw<
      {
        file_id: string;
        object_key: string;
        thumbnail_small_key: string | null;
        thumbnail_medium_key: string | null;
      }[]
    >`SELECT file_id, object_key, thumbnail_small_key, thumbnail_medium_key
        FROM purge_unclaimed_public_photos(${before}, ${batch}::int)`;
    for (const row of rows) {
      const keys = [
        row.object_key,
        row.thumbnail_small_key ?? thumbnailKey(row.object_key, row.file_id, 's'),
        row.thumbnail_medium_key ?? thumbnailKey(row.object_key, row.file_id, 'm'),
      ];
      for (const key of keys) {
        try {
          await storage.remove(BUCKET, key);
        } catch (error) {
          logger.warn({ err: error, key }, 'unclaimed public photo object not removed');
        }
      }
    }
    removed += rows.length;
    if (rows.length < batch) break;
  }
  return removed;
}

/** The raw body as a cleaned JPEG or PNG, or 415 `file.type_not_allowed`. */
function imageOf(body: unknown): CleanImage {
  const image = Buffer.isBuffer(body) ? cleanImage(body) : null;
  if (!image) throw new ApiError('file.type_not_allowed', 415);
  return image;
}
