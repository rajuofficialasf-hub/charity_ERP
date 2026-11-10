import { FILE_FIELD_TYPES, type FormDefinition } from '@css/shared/forms';
import { isPendingPhoto, photoSlot } from '@css/shared/sync';
import { z } from 'zod';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Tx } from '../core/prisma.service.js';
import { uuidv7 } from '@css/shared';
import { ApiError } from '../i18n/api-error.js';

/**
 * Photos that still wait on the phone when a record syncs (docs/architecture/OFFLINE_SYNC.md
 * "Photo queue and resumable upload"): the text goes first, each photo answer travels as a slot
 * the application keeps in `pending_photos`, and the upload that arrives for that slot fills the
 * answer. A slot counts as answered for the required check, so the record is not held back.
 */

const pendingSlotsSchema = z.array(z.string()).catch([]);

/** The slots an application still waits for, from the stored column. */
export function pendingSlotsOf(value: unknown): string[] {
  return pendingSlotsSchema.parse(value);
}

const answerShape = z.object({
  fieldKey: z.string(),
  repeatIndex: z.number().int().min(0).optional(),
  value: z.unknown(),
});

/** The answers without the waiting photos, and the slots those photos will fill. */
export function splitPendingPhotos(answers: readonly unknown[]): {
  answers: unknown[];
  pending: string[];
} {
  const kept: unknown[] = [];
  const pending: string[] = [];
  for (const answer of answers) {
    const a = answerShape.safeParse(answer);
    if (a.success && isPendingPhoto(a.data.value))
      pending.push(photoSlot(a.data.fieldKey, a.data.repeatIndex ?? 0));
    else kept.push(answer);
  }
  return { answers: kept, pending: [...new Set(pending)] };
}

/** The field and the row a slot names. */
export function slotParts(slot: string): { fieldKey: string; repeatIndex: number } {
  const [fieldKey, row] = slot.split('#');
  return { fieldKey: fieldKey ?? slot, repeatIndex: row ? Number(row) : 0 };
}

/** Rows of a repeat group beyond this never carry a photo slot. */
const MAX_SLOT_ROW = 200;

/** The keys of the photo fields a definition holds, as the audience it was read for sees them. */
export function photoFieldKeys(definition: FormDefinition): Set<string> {
  return new Set(
    definition.sections.flatMap((s) =>
      s.fields
        .filter((f) => (FILE_FIELD_TYPES as readonly string[]).includes(f.type))
        .map((f) => f.fieldKey),
    ),
  );
}

/**
 * Whether every slot names a photo field of the definition (the volunteer's reading of the form,
 * so an official-only or a locked question can never be a "photo still on the phone") and a row
 * within reason. The slot that fails is named.
 */
export function wrongSlot(slots: readonly string[], definition: FormDefinition): string | null {
  const photos = photoFieldKeys(definition);
  for (const slot of slots) {
    const { fieldKey, repeatIndex } = slotParts(slot);
    if (
      !photos.has(fieldKey) ||
      !Number.isInteger(repeatIndex) ||
      repeatIndex < 0 ||
      repeatIndex > MAX_SLOT_ROW
    )
      return slot;
  }
  return null;
}

/** The validation path of a slot's answer (`field[row]` inside a repeat group, `field` outside). */
export function slotPath(slot: string, inGroup: boolean): string {
  const { fieldKey, repeatIndex } = slotParts(slot);
  return inGroup ? `${fieldKey}[${repeatIndex}]` : fieldKey;
}

/** The states in which the volunteer may still complete the record with a late photo. */
const OPEN_FOR_PHOTOS = new Set(['draft', 'needs_verification', 'submitted', 'under_review']);

/**
 * Fills a waiting slot of an application with the file that just arrived for it. The uploader
 * must own the application (or be a team member of its lead): anyone else is refused and the
 * upload with them. An application the office already decided on, a gallery photo where the
 * project takes camera photos only, or a slot that is not a volunteer's photo question leaves the
 * file stored and the slot waiting, on record, so the finalize of the upload never fails for a
 * state the phone could not know; the phone learns it from the record. A slot the application
 * does not wait for leaves everything as it is. Answers whether a slot was filled.
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
  const notAttached = async (reason: string) => {
    await audit.record(tx, {
      action: 'application.photo_not_attached',
      entityType: 'application',
      entityId: row.id,
      new: { slot: input.slot, fileId: input.fileId, reason },
    });
    return false;
  };
  if (!OPEN_FOR_PHOTOS.has(row.status)) return notAttached('locked_on_server');
  if (input.flags.includes('gallery_under_camera_only')) return notAttached('source_not_allowed');
  const { fieldKey, repeatIndex } = slotParts(input.slot);
  const field = await tx.formField.findFirst({
    where: { formVersionId: row.formVersionId, fieldKey },
    select: { id: true, type: true, formSection: { select: { visibility: true } } },
  });
  if (
    !field ||
    !(FILE_FIELD_TYPES as readonly string[]).includes(field.type) ||
    field.formSection.visibility !== 'volunteer'
  )
    return notAttached('not_a_photo_question');
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
