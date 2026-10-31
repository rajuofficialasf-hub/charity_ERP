import { answerValueSchema } from '@css/shared';
import type { Answer, FormDefinition } from '@css/shared/forms';
import { type OutboxState, pendingPhotoValueSchema } from '@css/shared/sync';
import { z } from 'zod';
import {
  actOn,
  type Application,
  type ApplicationForm,
  type ApplicationSummary,
  application,
  createApplication,
  fillUnlock as fillUnlockOnline,
  updateApplication,
} from '../features/applications/applications-api';
import type { MyProject, MyProjectDetail } from '../features/projects/my-projects-api';
import { offlineDb, type OutboxKind, type OutboxRow } from './db';
import { currentDataKey } from './keys';
import { enqueue, readSecret, remove, retryNow, WAITING_STATES, waitingCount } from './outbox';
import * as photoQueue from './photo-queue';
import {
  cachedApplication,
  cachedApplications,
  cachedForm,
  cachedProjectForm,
  cachedProjects,
  storeDetail,
} from './snapshot';
import { syncEngine, type SyncStatus } from './sync-engine';

/**
 * The one path of a volunteer's application work, with or without network
 * (docs/architecture/OFFLINE_SYNC.md, outbox pattern and record lifecycle): every save, send and
 * correction becomes an outbox record and a flush follows at once; online the screen waits for
 * the record's answer, offline it shows what the phone holds. When the store did not open (a
 * browser that blocks IndexedDB, a session the server did not key) the same calls go straight to
 * the server while there is network, and say plainly that nothing can be kept without it.
 */

/**
 * A record the office holds for verification counts as such until the phone's data set shows
 * the office decided; the outbox row itself never learns of the decision.
 */
async function stillVerifying(row: OutboxRow): Promise<boolean> {
  if (!row.verificationReason) return false;
  const id = row.serverId ?? row.target;
  const cached = id ? await cachedApplication(id) : null;
  return !cached || cached.summary.status === 'needs_verification';
}

/** Where a record stands on its way to the server, for the badges and the messages. */
export interface SyncInfo {
  clientUuid: string;
  state: OutboxState;
  failureCode: string | null;
  verificationReason: string | null;
  photosPending: boolean;
  serverId: string | null;
  updatedAt: Date;
}

/** A draft that exists on this phone only, until the server answers with its id. */
interface LocalDraft {
  clientUuid: string;
  projectId: string;
  formVersionId: string;
  answers: Answer[];
  createdAt: Date;
  sync: SyncInfo;
}

/** A record as a volunteer's screens read it: the server's, or the phone's own before the server knows it. */
export type OwnRecord = Application & { local?: boolean; sync?: SyncInfo };

/** The message key of a save that found no store and no network. */
export const STORE_UNAVAILABLE = 'offline.store_unavailable';
/** The message key of a record that cannot be dropped while its batch is on its way. */
export const RECORD_ON_ITS_WAY = 'offline.record_on_its_way';

// a photo still on the phone stands in its answer as the pending slot the server will fill
const answerSchema = z.object({
  fieldKey: z.string(),
  repeatIndex: z.number().int().min(0).optional(),
  value: z.union([answerValueSchema, pendingPhotoValueSchema]),
});
const answersSchema = z.array(answerSchema);

/** The answers of a sealed payload, read through their schema; a row another writer shaped wrongly gives none. */
const answersOf = (payload: Record<string, unknown>): Answer[] => {
  const parsed = answersSchema.safeParse(payload.answers);
  return parsed.success ? (parsed.data as Answer[]) : [];
};

const infoOf = (row: OutboxRow): SyncInfo => ({
  clientUuid: row.clientUuid,
  state: row.state,
  failureCode: row.failureCode,
  verificationReason: row.verificationReason ?? null,
  photosPending: Boolean(row.photosPending),
  serverId: row.serverId ?? null,
  updatedAt: row.updatedAt,
});

/** Whether the outbox can take a record: the key ring is open. */
const storeOpen = () => currentDataKey() !== null;

/** What went straight to the server because the store was closed, by the id the screen holds. */
const direct = new Map<string, SyncInfo>();

const directInfo = (clientUuid: string, serverId: string | null): SyncInfo => {
  const info: SyncInfo = {
    clientUuid,
    state: 'synced',
    failureCode: null,
    verificationReason: null,
    photosPending: false,
    serverId,
    updatedAt: new Date(),
  };
  direct.set(clientUuid, info);
  return info;
};

