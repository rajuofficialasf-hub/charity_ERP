import type { LocationView } from '@css/shared';
import type { ApplicationSummary } from '../features/applications/applications-api';
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
  const applicationRows: ApplicationRow[] = await Promise.all(
    view.applications.map((a) =>
      sealRow(
        key,
        { id: a.id, projectId: a.projectId, status: a.status, updatedAt: view.serverTime },
        a,
      ),
    ),
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

/** The cached own applications, opened with the data key. */
export async function cachedApplications(): Promise<ApplicationSummary[]> {
  const key = requireDataKey();
  const rows = await offlineDb().applications.toArray();
  return Promise.all(rows.map((r) => openRow<ApplicationSummary>(key, r)));
}
