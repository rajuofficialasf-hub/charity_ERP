import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApplicationSummary } from '../features/applications/applications-api';
import type { MyProject } from '../features/projects/my-projects-api';
import { closeOfflineDb, OFFLINE_DB_NAME, offlineDb, openRow } from './db';
import { afterSignIn, forgetKeys } from './keys';
import {
  applySnapshot,
  cachedApplication,
  cachedApplications,
  cachedProjects,
  cursor,
  META,
  metaString,
  replaceLocations,
  storeDetail,
} from './snapshot';
import type { SnapshotView } from './sync-api';

const USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const SESSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const P1 = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01';
const P2 = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c02';
const A1 = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4e01';
const A2 = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4e02';
const NID = '1234567890123';

const project = (id: string, code: string): MyProject => ({
  projectId: id,
  code,
  year: 2026,
  name: { bn: 'শীতবস্ত্র', en: 'Winter' },
  status: 'active',
  applyFrom: null,
  applyTo: null,
  perVolunteerLimit: null,
  dawahEnabled: false,
  via: 'assignment',
  permissionSet: null,
  isPaid: false,
  consentStatus: 'accepted',
  rulesVersion: 1,
  applicationsCounted: 0,
  applicationsLeft: null,
  leadsTeam: false,
});
const form = (id: string, projectId: string) =>
  ({
    id,
    formId: `${id}-f`,
    projectId,
    versionNo: 1,
    status: 'published',
    publishedAt: null,
    sections: [],
  }) as unknown as SnapshotView['formVersions'][number];
const application = (id: string, projectId: string): ApplicationSummary => ({
  id,
  appNo: null,
  projectId,
  beneficiaryId: null,
  beneficiaryName: `নাম ${NID}`,
  ownerVolunteerId: null,
  status: 'draft',
  stage: null,
  outcome: null,
  flags: [],
  districtId: 'd',
  unionId: 'u',
  submittedAt: null,
  waitingDays: null,
  etag: '"1"',
});
const view = (over: Partial<SnapshotView> = {}): SnapshotView => ({
  serverTime: '2026-10-31T10:00:00.000Z',
  nextSince: '2026-10-31T09:59:00.000Z',
  nextAfterId: null,
  hasMore: false,
  projects: [project(P1, 'WC'), project(P2, 'IF')],
  formVersions: [form('v1', P1), form('v2', P2)],
  applications: [application(A1, P1), application(A2, P2)],
  applicationIds: [A1, A2],
  locationsVersion: '12.a',
  ...over,
});

beforeEach(async () => {
  await afterSignIn({ sessionId: SESSION, userId: USER, deviceKey: 'k'.repeat(43) });
});
afterEach(async () => {
  forgetKeys();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

describe('the cached data set', () => {
  it('writes the projects, the forms and the applications, the personal parts sealed', async () => {
    await applySnapshot(view(), new Date('2026-10-31T10:00:05Z'));
    const db = offlineDb();
    expect((await cachedProjects()).map((p) => p.code)).toEqual(['WC', 'IF']);
    expect((await db.forms.toArray()).map((f) => [f.id, f.projectId])).toEqual([
      ['v1', P1],
      ['v2', P2],
    ]);
    const stored = (await db.applications.get(A1))!;
    expect(JSON.stringify({ ...stored, data: undefined })).not.toContain(NID);
    expect(
      await openRow<{ summary: ApplicationSummary }>(
        (await import('./keys')).currentDataKey()!,
        stored,
      ),
    ).toMatchObject({ summary: { beneficiaryName: `নাম ${NID}` }, detail: null });
    expect((await cachedApplications()).map((a) => a.id).sort()).toEqual([A1, A2]);
    expect(await cursor()).toEqual({ since: '2026-10-31T09:59:00.000Z', afterId: null });
    expect(await metaString(META.pulledAt)).toBe('2026-10-31T10:00:05.000Z');
  });

  it('drops what the server no longer lists: a project with its form, and an application', async () => {
    await applySnapshot(view(), new Date());
    await applySnapshot(
      view({
        projects: [project(P1, 'WC')],
        formVersions: [form('v1', P1)],
        applications: [],
        applicationIds: [A1],
        nextSince: '2026-10-31T10:10:00.000Z',
        nextAfterId: A1,
        hasMore: true,
      }),
      new Date(),
    );
    const db = offlineDb();
    expect((await db.projects.toArray()).map((p) => p.id)).toEqual([P1]);
    expect((await db.forms.toArray()).map((f) => f.id)).toEqual(['v1']);
    expect((await db.applications.toArray()).map((a) => a.id)).toEqual([A1]);
    expect(await cursor()).toEqual({ since: '2026-10-31T10:10:00.000Z', afterId: A1 });
  });

  it('keeps a record’s answers across a pull while the record did not change, and drops them when it did', async () => {
    await applySnapshot(view(), new Date());
    const detail = {
      ...application(A1, P1),
      formVersionId: 'v1',
      createdByUserId: null,
      identityKind: null,
      rejectionMessage: null,
      answers: [{ fieldKey: 'name', repeatIndex: 0, value: { t: 'short_text', v: 'নাম' } }],
      reviewedAt: null,
      approvedAt: null,
      familyDuplicateWarnings: [],
      availableActions: [],
    } as unknown as Parameters<typeof storeDetail>[0];
    await storeDetail(detail, '"1"');
    // the same record comes again in the next window: the answers stay
    await applySnapshot(view(), new Date());
    expect((await cachedApplication(A1))?.detail?.answers).toHaveLength(1);
    // the record changed on the server: the answers are to be pulled again
    await applySnapshot(
      view({ applications: [{ ...application(A1, P1), etag: '"2"' }, application(A2, P2)] }),
      new Date(),
    );
    expect((await cachedApplication(A1))?.detail).toBeNull();
  });

  it('keeps the signed-in person sealed for the open without network', async () => {
    const { rememberMe, cachedMe } = await import('./snapshot');
    const me = {
      id: USER,
      displayName: 'নমুনা স্বেচ্ছাসেবক',
      kind: 'volunteer' as const,
      state: 'active' as const,
      roles: ['volunteer'],
      language: 'bn' as const,
      permissionVersion: 1,
    };
    await rememberMe(me);
    const row = await offlineDb().meta.get(META.me);
    expect(
      JSON.stringify(row, (_k, v: unknown) => (v instanceof ArrayBuffer ? '<bytes>' : v)),
    ).not.toContain('নমুনা স্বেচ্ছাসেবক');
    expect(await cachedMe()).toEqual(me);
  });

  it('replaces the locations master with its version', async () => {
    await replaceLocations(
      [
        {
          id: 'l1',
          parentId: null,
          level: 'division',
          code: '10',
          name: { bn: 'ঢাকা', en: 'Dhaka' },
          postCode: null,
          active: true,
        },
      ],
      '12.a',
    );
    await replaceLocations(
      [
        {
          id: 'l2',
          parentId: null,
          level: 'division',
          code: '20',
          name: { bn: 'রংপুর', en: 'Rangpur' },
          postCode: null,
          active: true,
        },
      ],
      '12.b',
    );
    expect((await offlineDb().locations.toArray()).map((l) => l.id)).toEqual(['l2']);
    expect(await metaString(META.locationsVersion)).toBe('12.b');
  });
});
