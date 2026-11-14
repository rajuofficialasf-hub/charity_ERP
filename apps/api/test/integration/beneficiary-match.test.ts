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
import * as f from './support/fixtures.js';
import { addVariantGroup, storeKeys } from './support/name-keys.js';

// The name lookup of an application without a document: an exact comparison of the keys of the
// name, the father's or husband's name and the village inside a union of an area of a project the
// caller works on; at most five people, only what a volunteer may see of them, every call audited
// and counted per day; and an application started for a picked person only with the token the
// lookup gave this caller for this project.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

interface Target {
  project: string;
  versionId: string;
}
/** The project of the lookups: the document asked "if they have one", in the Dhaka division. */
let open: Target;
/** A second such project the volunteer works on too. */
let second: Target;
let generalVolunteer: string;
let mediaUser: string;

async function projectOf(code: string): Promise<Target> {
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code,
    year: 2026,
    name: { bn: `প্রকল্প ${code}`, en: `Project ${code}` },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const project = made.body.data.id as string;
  const { versionId } = await applicationProject(h, await as(world.users.monitoring), project);
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await assign(project, generalVolunteer);
  return { project, versionId };
}
/** A volunteer of their own on the project, so their day's count is theirs alone. */
async function freshVolunteer() {
  const actor = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
  accounts.set(actor.id, actor);
  await assign(open.project, await f.volunteer(h.db, world.dhaka, actor.id, { type: 'general' }));
  return actor;
}
const assign = (projectId: string, volunteerId: string) =>
  h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), projectId, volunteerId, world.dhaka.division, world.users.rpmDhaka],
  );

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
  mediaUser = await make('staff')('media_team');
  generalVolunteer = (
    await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [
      world.users.general,
    ])
  ).rows[0]!.id;
  open = await projectOf('MAT');
  second = await projectOf('MTB');
});
afterAll(async () => h.close());

let counter = 0;
/** A person nobody else in the tests is, as typed and as written on the profile. */
function person(over: Partial<Record<'name' | 'father' | 'village', string>> = {}) {
  const n = ++counter;
  return {
    name: over.name ?? `করিম উদ্দিন ${n}`,
    father: over.father ?? `আব্দুল জব্বার ${n}`,
    village: over.village ?? `চরপাড়া ${n}`,
  };
}
/** A live profile in the Dhaka union, with its keys stored as every write stores them. */
async function profile(p: ReturnType<typeof person>, over: Record<string, unknown> = {}) {
  const id = await f.beneficiary(h.db, world.dhaka, {
    name: p.name,
    father_or_husband_name: p.father,
    village: p.village,
    ...over,
  });
  await storeKeys(h.container, [id]);
  return id;
}
const match = (
  s: Session,
  p: { name: string; father: string; village: string },
  over: Record<string, unknown> = {},
) =>
  at(s, 'post', '/beneficiaries/match').send({
    projectId: open.project,
    name: p.name,
    fatherOrHusbandName: p.father,
    unionId: world.dhaka.union,
    village: p.village,
    ...over,
  });
const matchedRows = (actor: string) =>
  h.db.query<{ new: Record<string, unknown> }>(
    `SELECT new FROM audit_log WHERE action = 'beneficiary.matched' AND actor_user_id = $1
      ORDER BY created_at, id`,
    [actor],
  );
const text = (v: string) => ({ t: 'short_text', v });
/** The answers of a new application for the person, without a document and a mobile. */
const answersFor = (p: ReturnType<typeof person>, over: Record<string, unknown> = {}) =>
  Object.entries({
    ...IDENTITY_ANSWERS('', '', world.dhaka),
    q_name: text(p.name),
    q_father: text(p.father),
    q_village: text(p.village),
    ...over,
  })
    .filter(([key]) => !['q_id', 'q_mobile'].includes(key) || key in over)
    .map(([fieldKey, value]) => ({ fieldKey, value }));
