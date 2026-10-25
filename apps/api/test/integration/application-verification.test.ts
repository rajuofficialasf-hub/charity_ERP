import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, applicationRow, IDENTITY_ANSWERS } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import { beneficiary, fakeMobile, fakeNid } from './support/fixtures';

// The verification queue: the entries of the public link wait as needs verification; an official
// of the region links an entry to the profile its number already has, or creates the profile when
// none has it, optionally gives it a volunteer of the project, or refuses it. An entry of a blocked
// person can only be refused.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let generalVolunteer: string;

/** A public entry with this identity number, waiting for verification; answers its id. */
const entry = (nid: string, flags: string[] = ['public_entry']) =>
  applicationRow(h.db, {
    projectId: project,
    versionId,
    loc: world.dhaka,
    status: 'needs_verification',
    answers: IDENTITY_ANSWERS(nid, fakeMobile(), world.dhaka),
    over: { flags },
  });
const read = (s: Session, id: string) => at(s, 'get', `/applications/${id}`);
const verify = async (s: Session, id: string, action: string, body: Record<string, unknown>) => {
  const before = await read(s, id);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', (before.headers.etag as string) ?? '"none"')
    .send(body);
};

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'VER',
    year: 2026,
    name: { bn: 'যাচাই', en: 'Verification' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project));
  generalVolunteer = (
    await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [
      world.users.general,
    ])
  ).rows[0]!.id;
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
});
afterAll(async () => h.close());

describe('the verification of a public entry', () => {
  it('links an entry to the profile its number has, with a number and a volunteer', async () => {
    const nid = fakeNid();
    const person = await beneficiary(h.db, world.dhaka, { nid });
    const id = await entry(nid, ['public_entry', 'existing_identity']);
    const rpm = await as(world.users.rpmDhaka);
    const res = await verify(rpm, id, 'verify_link', {
      linkBeneficiaryId: person,
      ownerVolunteerId: generalVolunteer,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'submitted',
      beneficiaryId: person,
      ownerVolunteerId: generalVolunteer,
    });
    expect(res.body.data.appNo).toMatch(/^VER-2026-\d{5}$/);
    // the new owner reaches it now
    expect((await read(await as(world.users.general), id)).status).toBe(200);
  });

  it('creates the profile for a new number and leaves the application the office’s without a volunteer', async () => {
    const id = await entry(fakeNid());
    const res = await verify(await as(world.users.rpmDhaka), id, 'verify_create', {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.beneficiaryId).toBeTruthy();
    expect(res.body.data.ownerVolunteerId).toBeNull();
    const audit = await h.db.query(
      `SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = 'application.verify_create'`,
      [id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('refuses a link to another person, a new profile for a known number, and a volunteer off the project', async () => {
    const nid = fakeNid();
    await beneficiary(h.db, world.dhaka, { nid });
    const other = await beneficiary(h.db, world.dhaka);
    const id = await entry(nid);
    const rpm = await as(world.users.rpmDhaka);
    const wrong = await verify(rpm, id, 'verify_link', { linkBeneficiaryId: other });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.verify_other_person' }),
    ]);
    const created = await verify(rpm, id, 'verify_create', {});
    expect(created.status).toBe(409);
    expect(created.body.error.code).toBe('application.verify_identity_exists');
    const fresh = await entry(fakeNid());
    const offProject = await verify(rpm, fresh, 'verify_create', {
      ownerVolunteerId: randomUUID(),
    });
    expect(offProject.status).toBe(422);
    expect(offProject.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.verify_owner_unfit' }),
    ]);
    // a link needs the profile it names
    expect((await verify(rpm, fresh, 'verify_link', {})).status).toBe(422);
    expect((await read(rpm, id)).body.data.status).toBe('needs_verification');
  });

  it('lets an entry of a blocked person only be refused', async () => {
    const nid = fakeNid();
    const person = await beneficiary(h.db, world.dhaka, { nid, is_blocked: true });
    const id = await entry(nid, ['public_entry', 'existing_identity']);
    const rpm = await as(world.users.rpmDhaka);
    const linked = await verify(rpm, id, 'verify_link', { linkBeneficiaryId: person });
    expect(linked.status).toBe(409);
    expect(linked.body.error.code).toBe('beneficiary.blocked');
    expect((await verify(rpm, id, 'verify_create', {})).status).toBe(409);
    const refused = await verify(rpm, id, 'reject_unverified', { reason: 'ব্লক করা ব্যক্তি' });
    expect(refused.status, JSON.stringify(refused.body)).toBe(200);
    expect(refused.body.data.status).toBe('rejected');
  });

  it('is the region’s: an official of another region finds neither the queue nor the entry', async () => {
    const id = await entry(fakeNid());
    const rangpur = await as(world.users.rpmRangpur);
    const queue = await at(
      rangpur,
      'get',
      `/projects/${project}/applications?status=needs_verification`,
    );
    expect((queue.body.data ?? []) as unknown[]).toEqual([]);
    expect((await verify(rangpur, id, 'verify_create', {})).status).toBe(404);
    const rpm = await as(world.users.rpmDhaka);
    const mine = await at(
      rpm,
      'get',
      `/projects/${project}/applications?status=needs_verification`,
    );
    expect(mine.body.data).toContainEqual(
      expect.objectContaining({ id, status: 'needs_verification', flags: ['public_entry'] }),
    );
    // the waiting entries are on the office's home
    const home = await at(rpm, 'get', '/me/attention');
    expect(home.body.data).toContainEqual(
      expect.objectContaining({ kind: 'verifications_pending' }),
    );
  });
});
