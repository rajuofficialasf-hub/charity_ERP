import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Logger } from 'pino';
import { uuidv7 } from '@css/shared';
import type { PhotoSlot, PhotoSource } from '@css/shared/registration';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService, Tx } from '../core/prisma.service';
import { cleanImage, type CleanImage } from '../files/images';
import { ApiError } from '../i18n/api-error';
import type { StorageDriver } from '../storage';
import type { RegistrationService } from './registration';

const BUCKET = 'profiles' as const;
const KIND: Record<PhotoSlot, 'profile_photo' | 'nid_photo'> = {
  photo: 'profile_photo',
  nid_photo: 'nid_photo',
};
const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;

/**
 * The photo and the NID photo of a registration (plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R4; DECISION_LOG D-087):
 * a JPEG or PNG of at most 2 MB, metadata stripped, stored privately under a key of ids only. The
 * object is written first and removed again when the database write fails (NS-06). Files stay
 * `virus_scan = pending` until the scanner of T2.1.
 */
export class RegistrationPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly audit: AuditWriter,
    private readonly registration: RegistrationService,
    private readonly logger: Logger,
  ) {}

  /** Upload to a verified draft; a second upload to the slot replaces the first. */
  async forDraft(
    input: { registrationId: string; slot: PhotoSlot; source: PhotoSource; body: unknown },
    token: string | undefined,
  ): Promise<{ fileId: string }> {
    const draft = await this.registration.ownedDraft(input.registrationId, token);
    const image = imageOf(input.body);
    const previous = input.slot === 'photo' ? draft.photoFileId : draft.nidPhotoFileId;
    const { fileId, replaced } = await this.store(
      image,
      `registration/${draft.id}`,
      { slot: input.slot, source: input.source, uploadedBy: null },
      async (tx, id) => {
        await tx.registrationDraft.update({
          where: { id: draft.id },
          data: input.slot === 'photo' ? { photoFileId: id } : { nidPhotoFileId: id },
        });
        if (!previous) return [];
        // the replaced photo: only through the narrow database function (no DELETE for the API)
        return tx.$queryRaw<{ bucket: string; object_key: string }[]>`
          SELECT bucket, object_key FROM discard_registration_photo(${previous}::uuid)`;
      },
      { registrationId: draft.id },
    );
    for (const old of replaced) await this.removeQuietly(old.object_key);
    return { fileId };
  }

  /** Upload for an open own change request that names the photo field (U7, U8 store the id). */
  async forOwnRequest(
    principal: Principal,
    input: { requestId: string; slot: PhotoSlot; source: PhotoSource; body: unknown },
  ): Promise<{ fileId: string }> {
    const request = await this.prisma.volunteerChangeRequest.findFirst({
      where: {
        id: input.requestId,
        field: input.slot,
        status: 'open',
        volunteer: { userId: principal.userId },
      },
      select: { id: true },
    });
    if (!request) throw new ApiError('permission.not_found', 404);
    const image = imageOf(input.body);
    const { fileId } = await this.store(
      image,
      `users/${principal.userId}`,
      { slot: input.slot, source: input.source, uploadedBy: principal.userId },
      async () => [],
      { requestId: request.id },
    );
    return { fileId };
  }

  private async store(
    image: CleanImage,
    folder: string,
    file: { slot: PhotoSlot; source: PhotoSource; uploadedBy: string | null },
    link: (tx: Tx, fileId: string) => Promise<{ bucket: string; object_key: string }[]>,
    auditRef: Record<string, string>,
  ): Promise<{ fileId: string; replaced: { bucket: string; object_key: string }[] }> {
    const id = uuidv7();
    const key = `${folder}/${id}.${EXTENSION[image.mime]}`;
    await this.storage.put(BUCKET, key, Readable.from(image.bytes), {
      contentType: image.mime,
      size: image.bytes.length,
    });
    try {
      const replaced = await this.prisma.$transaction(async (tx) => {
        await tx.file.create({
          data: {
            id,
            bucket: BUCKET,
            objectKey: key,
            kind: KIND[file.slot],
            mime: image.mime,
            sizeBytes: image.bytes.length,
            sha256: createHash('sha256').update(image.bytes).digest('hex'),
            source: file.source,
            uploadedBy: file.uploadedBy,
          },
        });
        const old = await link(tx, id);
        await this.audit.record(tx, {
          action: 'file.uploaded',
          entityType: 'file',
          entityId: id,
          new: { slot: file.slot, size: image.bytes.length, ...auditRef },
        });
        return old;
      });
      return { fileId: id, replaced };
    } catch (error) {
      await this.removeQuietly(key);
      throw error;
    }
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.remove(BUCKET, key);
    } catch (error) {
      // the row is gone or never existed, so the object is unreachable; logged for the IT team
      this.logger.warn({ err: error, bucket: BUCKET }, 'photo object not removed');
    }
  }
}

/** The raw body as a cleaned JPEG or PNG, or 415 `file.type_not_allowed`. */
function imageOf(body: unknown): CleanImage {
  const image = Buffer.isBuffer(body) ? cleanImage(body) : null;
  if (!image) throw new ApiError('file.type_not_allowed', 415);
  return image;
}
