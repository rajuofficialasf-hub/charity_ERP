import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { applicationProject, applicationRow, IDENTITY_ANSWERS } from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { beneficiary, fakeMobile, fakeNid } from './support/fixtures.js';

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
const entry = (nid: string, flags: string[] = ['public_entry'], mobile = fakeMobile()) =>
  applicationRow(h.db, {
    projectId: project,
    versionId,
    loc: world.dhaka,
    status: 'needs_verification',
    answers: IDENTITY_ANSWERS(nid, mobile, world.dhaka),
    over: { flags },
  });
const contactOf = async (beneficiaryId: string) =>
  (
    await h.db.query<{ mobile: string; village: string }>(
      'SELECT mobile, village FROM beneficiaries WHERE id = $1',
      [beneficiaryId],
    )
  ).rows[0];
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
  const ctx = new SeedContext(h.container.prisma);
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

describe('the checks of a verification', () => {
  it('refuses a link with no profile behind the number, and a profile outside the caller’s identity scope', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const fresh = await entry(fakeNid());
    const none = await verify(rpm, fresh, 'verify_link', { linkBeneficiaryId: randomUUID() });
    expect(none.status).toBe(422);
    expect(none.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.verify_no_profile' }),
    ]);
    // the profile lives in Rangpur, outside the Dhaka RPM's identity scope
    const nid = fakeNid();
    const far = await beneficiary(h.db, world.rangpur, { nid });
    const id = await entry(nid, ['public_entry', 'existing_identity']);
    expect((await verify(rpm, id, 'verify_link', { linkBeneficiaryId: far })).status).toBe(404);
  });

  it('refuses a blocked owner, an owner at the limit, and an owner whose own mobile the entry gives', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const block = randomUUID();
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [block, generalVolunteer, world.users.rpmDhaka],
    );
    try {
      const blocked = await verify(rpm, await entry(fakeNid()), 'verify_create', {
        ownerVolunteerId: generalVolunteer,
      });
      expect(blocked.status).toBe(422);
      expect(blocked.body.error.details).toEqual([
        expect.objectContaining({ code: 'application.verify_owner_unfit' }),
      ]);
    } finally {
      await h.db.query(
        `UPDATE blocklist SET active = false, released_by = $2, released_at = now(), release_reason = 'test' WHERE id = $1`,
        [block, world.users.rpmDhaka],
      );
    }
    // an owner whose applications already fill the project's limit
    await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      status: 'submitted',
      ownerVolunteerId: generalVolunteer,
      answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
    });
    const owned = await h.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM applications WHERE project_id = $1 AND owner_volunteer_id = $2 AND status NOT IN ('rejected', 'deleted')`,
      [project, generalVolunteer],
    );
    await h.db.query('UPDATE projects SET per_volunteer_limit = $2 WHERE id = $1', [
      project,
      owned.rows[0]!.n,
    ]);
    try {
      const full = await verify(rpm, await entry(fakeNid()), 'verify_create', {
        ownerVolunteerId: generalVolunteer,
      });
      expect(full.status).toBe(422);
      expect(full.body.error.details).toEqual([
        expect.objectContaining({ code: 'application.verify_owner_full' }),
      ]);
    } finally {
      await h.db.query('UPDATE projects SET per_volunteer_limit = 50 WHERE id = $1', [project]);
    }
    // the new profile is made with the chosen owner, so the owner's own mobile is refused
    const own = await h.db.query<{ mobile: string }>('SELECT mobile FROM users WHERE id = $1', [
      world.users.general,
    ]);
    const mine = await verify(
      rpm,
      await entry(fakeNid(), ['public_entry'], own.rows[0]!.mobile),
      'verify_create',
      {
        ownerVolunteerId: generalVolunteer,
      },
    );
    expect(mine.status).toBe(409);
    expect(mine.body.error.code).toBe('beneficiary.mobile_is_volunteer_mobile');
  });

  it('refuses a profile or an owner named on any other action', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const id = await entry(fakeNid());
    const link = await verify(rpm, id, 'reject_unverified', {
      reason: 'ভুল এন্ট্রি',
      linkBeneficiaryId: randomUUID(),
    });
    expect(link.status).toBe(422);
    expect(link.body.error.details[0].path).toBe('linkBeneficiaryId');
    const owner = await verify(rpm, id, 'reject_unverified', {
      reason: 'ভুল এন্ট্রি',
      ownerVolunteerId: generalVolunteer,
    });
    expect(owner.status).toBe(422);
    expect(owner.body.error.details[0].path).toBe('ownerVolunteerId');
  });
});

describe('the verification of a public entry', () => {
  it('links an entry to the profile its number has, with a number and a volunteer', async () => {
    const nid = fakeNid();
    const person = await beneficiary(h.db, world.dhaka, { nid });
    const before = await contactOf(person);
    // the entry gives another mobile than the profile has
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
    // a public entry never rewrites the known person's contact data
    expect(await contactOf(person)).toEqual(before);
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

  it('verifies an entry without a number as a new person: a profile without a document', async () => {
    // the project asks the document "if they have one" (the distribution workflow starts so)
    const { q_id: _number, ...answers } = IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka);
    const name = `নম্বরহীন ${randomUUID().slice(0, 8)}`;
    const id = await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: { ...answers, q_name: { t: 'short_text', v: name } },
      over: { flags: ['public_entry'] },
    });
    const res = await verify(await as(world.users.rpmDhaka), id, 'verify_create', {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'submitted',
      identityKind: 'none',
      hasDocument: false,
    });
    const made = await h.db.query(
      'SELECT id, nid, birth_reg, mobile FROM beneficiaries WHERE name = $1',
      [name],
    );
    expect(made.rows).toEqual([
      { id: res.body.data.beneficiaryId, nid: null, birth_reg: null, mobile: answers.q_mobile.v },
    ]);
    const stored = await h.db.query(
      'SELECT beneficiary_id, identity_kind FROM applications WHERE id = $1',
      [id],
    );
    expect(stored.rows).toEqual([
      { beneficiary_id: res.body.data.beneficiaryId, identity_kind: 'none' },
    ]);
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
    const created = await verify(rpm, id, 'verify_create', {});
    expect(created.status).toBe(409);
    expect(created.body.error.code).toBe('application.verify_identity_exists');
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
    // the project lies outside the Rangpur RPM's reach altogether
    expect(queue.status).toBe(404);
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
    const waiting = await h.db.query<{ id: string }>(
      `SELECT id FROM applications WHERE project_id = $1 AND status = 'needs_verification'
        ORDER BY created_at, id`,
      [project],
    );
    expect(home.body.data).toContainEqual({
      kind: 'verifications_pending',
      count: waiting.rowCount,
      href: `/admin/applications/${waiting.rows[0]!.id}`,
    });
  });
});
