import { uuidv7 } from '@css/shared';
import type { FileSource } from '@css/shared/files';
import type { Answer } from '@css/shared/forms';
import {
  isTransientStatus,
  nextRetryAt,
  pendingPhotoAnswer,
  PHOTO_BUDGET_BYTES,
  PHOTO_WARN_RATIO,
  RETRY_EXHAUSTED,
  retryExhausted,
} from '@css/shared/sync';
import { ApiFailure, deviceInfo } from '../lib/api';
import { uploadFile, type UploadOptions } from '../lib/uploads';
import { open, seal } from './crypto';
import { offlineDb, type PhotoRow } from './db';
import { requireDataKey } from './keys';

/**
 * The photo queue (docs/architecture/OFFLINE_SYNC.md, photo queue and resumable upload): a photo
 * taken for a record the server does not know yet waits here, its bytes and its capture facts
 * sealed in one block, and goes up through the chunked upload once the record has its server
 * id. The queue has a budget by platform; at four fifths the screens warn, at the top a new photo
 * is refused until space is freed. An uploaded photo stays, so its preview works without network,
 * until the person frees space or the record leaves the phone.
 */

/** What a photo carries beside its bytes. */
export interface PhotoFacts {
  name: string;
  mime: string;
  source: FileSource;
  capturedAt?: string;
  gps?: { lat: number; lng: number };
}

export interface QueueUsage {
  usedBytes: number;
  budgetBytes: number;
  level: 'ok' | 'warn' | 'full';
}

/** The message key of a photo refused because the queue is full. */
export const PHOTO_BUDGET_FULL = 'offline.photo_budget_full';

const WAITING_STATES = ['pending', 'uploading', 'failed'] as const;

/** The budget of this phone: iPhones hold less (the system may clear site data sooner). */
export function budgetBytes(): number {
  return deviceInfo().platform === 'ios' ? PHOTO_BUDGET_BYTES.ios : PHOTO_BUDGET_BYTES.android;
}

/** The facts and the bytes in one block: a length-prefixed JSON head, then the photo. */
function pack(facts: PhotoFacts, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = new TextEncoder().encode(JSON.stringify(facts));
  const out = new Uint8Array(4 + head.length + bytes.length);
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  out.set(bytes, 4 + head.length);
  return out;
}

function unpack(block: Uint8Array<ArrayBuffer>): { facts: PhotoFacts; bytes: Uint8Array } {
  const headLength = new DataView(block.buffer, block.byteOffset).getUint32(0);
  const facts = JSON.parse(
    new TextDecoder().decode(block.subarray(4, 4 + headLength)),
  ) as PhotoFacts;
  return { facts, bytes: block.subarray(4 + headLength) };
}

/** What the queue holds against its budget; `budget` is for the tests. */
export async function usage(budget = budgetBytes()): Promise<QueueUsage> {
  const rows = await offlineDb().photos.toArray();
  const usedBytes = rows.reduce((sum, r) => sum + r.size, 0);
  const level =
    usedBytes >= budget ? 'full' : usedBytes >= budget * PHOTO_WARN_RATIO ? 'warn' : 'ok';
  return { usedBytes, budgetBytes: budget, level };
}

/** Adds a photo for a record's slot; refused when the queue would pass its budget. */
export async function add(input: {
  clientUuid: string;
  slot: string;
  blob: Blob;
  facts: PhotoFacts;
  budget?: number;
}): Promise<string> {
  const { usedBytes, budgetBytes: budget } = await usage(input.budget);
  if (usedBytes + input.blob.size > budget) throw new Error(PHOTO_BUDGET_FULL);
  const key = requireDataKey();
  const bytes = new Uint8Array(await input.blob.arrayBuffer());
  const sealed = await seal(key, pack(input.facts, bytes));
  const row: PhotoRow = {
    id: uuidv7(),
    clientUuid: input.clientUuid,
    slot: input.slot,
    state: 'pending',
    size: input.blob.size,
    attempts: 0,
    nextRetryAt: null,
    failureCode: null,
    createdAt: new Date(),
    iv: sealed.iv,
    data: sealed.data,
  };
  await offlineDb().photos.put(row);
  return row.id;
}

/** The photo's bytes and facts, opened with the data key. */
export async function read(id: string): Promise<{ blob: Blob; facts: PhotoFacts } | null> {
  const row = await offlineDb().photos.get(id);
  if (!row || row.data.byteLength === 0) return null;
  const { facts, bytes } = unpack(await open(requireDataKey(), { iv: row.iv, data: row.data }));
  return { blob: new Blob([new Uint8Array(bytes)], { type: facts.mime }), facts };
}

/** A preview of a queued photo, as an object URL the caller revokes when done. */
export async function previewUrl(id: string): Promise<string | null> {
  const photo = await read(id);
  return photo ? URL.createObjectURL(photo.blob) : null;
}

