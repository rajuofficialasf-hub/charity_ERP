import type { Answer, FormDefinition } from '@css/shared/forms';
import type { OutboxState } from '@css/shared/sync';
import type {
  Application,
  ApplicationForm,
  ApplicationSummary,
} from '../features/applications/applications-api';
import { offlineDb, type OutboxRow } from './db';
import { enqueue, readSecret, remove } from './outbox';
import type { MyProject, MyProjectDetail } from '../features/projects/my-projects-api';
import {
  cachedApplication,
  cachedApplications,
  cachedForm,
  cachedProjectForm,
  cachedProjects,
} from './snapshot';
import { syncEngine, type SyncStatus } from './sync-engine';

/**
 * The one path of a volunteer's application work, with or without network
 * (docs/architecture/OFFLINE_SYNC.md, outbox pattern and record lifecycle): every save, send and
 * correction becomes an outbox record and a flush follows at once; online the screen waits for
 * the record's answer, offline it shows what the phone holds. The screens read their lists and
 * records from the server while they can and from the cached data set when they cannot.
 */

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
export interface LocalDraft {
  clientUuid: string;
  projectId: string;
  formVersionId: string;
  answers: Answer[];
  createdAt: Date;
  sync: SyncInfo;
}

/** A record as a volunteer's screens read it: the server's, or the phone's own before the server knows it. */
export type OwnRecord = Application & { local?: boolean; sync?: SyncInfo };

const infoOf = (row: OutboxRow): SyncInfo => ({
  clientUuid: row.clientUuid,
  state: row.state,
  failureCode: row.failureCode,
  verificationReason: row.verificationReason ?? null,
  photosPending: Boolean(row.photosPending),
  serverId: row.serverId ?? null,
  updatedAt: row.updatedAt,
});

/** Saves a draft: the phone's own under its client id, or an update of the server's record. */
export async function saveDraft(input: {
  projectId: string;
  formVersionId: string;
  clientUuid: string;
  answers: Answer[];
  /** The server's record and the version the edit started from, when the draft is the server's. */
  server?: { id: string; etag: string | null } | null;
}): Promise<{ clientUuid: string; serverId: string | null }> {
  const db = offlineDb();
  const own = await db.outbox.get(input.clientUuid);
  const server =
    input.server ??
    (own?.state === 'synced' && own.serverId ? { id: own.serverId, etag: null } : null);
  if (server) {
    // one update record per server draft: a second save while it waits is its new version
    const open = (await db.outbox.where('state').anyOf(['pending', 'failed']).toArray()).find(
      (r) => r.kind === 'application_update' && r.target === server.id,
    );
    const row = await enqueue({
      clientUuid: open?.clientUuid,
      kind: 'application_update',
      projectId: input.projectId,
      formVersionId: input.formVersionId,
      target: server.id,
      baseVersion: server.etag,
      payload: { answers: input.answers },
    });
    flushSoon();
    return { clientUuid: row.clientUuid, serverId: server.id };
  }
  const row = await enqueue({
    clientUuid: input.clientUuid,
    kind: 'application_draft',
    projectId: input.projectId,
    formVersionId: input.formVersionId,
    payload: { answers: input.answers },
  });
  flushSoon();
  return { clientUuid: row.clientUuid, serverId: null };
}

/** Sends a draft to the office: after the draft itself when the server does not know it yet. */
export async function sendToOffice(input: {
  projectId: string;
  formVersionId: string;
  /** The phone's draft record, when the server has not answered with an id yet. */
  draftClientUuid: string | null;
  serverId: string | null;
}): Promise<string> {
  const row = await enqueue({
    kind: 'application_submit',
    projectId: input.projectId,
    formVersionId: input.formVersionId,
    target: input.serverId,
    dependencies: input.serverId || !input.draftClientUuid ? [] : [input.draftClientUuid],
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
  await syncEngine.flush('write');
  return recordState(clientUuid);
}

export async function recordState(clientUuid: string): Promise<SyncInfo | null> {
  const row = await offlineDb().outbox.get(clientUuid);
  return row ? infoOf(row) : null;
}

/** The engine's status as it changes, for the screens that show the badges. */
export function subscribe(listener: (status: SyncStatus) => void): () => void {
  return syncEngine.subscribe(listener);
}

/** The drafts the server does not know yet. */
export async function localDrafts(): Promise<LocalDraft[]> {
  const rows = (await offlineDb().outbox.toArray()).filter(
    (r) => r.kind === 'application_draft' && !r.serverId,
  );
  return Promise.all(
    rows.map(async (row) => ({
      clientUuid: row.clientUuid,
      projectId: row.projectId,
      formVersionId: row.formVersionId,
      answers: ((await readSecret(row)).payload.answers as Answer[] | undefined) ?? [],
      createdAt: row.createdAt,
      sync: infoOf(row),
    })),
  );
}

/** The sync state of the server's records that still have a record on its way, by server id. */
export async function syncOfServerRecords(): Promise<Map<string, SyncInfo>> {
  const rows = (await offlineDb().outbox.toArray())
    .filter((r) => r.state !== 'synced' || r.photosPending)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  const map = new Map<string, SyncInfo>();
  for (const row of rows) {
    const id = row.serverId ?? row.target;
    if (id) map.set(id, infoOf(row));
  }
  return map;
}

/** The name the answers give, through the form's column for it. */
export function nameFrom(answers: Answer[], form: FormDefinition): string | null {
  const field = form.sections.flatMap((s) => s.fields).find((f) => f.standardColumn === 'name');
  const answer = field ? answers.find((a) => a.fieldKey === field.fieldKey) : undefined;
  const value = answer?.value as { v?: unknown } | undefined;
  return typeof value?.v === 'string' && value.v ? value.v : null;
}

/** A local draft as a record the screens can show. */
export async function localRecord(clientUuid: string): Promise<OwnRecord | null> {
  const draft = (await localDrafts()).find((d) => d.clientUuid === clientUuid);
  if (!draft) return null;
  const form = await cachedForm(draft.formVersionId);
  if (!form) return null;
  return {
    id: draft.clientUuid,
    appNo: null,
    projectId: draft.projectId,
    beneficiaryId: null,
    beneficiaryName: nameFrom(draft.answers, form),
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

/** A local draft as a row of the list. */
export function localSummary(draft: LocalDraft, form: ApplicationForm | null): ApplicationSummary {
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

/** The server's record as the phone holds it, with its form, or the phone's own draft. */
export async function cachedRecord(id: string): Promise<OwnRecord | null> {
  const own = await localRecord(id);
  if (own) return own;
  const cached = await cachedApplication(id);
  if (!cached?.detail) return null;
  const form = await cachedForm(cached.detail.formVersionId);
  if (!form) return null;
  const sync = (await syncOfServerRecords()).get(id);
  return { ...cached.detail, form, ...(sync ? { sync } : {}) };
}

/** The cached list rows of the given states. */
export async function cachedList(statuses: readonly string[]): Promise<ApplicationSummary[]> {
  return (await cachedApplications()).filter((a) => statuses.includes(a.status));
}

export { cachedProjectForm, cachedProjects };

/** A cached project as the new-application screen reads it; the rules parts are not kept on the phone. */
export async function cachedProject(projectId: string): Promise<MyProjectDetail | null> {
  const project: MyProject | undefined = (await cachedProjects()).find(
    (p) => p.projectId === projectId,
  );
  return project ? { ...project, rules: { version: project.rulesVersion, parts: [] } } : null;
}

/** Drops a draft the server never knew, with its photos. */
export function removeLocal(clientUuid: string): Promise<void> {
  return remove(clientUuid);
}