function withoutStore(): never {
  throw new Error(STORE_UNAVAILABLE);
}

/** The update of a server record still waiting or refused, if any: its newest version is the one to continue. */
async function openUpdateOf(serverId: string): Promise<OutboxRow | undefined> {
  return (await offlineDb().outbox.where('state').anyOf(['pending', 'failed']).toArray())
    .filter((r) => r.kind === 'application_update' && r.target === serverId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
}

/** Saves a draft: the phone's own under its client id, or an update of the server's record. */
export async function saveDraft(input: {
  projectId: string;
  formVersionId: string;
  clientUuid: string;
  answers: Answer[];
  /** The server's record and the version the edit started from, when the draft is the server's. */
  server?: { id: string; etag: string | null } | null;
}): Promise<{ clientUuid: string; serverId: string | null }> {
  if (!storeOpen()) {
    if (!navigator.onLine) withoutStore();
    // no store to keep it in: the server takes it now, as before the store existed
    const result = input.server
      ? await updateApplication(input.server.id, input.server.etag ?? '', input.answers)
      : await createApplication(input.projectId, {
          clientUuid: input.clientUuid,
          formVersionId: input.formVersionId,
          answers: input.answers,
        });
    directInfo(input.clientUuid, result.data.id);
    return { clientUuid: input.clientUuid, serverId: result.data.id };
  }
  const own = await offlineDb().outbox.get(input.clientUuid);
  const server =
    input.server ??
    (own?.state === 'synced' && own.serverId ? { id: own.serverId, etag: null } : null);
  // a photo still on the phone is a pending slot for the server, never a file id it cannot know
  const answers = await photoQueue.markPending(input.answers);
  if (server) {
    // one update record per server draft: a second save while it waits is its new version
    const open = await openUpdateOf(server.id);
    const row = await enqueue({
      clientUuid: open?.clientUuid,
      kind: 'application_update',
      projectId: input.projectId,
      formVersionId: input.formVersionId,
      target: server.id,
      baseVersion: server.etag,
      payload: { answers },
    });
    flushSoon();
    return { clientUuid: row.clientUuid, serverId: server.id };
  }
  const row = await enqueue({
    clientUuid: input.clientUuid,
    kind: 'application_draft',
    projectId: input.projectId,
    formVersionId: input.formVersionId,
    target: null,
    payload: { answers },
  });
  flushSoon();
  return { clientUuid: row.clientUuid, serverId: null };
}

/**
 * Sends a draft to the office: after the draft itself when the server does not know it yet, and
 * after an edit of it still waiting, so the office never gets the old answers. A send already
 * waiting for the same record is sent again, never doubled.
 */
export async function sendToOffice(input: {
  projectId: string;
  formVersionId: string;
  /** The phone's draft record, when the server has not answered with an id yet. */
  draftClientUuid: string | null;
  serverId: string | null;
}): Promise<string> {
  if (!storeOpen()) {
    if (!navigator.onLine || !input.serverId) withoutStore();
    const current = await application(input.serverId);
    const sent = await actOn(input.serverId, current.meta.etag ?? '', 'submit');
    const id = `direct:${input.serverId}:submit`;
    directInfo(id, sent.data.id);
    return id;
  }
  const db = offlineDb();
  const waiting = await db.outbox.where('state').anyOf(['pending', 'failed']).toArray();
  const open = waiting.find(
    (r) =>
      r.kind === 'application_submit' &&
      ((input.serverId && r.target === input.serverId) ||
        (input.draftClientUuid && r.dependencies.includes(input.draftClientUuid))),
  );
  const dependencies = input.serverId
    ? [(await openUpdateOf(input.serverId))?.clientUuid].filter((id): id is string => !!id)
    : input.draftClientUuid
      ? [input.draftClientUuid]
      : [];
  const row = await enqueue({
    clientUuid: open?.clientUuid,
    kind: 'application_submit',
    projectId: input.projectId,
    formVersionId: input.formVersionId,
    target: input.serverId,
    dependencies,
    payload: {},
  });
  flushSoon();
  return row.clientUuid;
}

/** The new value of an answer the office opened for correction. */
export async function fillUnlock(input: {
  projectId: string;
  formVersionId: string;
  unlockId: string;
  value: unknown;
}): Promise<string> {
  if (!storeOpen()) {
    if (!navigator.onLine) withoutStore();
    await fillUnlockOnline(input.unlockId, input.value);
    const id = `direct:${input.unlockId}:fill`;
    directInfo(id, input.unlockId);
    return id;
  }
  const row = await enqueue({
    kind: 'field_update',
    projectId: input.projectId,
    formVersionId: input.formVersionId,
    target: input.unlockId,
    payload: { unlockId: input.unlockId, value: input.value as Record<string, unknown> },
  });
  flushSoon();
  return row.clientUuid;
}

function flushSoon(): void {
  void syncEngine.flush('write').catch(() => undefined);
}

/** Runs a flush now and answers where the record stands after it. */
export async function settle(clientUuid: string): Promise<SyncInfo | null> {
  const went = direct.get(clientUuid);
  if (went) return went;
  await syncEngine.flush('write');
  const row = await offlineDb().outbox.get(clientUuid);
  return row ? infoOf(row) : null;
}

/** Keeps a photo on the phone for a record the server does not know yet, and gives its preview. */
export async function queuePhoto(input: {
  clientUuid: string;
  slot: string;
  blob: Blob;
  facts: photoQueue.PhotoFacts;
}): Promise<{ id: string; previewUrl: string }> {
  const id = await photoQueue.add(input);
  // the preview from the bytes in hand; the field revokes it when the photo leaves the screen
  return { id, previewUrl: URL.createObjectURL(input.blob) };
}

/** What the photo queue holds against its budget. */
export const photoUsage = () => photoQueue.usage();
/** Drops the photos the server holds already. */
export const freePhotoSpace = () => photoQueue.freeSpace();
/** Records the server has not accepted yet: what a logout or a revoked session would lose. */
export { waitingCount };

/** A record as the sync centre lists it. */
export interface OverviewRecord {
  clientUuid: string;
  kind: OutboxKind;
  sync: SyncInfo;
  /** The screen of the record: the phone's own draft, or the server's record. */
  href: string;
  /** A draft the server never knew: the person may drop it here. */
  ownDraft: boolean;
  projectId: string;
  projectName: { bn: string; en: string } | null;
  beneficiaryName: string | null;
  createdAt: Date;
}

/** What the sync centre shows: every record still of interest, and the photo queue. */
export interface Overview {
  records: OverviewRecord[];
  photos: {
    waitingCount: number;
    waitingBytes: number;
    uploadedCount: number;
    uploadedBytes: number;
    usage: photoQueue.QueueUsage;
  };
}

/**
 * The records the person may still want to see: waiting, refused, under the office's
 * verification, or with photos still to go; a record accepted and done with stays out.
 */
export async function overview(): Promise<Overview> {
  const db = offlineDb();
  const rows = await db.outbox.toArray();
  const photoRows = await db.photos.toArray();
  const waitingPhotos = new Set(
    photoRows.filter((p) => p.state !== 'uploaded').map((p) => p.clientUuid),
  );
  const projects = new Map((await cachedProjects()).map((p) => [p.projectId, p.name]));
  const verifying = new Set(
    (
      await Promise.all(rows.map(async (r) => ((await stillVerifying(r)) ? r.clientUuid : null)))
    ).filter((id): id is string => id !== null),
  );
  const shown = rows
    .filter(
      (r) =>
        (WAITING_STATES as readonly string[]).includes(r.state) ||
        verifying.has(r.clientUuid) ||
        r.photosPending ||
        waitingPhotos.has(r.clientUuid),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const records = await Promise.all(
    shown.map(async (row): Promise<OverviewRecord> => {
      const draft = await draftOf(row);
      const serverId = row.serverId ?? (row.kind === 'application_draft' ? null : row.target);
      const cached = serverId ? await cachedApplication(serverId) : null;
      const form = draft ? await cachedForm(draft.formVersionId) : null;
      return {
        clientUuid: row.clientUuid,
        kind: row.kind,
        sync: {
          ...infoOf(row),
          verificationReason: verifying.has(row.clientUuid) ? row.verificationReason! : null,
          photosPending: Boolean(row.photosPending) || waitingPhotos.has(row.clientUuid),
        },
        href: serverId ? `/my-applications/${serverId}` : `/my-applications/${row.clientUuid}`,
        ownDraft: draft !== null,
        projectId: row.projectId,
        projectName: projects.get(row.projectId) ?? null,
        beneficiaryName:
          cached?.summary.beneficiaryName ?? (draft && form ? nameFrom(draft.answers, form) : null),
        createdAt: row.createdAt,
      };
    }),
  );
  const waiting = photoRows.filter((p) => p.state !== 'uploaded');
  const uploaded = photoRows.filter((p) => p.state === 'uploaded');
  return {
    records,
    photos: {
      waitingCount: waiting.length,
      waitingBytes: waiting.reduce((sum, p) => sum + p.size, 0),
      uploadedCount: uploaded.length,
      uploadedBytes: uploaded.reduce((sum, p) => sum + p.size, 0),
      usage: await photoQueue.usage(),
    },
  };
}

/** The person asks one record, with its refused photos, to go now; a flush follows. */
export async function retryRecord(clientUuid: string): Promise<void> {
  const db = offlineDb();
  const row = await db.outbox.get(clientUuid);
  if (row && (row.state === 'pending' || row.state === 'failed'))
    await retryNow(clientUuid, new Date());
  const photos = await db.photos.where('clientUuid').equals(clientUuid).toArray();
  for (const photo of photos) if (photo.state === 'failed') await photoQueue.retryNow(photo.id);
  await syncEngine.flush('manual');
}

/** The person asks everything refused to go again; a flush follows. */
export async function retryAll(): Promise<void> {
  const db = offlineDb();
  const failed = await db.outbox.where('state').equals('failed').toArray();
  for (const row of failed) await retryNow(row.clientUuid, new Date());
  const photos = await db.photos.where('state').equals('failed').toArray();
  for (const photo of photos) await photoQueue.retryNow(photo.id);
  await syncEngine.flush('manual');
}

/** The engine's status as it changes, for the screens that show the badges. */
export function subscribe(listener: (status: SyncStatus) => void): () => void {
  return syncEngine.subscribe(listener);
}

/** The phone's own draft behind a row, or null when the row is not one. */
async function draftOf(row: OutboxRow | undefined): Promise<LocalDraft | null> {
  if (!row || row.kind !== 'application_draft' || row.serverId) return null;
  return {
    clientUuid: row.clientUuid,
    projectId: row.projectId,
    formVersionId: row.formVersionId,
    answers: answersOf((await readSecret(row)).payload),
    createdAt: row.createdAt,
    sync: infoOf(row),
  };
}

/** The drafts the server does not know yet. */
async function localDrafts(): Promise<LocalDraft[]> {
  const rows = await offlineDb().outbox.toArray();
  const drafts = await Promise.all(rows.map(draftOf));
  const photos = await photoQueue.waitingByRecord();
  return drafts
    .filter((d): d is LocalDraft => d !== null)
    .map((d) => ({
      ...d,
      sync: { ...d.sync, photosPending: d.sync.photosPending || photos.has(d.clientUuid) },
    }));
}

/** The server's id behind an address that still names the phone's draft; any other id as it is. */
export async function serverIdOf(id: string): Promise<string> {
  const row = await offlineDb().outbox.get(id);
  return row?.serverId ?? id;
}

/** The sync state of the server's records that still have a record on its way, by server id. */
export async function syncOfServerRecords(): Promise<Map<string, SyncInfo>> {
  const all = await offlineDb().outbox.toArray();
  const rows = all
    .filter((r) => r.state !== 'synced' || r.photosPending)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  const photos = await photoQueue.waitingByRecord();
  const map = new Map<string, SyncInfo>();
  for (const row of rows) {
    const id = row.serverId ?? row.target;
    if (!id) continue;
    // a held record with photos still to go is both: the office's check comes first
    const verifying = row.state === 'synced' && (await stillVerifying(row));
    map.set(id, { ...infoOf(row), verificationReason: verifying ? row.verificationReason! : null });
  }
  // a record the office is still verifying carries that as its badge
  for (const row of all)
    if (row.state === 'synced' && (await stillVerifying(row))) {
      const id = row.serverId ?? row.target;
      if (id && !map.has(id)) map.set(id, infoOf(row));
    }
  // a synced record whose photos still wait shows that too
  for (const row of await offlineDb().outbox.toArray())
    if (row.serverId && photos.has(row.clientUuid) && !map.has(row.serverId))
      map.set(row.serverId, { ...infoOf(row), photosPending: true });
  return map;
}

/** The name the answers give, through the form's column for it. */
function nameFrom(answers: Answer[], form: FormDefinition): string | null {
  const field = form.sections.flatMap((s) => s.fields).find((f) => f.standardColumn === 'name');
  const answer = field ? answers.find((a) => a.fieldKey === field.fieldKey) : undefined;
  const value = answer?.value;
  return value && 'v' in value && typeof value.v === 'string' && value.v ? value.v : null;
}

/** A local draft as a row of the list. */
function localSummary(draft: LocalDraft, form: ApplicationForm | null): ApplicationSummary {
  return {
    id: draft.clientUuid,
    appNo: null,
    projectId: draft.projectId,
    beneficiaryId: null,
    beneficiaryName: form ? nameFrom(draft.answers, form) : null,
    ownerVolunteerId: null,
    status: 'draft',
    stage: null,
    outcome: null,
    flags: [],
    districtId: '',
    unionId: '',
    submittedAt: null,
    waitingDays: null,
    etag: '',
  };
}

/** The local drafts as list rows, with the forms they belong to. */
export async function localSummaries(): Promise<(ApplicationSummary & { sync: SyncInfo })[]> {
  const drafts = await localDrafts();
  return Promise.all(
    drafts.map(async (d) => ({
      ...localSummary(d, await cachedForm(d.formVersionId)),
      sync: d.sync,
    })),
  );
}

/** A local draft as a record the screens can show; null once the server knows it, or for any other id. */
export async function localRecord(clientUuid: string): Promise<OwnRecord | null> {
  const draft = await draftOf(await offlineDb().outbox.get(clientUuid));
  if (!draft) return null;
  const form = await cachedForm(draft.formVersionId);
  if (!form) return null;
  return {
    ...localSummary(draft, form),
    formVersionId: draft.formVersionId,
    createdByUserId: null,
    identityKind: null,
    rejectionMessage: null,
    answers: draft.answers,
    reviewedAt: null,
    approvedAt: null,
    familyDuplicateWarnings: [],
    availableActions: ['submit'],
    form,
    local: true,
    sync: draft.sync,
  };
}

/**
 * The record with the answers of an edit still on its way laid over the server's: what the
 * volunteer last saved is what they see and continue from, with or without network.
 */
export async function withPendingEdit<T extends Application>(
  record: T,
): Promise<T & { sync?: SyncInfo }> {
  if (!storeOpen()) return record;
  const sync = (await syncOfServerRecords()).get(record.id);
  const open = await openUpdateOf(record.id);
  const answers = open ? answersOf((await readSecret(open)).payload) : record.answers;
  return { ...record, answers, ...(sync ? { sync } : {}) };
}

/** Keeps a record read from the server on the phone, so it opens without network later. */
export async function rememberRecord(record: Application, etag: string): Promise<void> {
  if (!storeOpen()) return;
  const { form, ...detail } = record;
  void form;
  await storeDetail(detail, etag);
}

/** The server's record as the phone holds it, with its form and any edit still on its way. */
export async function cachedRecord(id: string): Promise<OwnRecord | null> {
  const cached = await cachedApplication(id);
  if (!cached?.detail) return null;
  const form = await cachedForm(cached.detail.formVersionId);
  if (!form) return null;
  return withPendingEdit({ ...cached.detail, form });
}

/** The cached list rows of the given states; null when the phone holds no data set yet. */
export async function cachedList(
  statuses: readonly string[],
): Promise<ApplicationSummary[] | null> {
  const all = await cachedApplications();
  if (!all.length) return null;
  return all.filter((a) => statuses.includes(a.status));
}

export { cachedProjectForm, cachedProjects };

/** A cached project as the new-application screen reads it; the rules parts are not kept on the phone. */
export async function cachedProject(projectId: string): Promise<MyProjectDetail | null> {
  const project: MyProject | undefined = (await cachedProjects()).find(
    (p) => p.projectId === projectId,
  );
  return project ? { ...project, rules: { version: project.rulesVersion, parts: [] } } : null;
}

/**
 * Drops a draft the server never knew, with its photos and the sends that waited for it. One on
 * its way (its batch posted, or kept for a replay) stays until the server has answered.
 */
export async function removeLocal(clientUuid: string): Promise<void> {
  const db = offlineDb();
  const row = await db.outbox.get(clientUuid);
  if (!row) return;
  const inflight = await db.meta.get('inflight');
  const held = (inflight?.value as { uuids?: string[] } | undefined)?.uuids ?? [];
  if (row.state === 'syncing' || held.includes(clientUuid)) throw new Error(RECORD_ON_ITS_WAY);
  const dependants = (await db.outbox.toArray()).filter((r) => r.dependencies.includes(clientUuid));
  for (const dependant of dependants) await remove(dependant.clientUuid);
  await remove(clientUuid);
}
