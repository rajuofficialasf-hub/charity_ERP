import { z } from 'zod';
import { dateTime } from '../jsonb/common.js';
import { BATCH_MAX_RECORDS } from './constants.js';
import { SYNC_RESULTS } from './outbox.js';

/**
 * The kinds a phone may send in a batch and the answer for each
 * (docs/architecture/OFFLINE_SYNC.md "Batch sync endpoint"); each kind's payload is checked by
 * the service that handles it.
 */
export const SYNC_RECORD_KINDS = [
  'application_draft',
  'application_update',
  'application_submit',
  'field_update',
] as const;
export type SyncRecordKind = (typeof SYNC_RECORD_KINDS)[number];

export const syncRecordSchema = z.strictObject({
  clientUuid: z.uuid(),
  kind: z.enum(SYNC_RECORD_KINDS),
  /** The server id of the application or unlock the record acts on; absent for a new draft. */
  target: z.uuid().nullable().optional(),
  projectId: z.uuid(),
  formVersionId: z.uuid(),
  /** The ETag the edit started from, so the server can tell a plain update from a conflict. */
  baseVersion: z.string().max(64).nullable().optional(),
  /** Validated by the service of the record's kind. */
  payload: z.record(z.string(), z.unknown()),
  clientCreatedAt: dateTime,
  clientUpdatedAt: dateTime,
  /** Client ids this record needs synced first. */
  dependencies: z.array(z.uuid()).max(BATCH_MAX_RECORDS).optional(),
});
export type SyncRecord = z.infer<typeof syncRecordSchema>;

export const syncBatchRequestSchema = z.strictObject({
  deviceTime: dateTime,
  records: z.array(syncRecordSchema).min(1).max(BATCH_MAX_RECORDS),
  /** The records still waiting on the device after this batch, for the sessions screens. */
  pendingAfter: z.number().int().min(0).max(100_000).optional(),
});
export type SyncBatchRequest = z.infer<typeof syncBatchRequestSchema>;

/** What the server kept when a record met a change made elsewhere. */
export const syncConflictSchema = z.strictObject({
  kept: z.enum(['server', 'client']),
  /** The server's value of a locked field, only when the caller may see that field. */
  serverValue: z.unknown().optional(),
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;

export const rowResultSchema = z.strictObject({
  clientUuid: z.uuid(),
  result: z.enum(SYNC_RESULTS),
  code: z.string().nullable().optional(),
  /** The values the message of a refusal names, such as the question an answer belongs to. */
  params: z.record(z.string(), z.string()).optional(),
  serverId: z.uuid().nullable().optional(),
  status: z.string().nullable().optional(),
  /** Photo slots the server still waits for after this record. */
  pendingPhotos: z.number().int().min(0).optional(),
  conflict: syncConflictSchema.optional(),
});
export type RowResult = z.infer<typeof rowResultSchema>;

export const syncBatchResponseSchema = z.strictObject({
  serverTime: dateTime,
  results: z.array(rowResultSchema),
});
export type SyncBatchResponse = z.infer<typeof syncBatchResponseSchema>;

/** The answer of a file field whose photo still waits on the phone. */
export const pendingPhotoValueSchema = z.strictObject({
  pendingPhoto: z.literal(true),
  slot: z.string(),
});
export type PendingPhotoValue = z.infer<typeof pendingPhotoValueSchema>;

/** The slot of a pending photo: the field key and, inside a repeat group, the row. */
export function photoSlot(fieldKey: string, repeatIndex = 0): string {
  return repeatIndex ? `${fieldKey}#${repeatIndex}` : fieldKey;
}

export function pendingPhotoAnswer(fieldKey: string, repeatIndex = 0) {
  return {
    fieldKey,
    repeatIndex,
    value: { pendingPhoto: true as const, slot: photoSlot(fieldKey, repeatIndex) },
  };
}

export function isPendingPhoto(value: unknown): value is PendingPhotoValue {
  return pendingPhotoValueSchema.safeParse(value).success;
}
