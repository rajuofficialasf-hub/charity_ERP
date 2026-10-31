import { isPendingPhoto, photoSlot } from '@css/shared/sync';
import { z } from 'zod';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Tx } from '../core/prisma.service';
import { uuidv7 } from '@css/shared';
import { ApiError } from '../i18n/api-error';

/**
 * Photos that still wait on the phone when a record syncs (docs/architecture/OFFLINE_SYNC.md
 * "Photo queue and resumable upload"): the text goes first, each photo answer travels as a slot
 * the application keeps in `pending_photos`, and the upload that arrives for that slot fills the
 * answer. A slot counts as answered for the required check, so the record is not held back.
 */

export const pendingSlotsSchema = z.array(z.string()).catch([]);

/** The slots an application still waits for, from the stored column. */
export function pendingSlotsOf(value: unknown): string[] {
  return pendingSlotsSchema.parse(value);
}

/** The answers without the waiting photos, and the slots those photos will fill. */
export function splitPendingPhotos(answers: readonly unknown[]): {
  answers: unknown[];
  pending: string[];
} {
  const kept: unknown[] = [];
  const pending: string[] = [];
  for (const answer of answers) {
    const a = answer as { fieldKey?: unknown; repeatIndex?: unknown; value?: unknown };
    if (a && typeof a.fieldKey === 'string' && isPendingPhoto(a.value))
      pending.push(photoSlot(a.fieldKey, typeof a.repeatIndex === 'number' ? a.repeatIndex : 0));
    else kept.push(answer);
  }
  return { answers: kept, pending: [...new Set(pending)] };
}

/** The field and the row a slot names. */
export function slotParts(slot: string): { fieldKey: string; repeatIndex: number } {
  const [fieldKey, row] = slot.split('#');
  return { fieldKey: fieldKey ?? slot, repeatIndex: row ? Number(row) : 0 };
}

/** The states in which the volunteer may still complete the record with a late photo. */
const OPEN_FOR_PHOTOS = new Set(['draft', 'needs_verification', 'submitted', 'under_review']);

/**
 * Fills a waiting slot of an application with the file that just arrived for it: the uploader
 * must own the application (or be a team member of its lead), the application must still be
 * open to its owner, and a gallery photo is refused where the project takes camera photos only.
 * A slot the application does not wait for leaves everything as it is. Answers whether a slot
 * was filled.
 */
export async function attachPendingPhoto(
  tx: Tx,
  audit: AuditWriter,
  input: {
    applicationId: string;
    slot: string;
    fileId: string;
    uploader: Principal;
    flags: readonly string[];
    now: Date;
  },
): Promise<boolean> {
  const row = await tx.application.findUnique({
    where: { id: input.applicationId },
    select: {
      id: true,
      projectId: true,
      formVersionId: true,
      status: true,
      ownerVolunteerId: true,
      createdByUserId: true,
      pendingPhotos: true,
    },
  });
  if (!row) return false;
  const pending = pendingSlotsOf(row.pendingPhotos);
  if (!pending.includes(input.slot)) return false;
  if (!(await owns(tx, row, input.uploader.userId)))
    throw new ApiError('permission.not_found', 404);
  if (!OPEN_FOR_PHOTOS.has(row.status)) throw new ApiError('conflict.locked_on_server', 409);
  if (input.flags.includes('gallery_under_camera_only'))
    throw new ApiError('file.source_not_allowed', 422);
  const { fieldKey, repeatIndex } = slotParts(input.slot);
  const field = await tx.formField.findFirst({
    where: { formVersionId: row.formVersionId, fieldKey },
    select: { id: true },
  });
  if (!field)
    throw new ApiError('validation.failed', 422, undefined, [
      { path: input.slot, code: 'validation.failed' },
    ]);
  await tx.applicationAnswer.deleteMany({
    where: { applicationId: row.id, fieldId: field.id, repeatIndex },
  });
  await tx.applicationAnswer.create({
    data: {
      id: uuidv7(),
      applicationId: row.id,
      fieldId: field.id,
      repeatIndex,
      value: { t: 'photo', v: [input.fileId] },
    },
  });
  await tx.application.update({
    where: { id: row.id },
    data: {
      pendingPhotos: pending.filter((s) => s !== input.slot),
      updatedAt: input.now,
      updatedBy: input.uploader.userId,
    },
  });
  await audit.record(tx, {
    action: 'application.photo_attached',
    entityType: 'application',
    entityId: row.id,
    new: { slot: input.slot, fileId: input.fileId },
  });
  return true;
}

/** The owner volunteer's user, the creator, or a team member of the owner's team on the project. */
async function owns(
  tx: Tx,
  row: { projectId: string; ownerVolunteerId: string | null; createdByUserId: string | null },
  userId: string,
): Promise<boolean> {
  if (row.createdByUserId === userId) return true;
  if (!row.ownerVolunteerId) return false;
  const owner = await tx.volunteer.findUnique({
    where: { id: row.ownerVolunteerId },
    select: { userId: true },
  });
  if (owner?.userId === userId) return true;
  const membership = await tx.volunteerTeam.count({
    where: {
      projectId: row.projectId,
      leadVolunteerId: row.ownerVolunteerId,
      removedAt: null,
      consentStatus: 'accepted',
      memberVolunteer: { userId },
    },
  });
  return membership > 0;
}
