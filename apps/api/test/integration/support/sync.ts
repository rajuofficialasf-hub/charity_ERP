import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import { SeedContext } from '../../../seed/context.js';
import { seedReferenceLists } from '../../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../../seed/sets/base/workflows.js';
import { accessWorld } from './access-fixtures.js';
import { applicationProject, IDENTITY_ANSWERS } from './applications.js';
import {
  account,
  type Account,
  type AuthHarness,
  bearer,
  login,
  type Session,
} from './auth-app.js';
import { fakeMobile, fakeNid } from './fixtures.js';
import type { FormExtras } from './forms.js';

/** One offline record as the phone sends it. */
export type SyncKind =
  'application_draft' | 'application_update' | 'application_submit' | 'field_update';
export interface SyncRec {
  clientUuid: string;
  kind: SyncKind;
  target?: string | null;
  projectId: string;
  formVersionId: string;
  baseVersion?: string | null;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  clientUpdatedAt: string;
  dependencies?: string[];
}

/** A row result as the tests read it; a failed one has no server id at runtime. */
export interface SyncOutcome {
  clientUuid: string;
  result: string;
  code: string;
  serverId: string;
  status: string;
  pendingPhotos: number;
  conflict?: { kept: 'server' | 'client'; serverValue?: unknown };
}

/**
 * A world for the sync tests: an active project of the PM's program with its application form,
 * a Dhaka volunteer and a Rangpur volunteer with consent, the Dhaka RPM on the project's area, and
 * the helpers that shape records and batches the way the phone does. `genderCodes` are added to
 * the gender list before the form is published, so the form offers them.
 */
export async function syncWorld(
  h: AuthHarness,
  form: FormExtras = {},
  options: { genderCodes?: string[] } = {},
) {
  const accounts = new Map<string, Account>();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  const world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  for (const code of options.genderCodes ?? [])
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en) VALUES ($1, 'gender', $2, $2, $2)`,
      [randomUUID(), code],
    );
  const api = () => request(h.server());
  const as = (userId: string) => login(h, accounts.get(userId)!);
  const at = (s: Session, method: 'get' | 'post' | 'put' | 'patch', path: string) =>
    api()[method](`/api/v1${path}`).set(bearer(s));
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'SYNCR',
    year: 2026,
    name: { bn: 'সিঙ্ক', en: 'Sync' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const project = made.body.data.id as string;
  const { formId, versionId } = await applicationProject(
    h,
    await as(world.users.monitoring),
    project,
    { form },
  );
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.rangpurVolunteer]],
  );
  const volunteerOf = (userId: string) => volunteers.rows.find((v) => v.user_id === userId)!.id;
  const generalVolunteer = volunteerOf(world.users.general);
  const rangpurVolunteer = volunteerOf(world.users.rangpurVolunteer);
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  for (const [volunteerId, region] of [
    [generalVolunteer, world.dhaka.division],
    [rangpurVolunteer, world.rangpur.division],
  ] as const)
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [randomUUID(), project, volunteerId, region, world.users.rpmDhaka],
    );

  const toAnswers = (record: Record<string, unknown>) =>
    Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
  const identity = (nid = fakeNid(), mobile = fakeMobile(), over: Record<string, unknown> = {}) =>
    toAnswers({ ...IDENTITY_ANSWERS(nid, mobile, world.dhaka), ...over });
  const minutesAgo = (minutes: number) =>
    new Date(h.clock.now().getTime() - minutes * 60_000).toISOString();
  const record = (
    over: Partial<SyncRec> & { kind: SyncKind; payload: Record<string, unknown> },
  ): SyncRec => ({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    clientCreatedAt: minutesAgo(30),
    clientUpdatedAt: minutesAgo(5),
    ...over,
  });
  const draft = (answers = identity(), over: Partial<SyncRec> = {}) =>
    record({ kind: 'application_draft', payload: { answers }, ...over });
  const batch = (
    s: Session,
    records: SyncRec[],
    options: { key?: string; deviceTime?: string; extra?: Record<string, unknown> } = {},
  ) =>
    at(s, 'post', '/sync/batch')
      .set('Idempotency-Key', options.key ?? randomUUID())
      .send({
        deviceTime: options.deviceTime ?? h.clock.now().toISOString(),
        records,
        ...(options.extra ?? {}),
      });
  const resultOf = (res: request.Response, clientUuid: string): SyncOutcome =>
    (res.body.data.results as SyncOutcome[]).find((r) => r.clientUuid === clientUuid)!;
  /** A workflow action with the version the caller last read, as the screen sends it. */
  const act = async (
    s: Session,
    id: string,
    action: string,
    body: Record<string, unknown> = {},
  ) => {
    const read = await at(s, 'get', `/applications/${id}`);
    return at(s, 'post', `/applications/${id}/actions/${action}`)
      .set('If-Match', (read.headers.etag as string | undefined) ?? '"none"')
      .send(body);
  };

  return {
    world,
    accounts,
    api,
    as,
    at,
    project,
    formId,
    versionId,
    generalVolunteer,
    rangpurVolunteer,
    toAnswers,
    identity,
    minutesAgo,
    record,
    draft,
    batch,
    resultOf,
    act,
  };
}