const create = (s: Session, target: Target, answers: unknown[], body: Record<string, unknown>) =>
  at(s, 'post', `/projects/${target.project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: target.project,
    formVersionId: target.versionId,
    answers,
    ...body,
  });
const tokenFor = async (s: Session, p: ReturnType<typeof person>) => {
  const res = await match(s, p);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.people[0].pickToken as string;
};

describe('the name lookup', () => {
  it('finds the person by the exact keys in the union, with only the name, the father’s or husband’s name, the village, the years of help and the caller’s own projects', async () => {
    const p = person();
    const id = await profile(p, { mobile: '01711000001' });
    // helped in a project the volunteer works on (2024), and in one they do not (2025); a draft
    // elsewhere is no help
    const own = await f.project(h.db, {
      year: 2024,
      name_bn: 'শীতবস্ত্র 2024',
      name_en: 'Winter 2024',
    });
    await assign(own.id, generalVolunteer);
    const other = await f.project(h.db, {
      year: 2025,
      name_bn: 'ইফতার 2025',
      name_en: 'Iftar 2025',
    });
    const unhelped = await f.project(h.db, { year: 2023 });
    for (const [project, status] of [
      [own, 'approved'],
      [other, 'completed'],
      [unhelped, 'draft'],
    ] as const)
      await applicationRow(h.db, {
        projectId: project.id,
        versionId: project.formVersion,
        loc: world.dhaka,
        status,
        beneficiaryId: id,
      });
    const res = await match(await as(world.users.general), p);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({
      total: 1,
      people: [
        {
          name: p.name,
          fatherOrHusbandName: p.father,
          village: p.village,
          helpedYears: [2024, 2025],
          projects: [{ name: { bn: 'শীতবস্ত্র 2024', en: 'Winter 2024' }, year: 2024 }],
          blocked: false,
          pickToken: expect.any(String),
        },
      ],
    });
    // never a number, a contact, a BEN number or an id, not even inside the token
    const benNo = (await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [id])).rows[0]
      .ben_no as number;
    const token = res.body.data.people[0].pickToken as string;
    const all = JSON.stringify(res.body) + Buffer.from(token, 'base64url').toString('latin1');
    for (const secret of [id, '01711000001', String(benNo).padStart(7, '0')])
      expect(all).not.toContain(secret);
  });

  it('matches a title and a known spelling variant, and nobody in another village or for another father', async () => {
    const p = person({ name: `মোঃ সিরাজ হোসেন ${counter + 1}` });
    await profile(p);
    const s = await as(world.users.general);
    const plain = { ...p, name: p.name.replace('মোঃ ', '') };
    expect((await match(s, plain)).body.data.total).toBe(1);
    // a spelling the list does not join is another name until the list joins it
    const variant = { ...plain, name: plain.name.replace('হোসেন', 'হোসাইন') };
    expect((await match(s, variant)).body.data.total).toBe(0);
    await addVariantGroup(h.db, h.container, ['হোসেন', 'হোসাইন'], world.users.head);
    await storeKeys(
      h.container,
      (await h.db.query<{ id: string }>('SELECT id FROM beneficiaries')).rows.map((r) => r.id),
    );
    expect((await match(s, variant)).body.data.total).toBe(1);
    expect((await match(s, { ...p, village: 'অন্য গ্রাম' })).body.data.total).toBe(0);
    expect((await match(s, { ...p, father: 'অন্য পিতা' })).body.data.total).toBe(0);
  });

  it('shows five and counts them all', async () => {
    const p = person();
    for (let i = 0; i < 7; i++) await profile(p);
    const res = await match(await as(world.users.general), p);
    expect(res.body.data.total).toBe(7);
    expect(res.body.data.people).toHaveLength(5);
  });

  it('marks a blocked person as one who cannot be picked, with no token', async () => {
    const p = person();
    await profile(p, { is_blocked: true });
    const res = await match(await as(world.users.general), p);
    expect(res.body.data.people).toEqual([
      expect.objectContaining({ name: p.name, blocked: true, pickToken: null }),
    ]);
  });

  it('refuses a union outside the project’s areas, a caller not on the project and a role without the permission', async () => {
    const p = person();
    await profile(p);
    const general = await as(world.users.general);
    const outside = await match(general, p, { unionId: world.rangpur.union });
    expect(outside.status, JSON.stringify(outside.body)).toBe(403);
    // a place that is not a union is no union at all
    const district = await match(general, p, { unionId: world.dhaka.district });
    expect(district.status).toBe(422);
    // a volunteer of the region who does not work on this project
    expect((await match(await as(world.users.rangpurVolunteer), p)).status).toBe(403);
    // the Media Team does not look people up
    expect((await match(await as(mediaUser), p)).status).toBe(403);
    // the refusals look nobody up, so they write no lookup's row
    const rows = (await matchedRows(world.users.rangpurVolunteer)).rows;
    expect(rows).toEqual([]);
  });

  it('writes an audit row for every call, found or not, with the project, the union and the count but no name', async () => {
    const actor = await freshVolunteer();
    const s = await as(actor.id);
    const p = person();
    await profile(p);
    await match(s, p);
    await match(s, person());
    const rows = (await matchedRows(actor.id)).rows.map((r) => r.new);
    expect(rows).toEqual([
      { projectId: open.project, unionId: world.dhaka.union, found: 1 },
      { projectId: open.project, unionId: world.dhaka.union, found: 0 },
    ]);
    expect(JSON.stringify(rows)).not.toContain(p.name);
  });

  it('answers 429 past the day’s setting, audited as limited', async () => {
    const actor = await freshVolunteer();
    await h.db.query(
      `INSERT INTO settings (key, value) VALUES ('lookup.match_daily_limit', '2')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    try {
      const s = await as(actor.id);
      const p = person();
      expect((await match(s, p)).status).toBe(200);
      expect((await match(s, p)).status).toBe(200);
      const over = await match(s, p);
      expect(over.status).toBe(429);
      expect(over.body.error.code).toBe('beneficiary.match_limit');
      const rows = (await matchedRows(actor.id)).rows.map((r) => r.new);
      expect(rows.at(-1)).toEqual({
        projectId: open.project,
        unionId: world.dhaka.union,
        limited: true,
      });
      expect(rows).toHaveLength(3);
    } finally {
      await h.db.query(`DELETE FROM settings WHERE key = 'lookup.match_daily_limit'`);
    }
  });
});

