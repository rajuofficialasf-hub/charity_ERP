import Dexie, { type EntityTable } from 'dexie';
import type { LocationView } from '@css/shared';
import { type OutboxTracking, type SyncRecordKind } from '@css/shared/sync';
import { z } from 'zod';
import { IV_BYTES, openJson, type Sealed, sealJson } from './crypto';

/**
 * The phone's store (docs/architecture/OFFLINE_SYNC.md, what is cached on the device, and local
 * storage security): one IndexedDB database
 * through Dexie. Every table that holds business data keeps its indexable columns in the clear
 * (ids, states, times, the project) and everything else sealed under the data key as one
 * `{ iv, data }` pair per row (`sealRow` and `openRow`). Locations, projects and the meta rows
 * hold nothing personal and stay readable. `keys` holds the wrapped data key and the
 * device-bound key; the device key of the session never reaches this database.
 */
export const OFFLINE_DB_NAME = 'css-offline';

/** A row whose business fields are sealed: only its index columns are in the clear. */
export type SealedRow = Sealed;

/**
 * A sealed value read back from the store. The checks look at the shape, not the class: a value
 * that crossed IndexedDB may belong to another realm, where `instanceof` says no.
 */
export const sealedSchema = z.object({
  iv: z.custom<Uint8Array<ArrayBuffer>>((v) => ArrayBuffer.isView(v) && v.byteLength === IV_BYTES),
  data: z.custom<ArrayBuffer>((v) => Object.prototype.toString.call(v) === '[object ArrayBuffer]'),
});

/** The kinds of record the outbox carries, as the shared sync records name them. */
export type OutboxKind = SyncRecordKind;

/** One offline record: what the sync engine reads in the clear; the payload is sealed. */
export interface OutboxRow extends SealedRow, OutboxTracking {
  clientUuid: string;
  kind: OutboxKind;
  projectId: string;
  formVersionId: string;
  /** The server id or the client id of the record this one changes. */
  target: string | null;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type PhotoState = 'pending' | 'uploading' | 'uploaded' | 'failed';

/** A photo waiting for its record: the bytes and the capture facts are sealed. */
export interface PhotoRow extends SealedRow {
  id: string;
  /** The outbox record the photo belongs to. */
  clientUuid: string;
  slot: string;
  state: PhotoState;
  size: number;
  attempts: number;
  nextRetryAt: Date | null;
  /** The server's code when the photo was refused for good. */
  failureCode: string | null;
  /** The file the server holds once the photo went up; the answers name it from then on. */
  fileId: string | null;
  createdAt: Date;
}

/**
 * The size of a queued photo, kept beside it: the queue's budget adds these up without reading the
 * photos, whose rows carry their sealed bytes. Nothing in it is personal.
 */
export interface PhotoSizeRow {
  id: string;
  clientUuid: string;
  size: number;
}

/** An own application as the last snapshot gave it; the summary is sealed. */
export interface ApplicationRow extends SealedRow {
  id: string;
  projectId: string;
  status: string;
  updatedAt: string;
}

/** An assigned project as the snapshot gave it; nothing personal, so readable. */
export interface ProjectRow {
  id: string;
  data: unknown;
  updatedAt: string;
}

/** A published form version of a project; the definition is sealed with the answers it may carry. */
export interface FormRow extends SealedRow {
  id: string;
  formId: string;
  projectId: string;
}

/** One row of the locations master, as `GET /locations/all` answers it. */
export type LocationRow = LocationView;

/** A named value of the store: the snapshot cursor, the locations version, the cached `me`. */
export interface MetaRow {
  key: string;
  value: unknown;
}

/** The one keys row: the data key wrapped twice, and the device-bound key that wraps it. */
export interface KeysRow {
  id: 'current';
  sessionId: string;
  userId: string;
  wrappedByServer: Sealed;
  wrappedByDevice: Sealed;
  deviceBoundKey: CryptoKey;
  createdAt: Date;
}

class OfflineDb extends Dexie {
  outbox!: EntityTable<OutboxRow, 'clientUuid'>;
  photos!: EntityTable<PhotoRow, 'id'>;
  photoSizes!: EntityTable<PhotoSizeRow, 'id'>;
  applications!: EntityTable<ApplicationRow, 'id'>;
  projects!: EntityTable<ProjectRow, 'id'>;
  forms!: EntityTable<FormRow, 'id'>;
  locations!: EntityTable<LocationRow, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  keys!: EntityTable<KeysRow, 'id'>;

  constructor() {
    super(OFFLINE_DB_NAME);
    // only the clear columns are indexed; a sealed field can never be
    this.version(1).stores({
      outbox: 'clientUuid, state, projectId, nextRetryAt, createdAt, [state+nextRetryAt]',
      photos: 'id, clientUuid, state, [clientUuid+slot]',
      applications: 'id, projectId, status, updatedAt',
      projects: 'id',
      forms: 'id, projectId',
      locations: 'id, parentId',
      meta: 'key',
      keys: 'id',
    });
    // the sizes of the queued photos in a table of their own; a phone that queued photos before
    // gets the size row of each, read once from the photos here
    this.version(2)
      .stores({ photoSizes: 'id, clientUuid' })
      .upgrade(async (tx) => {
        // one photo at a time: a full queue holds up to the budget in sealed bytes
        const sizes: PhotoSizeRow[] = [];
        await tx
          .table<PhotoRow, string>('photos')
          .each((p) => sizes.push({ id: p.id, clientUuid: p.clientUuid, size: p.size }));
        await tx.table<PhotoSizeRow, string>('photoSizes').bulkPut(sizes);
      });
  }
}

let instance: OfflineDb | null = null;

/** The one open database of the page; opened lazily on first use. */
export function offlineDb(): OfflineDb {
  instance ??= new OfflineDb();
  return instance;
}

/** Closes the connection, so a wipe can delete the database without being blocked. */
export function closeOfflineDb(): void {
  instance?.close();
  instance = null;
}

const DELETE_WAIT_MS = 3_000;

/**
 * Deletes the database by its name after closing it. Another tab may still hold it open and
 * block the delete; then the tables are emptied instead, so nothing sealed stays behind.
 */
export async function deleteOfflineDb(): Promise<void> {
  closeOfflineDb();
  const deleted = await Promise.race([
    Dexie.delete(OFFLINE_DB_NAME).then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), DELETE_WAIT_MS)),
  ]).catch(() => false);
  if (deleted) return;
  await clearOfflineTables();
  closeOfflineDb();
}

/** Empties every table, the keys included; the database itself stays for the next session. */
export async function clearOfflineTables(): Promise<void> {
  const db = offlineDb();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

/** A row with its secret part sealed under the data key beside the clear columns. */
export async function sealRow<Clear extends object>(
  key: CryptoKey,
  clear: Clear,
  secret: unknown,
): Promise<Clear & SealedRow> {
  const sealed = await sealJson(key, secret);
  return { ...clear, iv: sealed.iv, data: sealed.data };
}

/** The secret part of a row, opened with the data key. */
export function openRow<Secret>(key: CryptoKey, row: SealedRow): Promise<Secret> {
  return openJson<Secret>(key, { iv: row.iv, data: row.data });
}
