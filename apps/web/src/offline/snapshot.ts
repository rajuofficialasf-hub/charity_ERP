import type { LocationView } from '@css/shared';
import type {
  Application,
  ApplicationForm,
  ApplicationSummary,
} from '../features/applications/applications-api';
import type { Location } from '../features/registration/registration-api';
import type { MyProject } from '../features/projects/my-projects-api';
import type { Me } from '@css/shared/auth';
import { type ApplicationRow, type FormRow, offlineDb, openRow, sealRow } from './db';
import { openJson, type Sealed, sealJson } from './crypto';
import { requireDataKey } from './keys';
import type { SnapshotView } from './sync-api';

/**
 * The cached data set of a volunteer (docs/architecture/OFFLINE_SYNC.md, what is cached on the
 * device): written from each snapshot page. The projects and forms come whole in every answer,
 * so what is missing has left; the applications come as changes, and the id list says which
 * ones the server still lists. Sealing happens before the write, outside the transaction.
 */

/** The meta keys of the data set. */
export const META = {
  since: 'snapshot.since',
  afterId: 'snapshot.afterId',
  pulledAt: 'snapshot.pulledAt',
  serverTime: 'snapshot.serverTime',
  locationsVersion: 'locations.version',
  clockOffsetMs: 'clock.offsetMs',
  inflight: 'inflight',
  me: 'me',
} as const;

/** The cursor the next pull asks with. */
export async function cursor(): Promise<{ since?: string; afterId?: string | null }> {
  const db = offlineDb();
  const [since, afterId] = await Promise.all([db.meta.get(META.since), db.meta.get(META.afterId)]);
  return {
    since: typeof since?.value === 'string' ? since.value : undefined,
    afterId: typeof afterId?.value === 'string' ? afterId.value : null,
  };
}

export async function applySnapshot(view: SnapshotView, at: Date): Promise<void> {
  const key = requireDataKey();
  const db = offlineDb();
  const projectIds = new Set(view.projects.map((p) => p.projectId));
  const formRows: FormRow[] = await Promise.all(
    view.formVersions
      .filter((v) => projectIds.has(v.projectId))
      .map((v) => sealRow(key, { id: v.id, formId: v.formId, projectId: v.projectId }, v)),
  );
  // an application comes as its summary; the answers the phone already holds stay while the
  // record did not change (the window starts a minute early, so an unchanged record comes
  // again), and a changed record's answers are pulled again after
  const held = new Map(
    (await db.applications.bulkGet(view.applications.map((a) => a.id)))
      .filter((r): r is ApplicationRow => r !== undefined)
      .map((r) => [r.id, r]),
  );
  const applicationRows: ApplicationRow[] = await Promise.all(
    view.applications.map(async (a) => {
      const prior = held.get(a.id);
      const opened = prior ? await openRow<CachedApplication>(key, prior).catch(() => null) : null;
      const detail = opened?.detail && opened.detail.etag === a.etag ? opened.detail : null;
      return sealRow(
        key,
        { id: a.id, projectId: a.projectId, status: a.status, updatedAt: view.serverTime },
        { summary: a, detail } satisfies CachedApplication,
      );
    }),
  );
  const keep = new Set(view.applicationIds);
  await db.transaction('rw', [db.projects, db.forms, db.applications, db.meta], async () => {
    await db.projects.bulkPut(
      view.projects.map((p) => ({ id: p.projectId, data: p, updatedAt: view.serverTime })),
    );
    await db.projects.filter((p) => !projectIds.has(p.id)).delete();
    const formIds = new Set(formRows.map((f) => f.id));
    await db.forms.bulkPut(formRows);
    await db.forms.filter((f) => !formIds.has(f.id) || !projectIds.has(f.projectId)).delete();
    await db.applications.bulkPut(applicationRows);
    await db.applications.filter((a) => !keep.has(a.id)).delete();
    await db.meta.bulkPut([
      { key: META.since, value: view.nextSince },
      { key: META.afterId, value: view.nextAfterId },
      { key: META.serverTime, value: view.serverTime },
      { key: META.pulledAt, value: at.toISOString() },
    ]);
  });
}

/** The whole locations master replaced, with the version it answers to. */
export async function replaceLocations(rows: LocationView[], version: string): Promise<void> {
  const db = offlineDb();
  await db.transaction('rw', [db.locations, db.meta], async () => {
    await db.locations.clear();
    await db.locations.bulkPut(rows);
    await db.meta.put({ key: META.locationsVersion, value: version });
  });
}

export async function metaString(key: string): Promise<string | null> {
  const row = await offlineDb().meta.get(key);
  return typeof row?.value === 'string' ? row.value : null;
}