/** The ids of the photos not yet uploaded, as the answers may name them. */
export async function waitingIds(): Promise<Set<string>> {
  const rows = await offlineDb()
    .photos.where('state')
    .anyOf([...WAITING_STATES])
    .toArray();
  return new Set(rows.map((r) => r.id));
}

/** How many photos still wait for each record. */
export async function waitingByRecord(): Promise<Map<string, number>> {
  const rows = await offlineDb()
    .photos.where('state')
    .anyOf([...WAITING_STATES])
    .toArray();
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.clientUuid, (map.get(row.clientUuid) ?? 0) + 1);
  return map;
}

/**
 * The answers with every photo still on the phone marked as pending in its slot, so the server
 * keeps the slot open for the upload instead of a file id it cannot know.
 */
export async function markPending(answers: Answer[]): Promise<Answer[]> {
  const waiting = await waitingIds();
  if (!waiting.size) return answers;
  return answers.map((a) => {
    const value = a.value as { t?: string; v?: unknown };
    const ids = Array.isArray(value?.v) ? (value.v as unknown[]) : [];
    if (!['photo', 'file', 'signature'].includes(value?.t ?? '')) return a;
    if (!ids.some((id) => typeof id === 'string' && waiting.has(id))) return a;
    return pendingPhotoAnswer(a.fieldKey, a.repeatIndex ?? 0) as unknown as Answer;
  });
}

/** The queued photos ready to go now, oldest first. */
export async function due(now: Date): Promise<PhotoRow[]> {
  return (await offlineDb().photos.where('state').anyOf(['pending', 'failed']).toArray())
    .filter((r) => r.state === 'pending' || r.failureCode === null)
    .filter((r) => r.nextRetryAt === null || r.nextRetryAt.getTime() <= now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** The earliest time a waiting photo wants to try again, or null. */
export async function nextDue(): Promise<Date | null> {
  const rows = await offlineDb().photos.where('state').equals('pending').toArray();
  if (rows.some((r) => r.nextRetryAt === null)) return new Date(0);
  const times = rows.map((r) => r.nextRetryAt!.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

/**
 * Uploads the photos whose records the server knows, one after another: each through the
 * chunked upload under the photo's own id, so a dropped connection resumes the same session. A
 * transient failure climbs the retry ladder; a refusal fails the photo for good with its code.
 */
export async function uploadDue(
  now: () => Date,
  options: { sleep?: UploadOptions['sleep']; random?: () => number } = {},
): Promise<number> {
  const db = offlineDb();
  let uploaded = 0;
  for (const row of await due(now())) {
    const record = await db.outbox.get(row.clientUuid);
    const serverId = record?.serverId;
    if (!serverId) continue;
    const photo = await read(row.id);
    if (!photo) continue;
    await db.photos.update(row.id, { state: 'uploading', attempts: row.attempts + 1 });
    try {
      await uploadFile(
        photo.blob,
        {
          kind: 'form_photo',
          entityType: 'application',
          entityId: serverId,
          slot: row.slot,
          source: photo.facts.source,
          recordCreatedAt: record.createdAt.toISOString(),
          ...(photo.facts.capturedAt ? { capturedAt: photo.facts.capturedAt } : {}),
          ...(photo.facts.gps ? { gps: photo.facts.gps } : {}),
        },
        { clientUuid: row.id, ...(options.sleep ? { sleep: options.sleep } : {}) },
      );
      await db.photos.update(row.id, { state: 'uploaded', nextRetryAt: null, failureCode: null });
      uploaded += 1;
    } catch (error) {
      const at = now();
      const transient = !(error instanceof ApiFailure) || isTransientStatus(error.status);
      if (!transient) {
        await db.photos.update(row.id, {
          state: 'failed',
          failureCode: error instanceof ApiFailure ? error.code : 'failed',
          nextRetryAt: null,
        });
        continue;
      }
      if (retryExhausted(row.createdAt, at)) {
        await db.photos.update(row.id, {
          state: 'failed',
          failureCode: RETRY_EXHAUSTED,
          nextRetryAt: null,
        });
        continue;
      }
      await db.photos.update(row.id, {
        state: 'pending',
        nextRetryAt: nextRetryAt(
          row.attempts + 1,
          at,
          error instanceof ApiFailure ? error.retryAfter : undefined,
          options.random,
        ),
      });
    }
  }
  return uploaded;
}

/** Drops the photos the server holds already; the waiting ones never go by themselves. */
export async function freeSpace(): Promise<number> {
  const rows = await offlineDb().photos.where('state').equals('uploaded').toArray();
  await offlineDb().photos.bulkDelete(rows.map((r) => r.id));
  return rows.reduce((sum, r) => sum + r.size, 0);
}

/** The person asks a failed photo to go again. */
export async function retryNow(id: string): Promise<void> {
  await offlineDb().photos.update(id, { state: 'pending', nextRetryAt: null, failureCode: null });
}