describe('an application for a picked person', () => {
  it('binds the person at once, with the name locked to the profile’s, and the send makes no new profile', async () => {
    const p = person({ name: `মোঃ রহিম ${counter + 1}` });
    const id = await profile(p);
    const s = await as(world.users.general);
    // typed without the title: the keys match, and the profile's name is the one kept
    const typed = { ...p, name: p.name.replace('মোঃ ', '') };
    const token = await tokenFor(s, typed);
    const made = await create(s, open, answersFor(typed), { pickToken: token });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data).toMatchObject({ beneficiaryId: id, status: 'draft' });
    const answer = (key: string) =>
      (made.body.data.answers as { fieldKey: string; value: unknown }[]).find(
        (a) => a.fieldKey === key,
      )?.value;
    expect(answer('q_name')).toEqual(text(p.name));
    const audit = await h.db.query<{ new: Record<string, unknown> }>(
      `SELECT new FROM audit_log WHERE action = 'application.create' AND entity_id = $1`,
      [made.body.data.id],
    );
    expect(audit.rows[0]!.new).toMatchObject({ beneficiaryId: id, pickedByName: true });
    const profiles = async () =>
      (await h.db.query('SELECT count(*)::int AS n FROM beneficiaries')).rows[0].n as number;
    const before = await profiles();
    const read = await at(s, 'get', `/applications/${made.body.data.id}`);
    const sent = await at(s, 'post', `/applications/${made.body.data.id}/actions/submit`)
      .set('If-Match', read.headers.etag as string)
      .send({});
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data.beneficiaryId).toBe(id);
    expect(await profiles()).toBe(before);
  });

  it('gives the volunteer no more of the person than the application they typed', async () => {
    const p = person();
    const nid = f.fakeNid();
    const id = await profile(p, { nid, mobile: '01711000099' });
    const s = await as(world.users.general);
    const made = await create(s, open, answersFor(p), { pickToken: await tokenFor(s, p) });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const read = await at(s, 'get', `/applications/${made.body.data.id}`);
    expect(read.status).toBe(200);
    // the record says no more than a known person's does: no number, no contact of the profile
    const body = JSON.stringify(read.body);
    expect(body).not.toContain(nid);
    expect(body).not.toContain('01711000099');
    expect(read.body.data.beneficiaryId).toBe(id);
    expect(read.body.data.identityKind).toBe('none');
  });

  it('keeps a document typed with it in the application’s answers, never on the profile', async () => {
    const p = person();
    const id = await profile(p, { nid: null });
    const s = await as(world.users.general);
    const nid = f.fakeNid();
    const made = await create(s, open, answersFor(p, { q_id: text(nid) }), {
      pickToken: await tokenFor(s, p),
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data.beneficiaryId).toBe(id);
    const answers = made.body.data.answers as { fieldKey: string; value: unknown }[];
    expect(answers.find((a) => a.fieldKey === 'q_id')?.value).toEqual(text(nid));
    // an edit that keeps it is taken; one that changes it is not
    const etag = made.headers.etag as string;
    const kept = await at(s, 'patch', `/applications/${made.body.data.id}`)
      .set('If-Match', etag)
      .send({ answers });
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    const changed = await at(s, 'patch', `/applications/${made.body.data.id}`)
      .set('If-Match', kept.headers.etag as string)
      .send({
        answers: answers.map((a) =>
          a.fieldKey === 'q_id' ? { ...a, value: text(f.fakeNid()) } : a,
        ),
      });
    expect(changed.status).toBe(422);
    expect(changed.body.error.details[0].code).toBe('beneficiary.locked_field');
    const sent = await at(s, 'post', `/applications/${made.body.data.id}/actions/submit`)
      .set('If-Match', kept.headers.etag as string)
      .send({});
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(
      (await h.db.query('SELECT nid, birth_reg FROM beneficiaries WHERE id = $1', [id])).rows[0],
    ).toEqual({ nid: null, birth_reg: null });
  });

  it('refuses a forged, an altered, an expired, another caller’s and another project’s token with one code', async () => {
    const p = person();
    const id = await profile(p);
    const s = await as(world.users.general);
    const token = await tokenFor(s, p);
    const refused = async (session: Session, target: Target, pickToken: string) => {
      const res = await create(session, target, answersFor(p), { pickToken });
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.error.code).toBe('beneficiary.pick_invalid');
    };
    await refused(s, open, 'not-a-token');
    const altered = (token.startsWith('A') ? 'B' : 'A') + token.slice(1);
    await refused(s, open, altered);
    const expired = h.container.beneficiaryMatch.seal({
      u: world.users.general,
      p: open.project,
      b: id,
      e: h.container.clock.now().getTime() - 1000,
    });
    await refused(s, open, expired);
    // the RPM brings applications too, but the token was the volunteer's
    await refused(await as(world.users.rpmDhaka), open, token);
    await refused(s, second, token);
    // the token itself was good all along
    expect((await create(s, open, answersFor(p), { pickToken: token })).status).toBe(201);
  });

  it('refuses a blocked person even with a good token', async () => {
    const p = person();
    const id = await profile(p, { is_blocked: true });
    const sealed = h.container.beneficiaryMatch.seal({
      u: world.users.general,
      p: open.project,
      b: id,
      e: h.container.clock.now().getTime() + 60_000,
    });
    const res = await create(await as(world.users.general), open, answersFor(p), {
      pickToken: sealed,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.blocked');
  });

  it('takes the token and the mark of a lookup left out offline through the phone’s sync as well', async () => {
    const p = person();
    const id = await profile(p);
    const s = await as(world.users.general);
    const token = await tokenFor(s, p);
    const now = h.container.clock.now().toISOString();
    const draft = (payload: Record<string, unknown>) => ({
      clientUuid: randomUUID(),
      kind: 'application_draft',
      projectId: open.project,
      formVersionId: open.versionId,
      payload,
      clientCreatedAt: now,
      clientUpdatedAt: now,
    });
    const picked = draft({ answers: answersFor(p), pickToken: token });
    const skipped = draft({ answers: answersFor(person()), nameLookupSkipped: true });
    const res = await at(s, 'post', '/sync/batch')
      .set('Idempotency-Key', randomUUID())
      .send({ deviceTime: now, records: [picked, skipped] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const results = res.body.data.results as { clientUuid: string; serverId: string }[];
    const serverOf = (clientUuid: string) => results.find((r) => r.clientUuid === clientUuid)!;
    expect(serverOf(picked.clientUuid)).toMatchObject({ result: 'synced' });
    const rows = await h.db.query<{ id: string; beneficiary_id: string | null }>(
      'SELECT id, beneficiary_id FROM applications WHERE id = ANY($1::uuid[])',
      [[serverOf(picked.clientUuid).serverId, serverOf(skipped.clientUuid).serverId]],
    );
    const byId = new Map(rows.rows.map((r) => [r.id, r.beneficiary_id]));
    expect(byId.get(serverOf(picked.clientUuid).serverId)).toBe(id);
    // an entry whose lookup was left out has no person until the send, which compares it
    expect(byId.get(serverOf(skipped.clientUuid).serverId)).toBeNull();
    const audit = await h.db.query<{ new: Record<string, unknown> }>(
      `SELECT new FROM audit_log WHERE action = 'application.create' AND entity_id = $1`,
      [serverOf(skipped.clientUuid).serverId],
    );
    expect(audit.rows[0]!.new).toMatchObject({ nameLookupSkipped: true });
  });
});