/** The cached projects, as the screens read them offline. */
export async function cachedProjects(): Promise<MyProject[]> {
  return (await offlineDb().projects.toArray()).map((p) => p.data as MyProject);
}

/** The signed-in person of the last sign-in, sealed, for the open without network. */
export async function rememberMe(me: Me): Promise<void> {
  const sealed = await sealJson(requireDataKey(), me);
  await offlineDb().meta.put({ key: META.me, value: sealed });
}

export async function cachedMe(): Promise<Me | null> {
  const row = await offlineDb().meta.get(META.me);
  if (!row) return null;
  return openJson<Me>(requireDataKey(), row.value as Sealed);
}

/** A value sealed under the data key, for a meta row that must not be readable. */
export function sealValue(value: unknown): Promise<Sealed> {
  return sealJson(requireDataKey(), value);
}

export function openValue<T>(sealed: Sealed): Promise<T> {
  return openJson<T>(requireDataKey(), sealed);
}

/** What the sealed part of a cached application holds: the summary, and the record once pulled. */
export interface CachedApplication {
  summary: ApplicationSummary;
  /** The record without its form (the form is in its own table), with the version it was read at. */
  detail: (Omit<Application, 'form'> & { etag: string }) | null;
}

/** The cached own applications, opened with the data key. */
export async function cachedApplications(): Promise<ApplicationSummary[]> {
  const key = requireDataKey();
  const rows = await offlineDb().applications.toArray();
  return (await Promise.all(rows.map((r) => openRow<CachedApplication>(key, r)))).map(
    (c) => c.summary,
  );
}

export async function cachedApplication(id: string): Promise<CachedApplication | null> {
  const row = await offlineDb().applications.get(id);
  return row ? openRow<CachedApplication>(requireDataKey(), row) : null;
}

/** The cached applications whose answers the phone does not hold yet, oldest change first. */
export async function recordsWithoutDetail(limit: number): Promise<string[]> {
  const key = requireDataKey();
  const rows = (await offlineDb().applications.toArray()).sort((a, b) =>
    a.updatedAt.localeCompare(b.updatedAt),
  );
  const ids: string[] = [];
  for (const row of rows) {
    if (ids.length >= limit) break;
    // a row another writer shaped wrongly is left alone; the next data set replaces it
    const cached = await openRow<CachedApplication>(key, row).catch(() => null);
    if (cached && !cached.detail) ids.push(row.id);
  }
  return ids;
}

/** Keeps the record's answers beside its summary, for the open and the edit without network. */
export async function storeDetail(detail: Omit<Application, 'form'>, etag: string): Promise<void> {
  const db = offlineDb();
  const key = requireDataKey();
  const row = await db.applications.get(detail.id);
  const summary: ApplicationSummary = row
    ? (await openRow<CachedApplication>(key, row)).summary
    : summaryOf(detail);
  await db.applications.put(
    await sealRow(
      key,
      {
        id: detail.id,
        projectId: detail.projectId,
        status: detail.status,
        updatedAt: row?.updatedAt ?? new Date().toISOString(),
      },
      { summary, detail: { ...detail, etag } } satisfies CachedApplication,
    ),
  );
}

function summaryOf(detail: Omit<Application, 'form'>): ApplicationSummary {
  const { answers, form, unlocks, mayUnlock, ...rest } = detail as Omit<Application, 'form'> & {
    form?: unknown;
  };
  void answers;
  void form;
  void unlocks;
  void mayUnlock;
  return rest as ApplicationSummary;
}

/** A cached form version with the project it belongs to, opened with the data key. */
export async function cachedForm(
  versionId: string,
): Promise<(ApplicationForm & { projectId: string }) | null> {
  const row = await offlineDb().forms.get(versionId);
  return row ? openRow<ApplicationForm & { projectId: string }>(requireDataKey(), row) : null;
}

/** The cached form of a project, when one is held. */
export async function cachedProjectForm(
  projectId: string,
): Promise<(ApplicationForm & { projectId: string }) | null> {
  const row = await offlineDb().forms.where('projectId').equals(projectId).first();
  return row ? openRow<ApplicationForm & { projectId: string }>(requireDataKey(), row) : null;
}

/** The cached children of a location (the divisions for null), as the address cascade reads them. */
export async function cachedChildren(parentId: string | null): Promise<Location[] | null> {
  const db = offlineDb();
  if ((await db.locations.count()) === 0) return null;
  const rows =
    parentId === null
      ? await db.locations.filter((l) => l.parentId === null).toArray()
      : await db.locations.where('parentId').equals(parentId).toArray();
  return rows
    .filter((l) => l.active)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((l) => ({ id: l.id, name: l.name, postCode: l.postCode }));
}
