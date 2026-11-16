import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  applicationProject,
  applicationRow,
  IDENTITY_ANSWERS,
  principalOf,
} from './support/applications.js';
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
import { question } from './support/forms.js';
import { draftProject } from './support/projects.js';

// Whose number a beneficiary's mobile is: two optional questions of a form (the owner, from the
// reference list, and the owner's name) fill two columns of the profile. A submit writes them to
// a new profile, a later application of a known person changes them through the contact service
// with a change-log row each, an owner is never kept without a number, and every reader who is
// not shown the mobile is shown neither.
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
/** Two projects whose form asks whose number it is, and one whose form has the seven questions only. */
let asking: Target;
let askingToo: Target;
let plain: Target;
let generalVolunteer: string;
let mediaUser: string;

type AnswerRecord = Record<string, unknown>;
const text = (v: string) => ({ t: 'short_text', v });
const owner = (code: string) => ({ t: 'single_select', v: code });
/** The identity answers of a new person, with these in the place of the fixture's. */
const answersOf = (over: AnswerRecord = {}, without: string[] = []) => {
  const tag = randomUUID().slice(0, 8);
  const all: AnswerRecord = {
    ...IDENTITY_ANSWERS(f.fakeNid(), f.fakeMobile(), world.dhaka),
    q_name: text(`নম্বরের মালিক ${tag}`),
    ...over,
  };
  return Object.entries(all)
    .filter(([key]) => !without.includes(key))
    .map(([fieldKey, value]) => ({ fieldKey, value }));
};
const create = (s: Session, target: Target, answers: unknown[]) =>
  at(s, 'post', `/projects/${target.project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: target.project,
    formVersionId: target.versionId,
    answers,
  });
const act = async (s: Session, id: string, action: string) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', (read.headers.etag as string | undefined) ?? '"none"')
    .send({});
};
/** A new application, sent; answers the record. */
const sent = async (s: Session, target: Target, answers: unknown[]) => {
  const made = await create(s, target, answers);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const res = await act(s, made.body.data.id as string, 'submit');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as { id: string; beneficiaryId: string; status: string };
};
const ownerOf = async (beneficiaryId: string) =>
  (
    await h.db.query<{
      mobile: string | null;
      mobile_owner_code: string | null;
      mobile_owner_name: string | null;
    }>('SELECT mobile, mobile_owner_code, mobile_owner_name FROM beneficiaries WHERE id = $1', [
      beneficiaryId,
    ])
  ).rows[0]!;
const ownerChanges = async (beneficiaryId: string) =>
  (
    await h.db.query<{ field: string; old_value: unknown; new_value: unknown; created_by: string }>(
      `SELECT field, old_value, new_value, created_by FROM field_changes
        WHERE entity_type = 'beneficiary' AND entity_id = $1 AND kind = 'contact_update'
        ORDER BY created_at, field`,
      [beneficiaryId],
    )
  ).rows;

/** The two questions as the builder's press writes them, with the builder's own (empty) options. */
const OWNER_QUESTIONS = [
  question('q_owner', 'single_select', {
    standardColumn: 'mobile_owner_code',
    logic: { show_if: { field: 'q_mobile', op: 'not_empty' } },
  }),
  question('q_owner_name', 'short_text', {
    standardColumn: 'mobile_owner_name',
    logic: { show_if: { field: 'q_owner', op: 'neq', value: 'own' } },
  }),
];

async function projectOf(code: string, fields?: unknown[]): Promise<Target> {
  const made = await draftProject(h, await as(world.users.pm), {
    programId: world.a1.program,
    code,
    year: 2026,
    name: { bn: 'কার নম্বর', en: 'Whose number' },
    // the distribution workflow starts with the document and the mobile asked "if they have one"
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const project = made.body.data.id as string;
  const { versionId } = await applicationProject(
    h,
    await as(world.users.monitoring),
    project,
    fields ? { form: { fields } } : {},
  );
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
  return { project, versionId };
}

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
  asking = await projectOf('OWN', OWNER_QUESTIONS);
  askingToo = await projectOf('OWB', OWNER_QUESTIONS);
  plain = await projectOf('OWP');
});
afterAll(async () => h.close());

describe('the question whose number it is', () => {
  it('takes its options from the list mobile_owner, whatever the builder wrote, and refuses a code the list does not hold', async () => {
    const s = await as(world.users.general);
    const made = await create(s, asking, answersOf({ q_owner: owner('family') }));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const fields = (
      made.body.data.form.sections as {
        fields: { fieldKey: string; options?: { code: string; label: { bn: string } }[] }[];
      }[]
    ).flatMap((section) => section.fields);
    const options = fields.find((field) => field.fieldKey === 'q_owner')!.options!;
    expect(options.map((o) => o.code)).toEqual(['own', 'family', 'neighbour', 'other']);
    expect(options.map((o) => o.label.bn)).toEqual([
      'নিজের',
      'পরিবারের সদস্যের',
      'প্রতিবেশীর',
      'অন্য কারও',
    ]);
    const unlisted = await create(s, asking, answersOf({ q_owner: owner('landlord') }));
    expect(unlisted.status).toBe(422);
    expect(unlisted.body.error.details).toEqual([
      expect.objectContaining({ path: 'q_owner', code: 'validation.option_unknown' }),
    ]);
  });
});

describe('a submit that says whose number it is', () => {
  it('writes the owner and the owner’s name to the new profile, and the office reads both', async () => {
    const s = await as(world.users.general);
    const record = await sent(
      s,
      asking,
      answersOf({ q_owner: owner('neighbour'), q_owner_name: text('  করিম মিয়া ') }),
    );
    expect(await ownerOf(record.beneficiaryId)).toMatchObject({
      mobile: expect.stringMatching(/^01\d{9}$/),
      mobile_owner_code: 'neighbour',
      mobile_owner_name: 'করিম মিয়া',
    });
    const profile = await at(
      await as(world.users.rpmDhaka),
      'get',
      `/beneficiaries/${record.beneficiaryId}`,
    );
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).toMatchObject({
      mobileOwnerCode: 'neighbour',
      mobileOwnerName: 'করিম মিয়া',
    });
    // a new profile is made with its values: nothing changed, so nothing is logged
    expect(await ownerChanges(record.beneficiaryId)).toEqual([]);
  });

  it('keeps no name beside the person’s own number, and nothing where the questions are left empty', async () => {
    const s = await as(world.users.general);
    const own = await sent(
      s,
      asking,
      answersOf({ q_owner: owner('own'), q_owner_name: text('করিম মিয়া') }),
    );
    expect(await ownerOf(own.beneficiaryId)).toMatchObject({
      mobile_owner_code: 'own',
      mobile_owner_name: null,
    });
    const silent = await sent(s, asking, answersOf());
    expect(await ownerOf(silent.beneficiaryId)).toMatchObject({
      mobile: expect.stringMatching(/^01\d{9}$/),
      mobile_owner_code: null,
      mobile_owner_name: null,
    });
  });

  it('stores no owner without a mobile, by the form and by the server alike', async () => {
    const s = await as(world.users.general);
    // through the form: the question is not shown without a mobile, and its answer is dropped
    const dropped = await sent(
      s,
      asking,
      answersOf({ q_owner: owner('neighbour'), q_owner_name: text('করিম মিয়া') }, ['q_mobile']),
    );
    expect(await ownerOf(dropped.beneficiaryId)).toEqual({
      mobile: null,
      mobile_owner_code: null,
      mobile_owner_name: null,
    });
    // past the form: a draft whose stored answers hold an owner and no mobile
    const { q_mobile: _mobile, ...answers } = IDENTITY_ANSWERS(
      f.fakeNid(),
      f.fakeMobile(),
      world.dhaka,
    );
    const id = await applicationRow(h.db, {
      projectId: asking.project,
      versionId: asking.versionId,
      loc: world.dhaka,
      status: 'draft',
      ownerVolunteerId: generalVolunteer,
      createdByUserId: world.users.general,
      answers: {
        ...answers,
        q_name: text(`নম্বরহীন ${randomUUID().slice(0, 8)}`),
        q_owner: owner('family'),
        q_owner_name: text('রহিম'),
      },
      over: { beneficiary_id: null },
    });
    const res = await act(s, id, 'submit');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await ownerOf(res.body.data.beneficiaryId as string)).toEqual({
      mobile: null,
      mobile_owner_code: null,
      mobile_owner_name: null,
    });
  });

  it('refuses a name longer than the profile keeps, on its question', async () => {
    const s = await as(world.users.general);
    const made = await create(
      s,
      asking,
      answersOf({ q_owner: owner('other'), q_owner_name: text('ক'.repeat(201)) }),
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const res = await act(s, made.body.data.id as string, 'submit');
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'answers.q_owner_name', code: 'validation.too_long' }),
    ]);
    const made200 = await sent(
      s,
      asking,
      answersOf({ q_owner: owner('other'), q_owner_name: text('ক'.repeat(200)) }),
    );
    expect((await ownerOf(made200.beneficiaryId)).mobile_owner_name).toHaveLength(200);
  });

  it('refuses an owner the list no longer holds at the send that makes the profile, as it does for a known person, and makes no profile', async () => {
    // the list holds the code while the form is published, so the form offers it, and loses it
    // before the send
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en) VALUES ($1, 'mobile_owner', 'tenant', 'ভাড়াটিয়ার', 'Of a tenant')`,
      [randomUUID()],
    );
    const withTenant = await projectOf('OWT', OWNER_QUESTIONS);
    const s = await as(world.users.general);
    const nid = f.fakeNid();
    const made = await create(
      s,
      withTenant,
      answersOf({ q_id: text(nid), q_owner: owner('tenant'), q_owner_name: text('রহিম') }),
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    // a person the office already knows, whose later application names the same owner
    const person = await sent(
      s,
      asking,
      answersOf({ q_owner: owner('family'), q_owner_name: text('করিম মিয়া') }),
    );
    const { nid: knownNid, mobile } = (
      await h.db.query<{ nid: string; mobile: string }>(
        'SELECT nid, mobile FROM beneficiaries WHERE id = $1',
        [person.beneficiaryId],
      )
    ).rows[0]!;
    const rpm = await as(world.users.rpmDhaka);
    const forKnown = await create(
      rpm,
      withTenant,
      answersOf({
        q_id: text(knownNid),
        q_mobile: { t: 'phone', v: mobile },
        q_owner: owner('tenant'),
        q_owner_name: text('রহিম'),
      }),
    );
    expect(forKnown.status, JSON.stringify(forKnown.body)).toBe(201);
    await h.db.query(
      `DELETE FROM reference_lists WHERE list_key = 'mobile_owner' AND code = 'tenant'`,
    );

    const refused = await act(s, made.body.data.id as string, 'submit');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error).toMatchObject({
      code: 'validation.failed',
      details: [{ path: 'answers', code: 'validation.option_unknown' }],
    });
    const profiles = await h.db.query('SELECT 1 FROM beneficiaries WHERE nid = $1', [nid]);
    expect(profiles.rowCount).toBe(0);
    const draft = await at(s, 'get', `/applications/${made.body.data.id as string}`);
    expect(draft.body.data).toMatchObject({ status: 'draft', beneficiaryId: null });

    const known = await act(rpm, forKnown.body.data.id as string, 'submit');
    expect(known.status, JSON.stringify(known.body)).toBe(422);
    expect(known.body.error.details).toEqual([
      expect.objectContaining({ path: 'answers', code: 'validation.option_unknown' }),
    ]);
    expect(await ownerOf(person.beneficiaryId)).toMatchObject({ mobile_owner_code: 'family' });
  });

  it('still takes an application of a form published without the two questions', async () => {
    const s = await as(world.users.general);
    const record = await sent(s, plain, answersOf());
    expect(record.status).toBe('submitted');
    expect(await ownerOf(record.beneficiaryId)).toMatchObject({
      mobile: expect.stringMatching(/^01\d{9}$/),
      mobile_owner_code: null,
      mobile_owner_name: null,
    });
  });
});

describe('a later application of a known person', () => {
  /** A person whose number is a neighbour's, known by this NID. */
  async function known() {
    const nid = f.fakeNid();
    const mobile = f.fakeMobile();
    const record = await sent(
      await as(world.users.general),
      asking,
      answersOf({
        q_id: text(nid),
        q_mobile: { t: 'phone', v: mobile },
        q_owner: owner('neighbour'),
        q_owner_name: text('করিম মিয়া'),
      }),
    );
    return { nid, mobile, beneficiaryId: record.beneficiaryId };
  }

  it('changes whose number it is through the contact service, each change with its log row, for an official who may edit the contact', async () => {
    const person = await known();
    const rpm = await as(world.users.rpmDhaka);
    const record = await sent(
      rpm,
      askingToo,
      answersOf({
        q_id: text(person.nid),
        q_mobile: { t: 'phone', v: person.mobile },
        q_owner: owner('family'),
        q_owner_name: text('রহিম'),
      }),
    );
    expect(record.beneficiaryId).toBe(person.beneficiaryId);
    expect(await ownerOf(person.beneficiaryId)).toEqual({
      mobile: person.mobile,
      mobile_owner_code: 'family',
      mobile_owner_name: 'রহিম',
    });
    expect(await ownerChanges(person.beneficiaryId)).toEqual([
      {
        field: 'mobile_owner_code',
        old_value: 'neighbour',
        new_value: 'family',
        created_by: world.users.rpmDhaka,
      },
      {
        field: 'mobile_owner_name',
        old_value: 'করিম মিয়া',
        new_value: 'রহিম',
        created_by: world.users.rpmDhaka,
      },
    ]);
    // the office reads the changes in the profile's contact history
    const profile = await at(rpm, 'get', `/beneficiaries/${person.beneficiaryId}`);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(
      (profile.body.data.contactLog as { field: string }[]).map((c) => c.field).sort(),
    ).toEqual(['mobile_owner_code', 'mobile_owner_name']);
  });

  it('leaves the profile as it is for a volunteer, whose answers never rewrite a known person', async () => {
    const person = await known();
    await sent(
      await as(world.users.general),
      askingToo,
      answersOf({
        q_id: text(person.nid),
        q_mobile: { t: 'phone', v: person.mobile },
        q_owner: owner('own'),
      }),
    );
    expect(await ownerOf(person.beneficiaryId)).toEqual({
      mobile: person.mobile,
      mobile_owner_code: 'neighbour',
      mobile_owner_name: 'করিম মিয়া',
    });
    expect(await ownerChanges(person.beneficiaryId)).toEqual([]);
  });

  it('empties both when the number changes and nothing says whose the new one is, by an application and by the contact edit', async () => {
    const rpm = await as(world.users.rpmDhaka);
    // an application that gives another number and leaves the owner unanswered
    const first = await known();
    const newMobile = f.fakeMobile();
    await sent(
      rpm,
      askingToo,
      answersOf({ q_id: text(first.nid), q_mobile: { t: 'phone', v: newMobile } }),
    );
    expect(await ownerOf(first.beneficiaryId)).toEqual({
      mobile: newMobile,
      mobile_owner_code: null,
      mobile_owner_name: null,
    });
    expect((await ownerChanges(first.beneficiaryId)).map((c) => [c.field, c.new_value])).toEqual([
      ['mobile', newMobile],
      ['mobile_owner_code', null],
      ['mobile_owner_name', null],
    ]);
    // the same number again, with nothing said of its owner, changes nothing
    const second = await known();
    await sent(
      rpm,
      askingToo,
      answersOf({ q_id: text(second.nid), q_mobile: { t: 'phone', v: second.mobile } }),
    );
    expect(await ownerOf(second.beneficiaryId)).toMatchObject({
      mobile_owner_code: 'neighbour',
      mobile_owner_name: 'করিম মিয়া',
    });
    expect(await ownerChanges(second.beneficiaryId)).toEqual([]);
    // the contact edit of the profile: a new number starts without an owner, and the answer says so
    const read = await at(rpm, 'get', `/beneficiaries/${second.beneficiaryId}`);
    const edited = await at(rpm, 'patch', `/beneficiaries/${second.beneficiaryId}/contact`)
      .set('If-Match', read.headers.etag as string)
      .send({ mobile: f.fakeMobile() });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data).toMatchObject({ mobileOwnerCode: null, mobileOwnerName: null });
    expect(await ownerOf(second.beneficiaryId)).toMatchObject({
      mobile_owner_code: null,
      mobile_owner_name: null,
    });
    // an edit that leaves the number alone leaves its owner alone, and the request takes no owner
    const third = await known();
    const before = await at(rpm, 'get', `/beneficiaries/${third.beneficiaryId}`);
    const village = await at(rpm, 'patch', `/beneficiaries/${third.beneficiaryId}/contact`)
      .set('If-Match', before.headers.etag as string)
      .send({ village: 'নতুন গ্রাম' });
    expect(village.status, JSON.stringify(village.body)).toBe(200);
    expect(village.body.data).toMatchObject({
      mobileOwnerCode: 'neighbour',
      mobileOwnerName: 'করিম মিয়া',
    });
    const smuggled = await at(rpm, 'patch', `/beneficiaries/${third.beneficiaryId}/contact`)
      .set('If-Match', village.headers.etag as string)
      .send({ mobileOwnerCode: 'own' });
    expect(smuggled.status).toBe(422);
  });
});

describe('who is told whose number it is', () => {
  let person: { id: string; applicationId: string; mobile: string };
  let procurement: Session;
  /** A Procurement Team member the permission panel lets read the applications of `asking`. */
  let panelReader: { id: string; session: Session };
  const CONTACT_QUESTIONS = ['q:q_mobile', 'q:q_owner', 'q:q_owner_name'];
  beforeAll(async () => {
    const general = await as(world.users.general);
    const nid = f.fakeNid();
    const mobile = f.fakeMobile();
    const record = await sent(
      general,
      asking,
      answersOf({
        q_id: text(nid),
        q_mobile: { t: 'phone', v: mobile },
        q_owner: owner('neighbour'),
        q_owner_name: text('করিম মিয়া'),
      }),
    );
    person = { id: record.beneficiaryId, applicationId: record.id, mobile };
    // an official changes the owner, so the profile has contact changes of it on record
    await sent(
      await as(world.users.rpmDhaka),
      askingToo,
      answersOf({
        q_id: text(nid),
        q_mobile: { t: 'phone', v: mobile },
        q_owner: owner('family'),
        q_owner_name: text('রহিম'),
        q_village: text('বদলানো গ্রাম'),
      }),
    );
    // the Procurement Team reads the people of its house-construction projects, with the address
    // class and without the contact class
    const team = await account(h.db, { role: 'procurement_team' });
    const house = await f.project(h.db, { year: 2026 });
    await h.db.query(`UPDATE workflow_definitions SET key = 'construction' WHERE id = $1`, [
      house.workflow,
    ]);
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
       VALUES ($1, $2, $3, 'procurement_team', $3)`,
      [randomUUID(), house.id, team.id],
    );
    await f.application(
      h.db,
      { project: house, loc: world.dhaka },
      { beneficiary_id: person.id, status: 'approved' },
    );
    procurement = await login(h, team);
    // no role without the contact class reaches an application list by its defaults; the panel
    // can give one the list of a project, and the classes stay those of the role
    panelReader = await readerOf(asking.project);
  });

  /** A Procurement Team member with a panel grant of the project's application list. */
  async function readerOf(projectId: string) {
    const reader = await account(h.db, { role: 'procurement_team' });
    accounts.set(reader.id, reader);
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
       VALUES ($1, $2, 'application.view', 'grant', 'PROJECT', $3, 'Test override', $4)`,
      [randomUUID(), reader.id, projectId, world.users.head],
    );
    return { id: reader.id, session: await login(h, reader) };
  }

  /** The text of an export of the project's application list, once its job ran. */
  async function exported(s: Session, columns: string[]): Promise<string> {
    const made = await at(s, 'post', '/exports').send({
      kind: 'applications',
      format: 'csv',
      columns,
      filters: {},
      projectId: asking.project,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(202);
    await h.container.exportRunner.run(made.body.data.id as string, 0);
    const done = await at(s, 'get', `/exports/${made.body.data.id as string}`);
    expect(done.body.data.status).toBe('done');
    const file = await h.db.query<{ object_key: string }>(
      'SELECT object_key FROM files WHERE id = $1',
      [done.body.data.fileId],
    );
    const body = await h.container.storage.get('exports', file.rows[0]!.object_key);
    const chunks: Buffer[] = [];
    for await (const chunk of body as Readable) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }
  const offered = async (s: Session) => {
    const res = await at(
      s,
      'get',
      `/exports/columns?list=applications&projectId=${asking.project}`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.columns as { id: string; protected: boolean }[];
  };
  const ask = (s: Session, columns: string[]) =>
    at(s, 'post', '/exports').send({
      kind: 'applications',
      format: 'csv',
      columns,
      filters: {},
      projectId: asking.project,
    });

  it('tells an official who sees the mobile, with the changes of both in the contact history', async () => {
    const profile = await at(await as(world.users.rpmDhaka), 'get', `/beneficiaries/${person.id}`);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).toMatchObject({
      mobile: expect.stringMatching(/^01\d{9}$/),
      mobileOwnerCode: 'family',
      mobileOwnerName: 'রহিম',
    });
    expect(
      (profile.body.data.contactLog as { field: string }[]).map((c) => c.field).sort(),
    ).toEqual(['mobile_owner_code', 'mobile_owner_name', 'village']);
  });

  it('tells the Media Team and the Procurement Team neither, on the profile and in its history', async () => {
    const media = await at(await as(mediaUser), 'get', `/beneficiaries/${person.id}`);
    expect(media.status, JSON.stringify(media.body)).toBe(200);
    for (const key of ['mobile', 'mobileOwnerCode', 'mobileOwnerName', 'contactLog'])
      expect(media.body.data, key).not.toHaveProperty(key);
    expect(JSON.stringify(media.body)).not.toContain('রহিম');

    // the Procurement Team holds the address class and not the contact class: the contact
    // history, where the changes of the owner stand, is not answered to it
    const theirs = await at(procurement, 'get', `/beneficiaries/${person.id}`);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    expect(theirs.body.data).toHaveProperty('village', 'বদলানো গ্রাম');
    for (const key of ['mobile', 'mobileOwnerCode', 'mobileOwnerName', 'contactLog'])
      expect(theirs.body.data, key).not.toHaveProperty(key);
    expect(JSON.stringify(theirs.body)).not.toContain('রহিম');
    expect(JSON.stringify(theirs.body)).not.toContain('করিম মিয়া');
  });

  it('hides the two answers of the application with the mobile answer from a volunteer of the project who did not bring it', async () => {
    const paidAccount = await account(h.db, { kind: 'volunteer', role: 'volunteer_paid' });
    accounts.set(paidAccount.id, paidAccount);
    const paid = await f.volunteer(h.db, world.dhaka, paidAccount.id, { type: 'paid' });
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'work_progress', '{}', $5, 'accepted')`,
      [randomUUID(), asking.project, paid, world.dhaka.division, world.users.rpmDhaka],
    );
    const keys = (body: { data: { answers: { fieldKey: string }[] } }) =>
      body.data.answers.map((a) => a.fieldKey);
    const theirs = await at(
      await as(paidAccount.id),
      'get',
      `/applications/${person.applicationId}`,
    );
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    for (const key of ['q_mobile', 'q_owner', 'q_owner_name'])
      expect(keys(theirs.body), key).not.toContain(key);
    expect(JSON.stringify(theirs.body.data.answers)).not.toContain('করিম মিয়া');
    // the volunteer who brought it and the office read all three
    for (const reader of [world.users.general, world.users.rpmDhaka]) {
      const record = await at(await as(reader), 'get', `/applications/${person.applicationId}`);
      expect(keys(record.body)).toEqual(
        expect.arrayContaining(['q_mobile', 'q_owner', 'q_owner_name']),
      );
    }
  });

  it('offers the mobile question and the two owner questions in the export of the application list to an official who is shown the mobile, and writes their answers', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const columns = await offered(rpm);
    expect(columns.map((c) => c.id)).toEqual(expect.arrayContaining(CONTACT_QUESTIONS));
    const file = await exported(rpm, ['app_no', ...CONTACT_QUESTIONS]);
    expect(file).toContain(person.mobile);
    expect(file).toContain('প্রতিবেশীর');
    expect(file).toContain('করিম মিয়া');
    // contact data marks no export as sensitive, in an answer as in the list's mobile column: an
    // official without the identity and the forms export gets the three in a plain export
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, granted_by)
       VALUES ($1, $2, $3, 'project_executive', $4, $5)`,
      [
        randomUUID(),
        asking.project,
        world.users.executive,
        world.dhaka.division,
        world.users.rpmDhaka,
      ],
    );
    const executive = await as(world.users.executive);
    const theirs = await offered(executive);
    for (const id of CONTACT_QUESTIONS)
      expect(
        theirs.find((c) => c.id === id),
        id,
      ).toMatchObject({ protected: false });
    const plain = await ask(executive, ['app_no', ...CONTACT_QUESTIONS]);
    expect(plain.status, JSON.stringify(plain.body)).toBe(202);
    expect(plain.body.data.sensitive).toBe(false);
  });

  it('neither offers the three questions nor writes them for a requester who is not shown the mobile, and refuses them by key as withheld', async () => {
    const { session, id } = panelReader;
    // the list opens for them
    const listed = await at(session, 'get', `/projects/${asking.project}/applications?limit=100`);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect((listed.body.data as { id: string }[]).map((r) => r.id)).toContain(person.applicationId);
    const columns = (await offered(session)).map((c) => c.id);
    for (const column of CONTACT_QUESTIONS) expect(columns, column).not.toContain(column);
    // the identity number is withheld from them as before, and an ordinary question is offered
    expect(columns).not.toContain('q:q_id');
    expect(columns).toEqual(expect.arrayContaining(['app_no', 'q:q_name']));

    for (const column of CONTACT_QUESTIONS) {
      const asked = await ask(session, ['app_no', column]);
      expect(asked.status, column).toBe(403);
      expect(asked.body.error.code).toBe('permission.denied');
    }
    // a key no form of the project has is unknown, not withheld
    expect((await ask(session, ['app_no', 'q:q_nope'])).status).toBe(422);
    const jobs = await h.db.query('SELECT 1 FROM export_jobs WHERE requested_by = $1', [id]);
    expect(jobs.rowCount).toBe(0);

    const file = await exported(session, ['app_no', 'q:q_name']);
    expect(file).not.toContain(person.mobile);
    expect(file).not.toContain('করিম মিয়া');
    expect(file).not.toContain('প্রতিবেশীর');

    // the answers themselves, read for the columns an official was given: none leaves on a row
    // that does not carry the contact class
    const all = await h.container.exportQuestions.catalogue(
      asking.project,
      new Set(['beneficiary.contact', 'beneficiary.nid', 'application.official_section']),
    );
    const frozen = await h.container.exportRows.freeze(
      await principalOf(h.db, id),
      { kind: 'applications', filters: {}, projectId: asking.project },
      'bn',
    );
    expect(frozen.classes).not.toContain('beneficiary.contact');
    const page = await h.container.exportRows.batch(frozen, null, 100);
    const row = page.rows.find((r) => r.id === person.applicationId)!;
    expect(row.classes).not.toContain('beneficiary.contact');
    const values = await h.container.exportQuestions.values([row.id], all, 'bn', (_id, cls) =>
      row.classes.includes(cls),
    );
    for (const column of [...CONTACT_QUESTIONS, 'q:q_id'])
      expect(values.get(row.id)?.cells, column).not.toHaveProperty(column);
    expect(values.get(row.id)?.cells).toHaveProperty('q:q_name');
  });

  it('prints the three answers on the PDF of an application only for a requester who is shown the mobile', async () => {
    const records = h.container.exportRecords;
    const keysOf = async (userId: string) => {
      const record = await records.snapshot(
        await principalOf(h.db, userId),
        'application',
        person.applicationId,
        'bn',
      );
      const view = record.view as {
        answers: { fieldKey: string }[];
        form: { sections: { fields: { fieldKey: string }[] }[] };
      };
      return {
        answers: view.answers.map((a) => a.fieldKey),
        questions: view.form.sections.flatMap((s) => s.fields.map((field) => field.fieldKey)),
        classes: record.classes,
        text: JSON.stringify(record.view),
      };
    };
    const office = await keysOf(world.users.rpmDhaka);
    expect(office.answers).toEqual(expect.arrayContaining(['q_mobile', 'q_owner', 'q_owner_name']));
    expect(office.text).toContain('করিম মিয়া');
    // the contact class stands for no export permission, so it marks no PDF sensitive
    expect(office.classes).not.toContain('beneficiary.contact');
    const theirs = await keysOf(panelReader.id);
    for (const key of ['q_mobile', 'q_owner', 'q_owner_name', 'q_id']) {
      expect(theirs.answers, key).not.toContain(key);
      expect(theirs.questions, key).not.toContain(key);
    }
    expect(theirs.questions).toContain('q_name');
    expect(theirs.text).not.toContain(person.mobile);
    expect(theirs.text).not.toContain('করিম মিয়া');
  });

  it('hides the three answers on the record from a reader of the list who is not shown the mobile, and shows them to the office', async () => {
    const theirs = await at(panelReader.session, 'get', `/applications/${person.applicationId}`);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    const keys = (theirs.body.data.answers as { fieldKey: string }[]).map((a) => a.fieldKey);
    for (const key of ['q_mobile', 'q_owner', 'q_owner_name', 'q_id'])
      expect(keys, key).not.toContain(key);
    expect(keys).toContain('q_name');
    expect(JSON.stringify(theirs.body.data.answers)).not.toContain(person.mobile);
    const office = await at(
      await as(world.users.rpmDhaka),
      'get',
      `/applications/${person.applicationId}`,
    );
    expect((office.body.data.answers as { fieldKey: string }[]).map((a) => a.fieldKey)).toEqual(
      expect.arrayContaining(['q_mobile', 'q_owner', 'q_owner_name']),
    );
  });

  it('carries the two in the export of the beneficiary list only where it carries the mobile', async () => {
    const rows = h.container.exportRows;
    const { name } = (
      await h.db.query<{ name: string }>('SELECT name FROM beneficiaries WHERE id = $1', [
        person.id,
      ])
    ).rows[0]!;
    const cellsFor = async (userId: string) => {
      const frozen = await rows.freeze(
        await principalOf(h.db, userId),
        { kind: 'beneficiaries', filters: { q: name } },
        'bn',
      );
      const page = await rows.batch(frozen, null, 10);
      return page.rows.find((r) => r.id === person.id)?.cells;
    };
    const office = await cellsFor(world.users.rpmDhaka);
    expect(office).toMatchObject({
      mobile: expect.stringMatching(/^01\d{9}$/),
      mobile_owner: { code: 'family', source: 'reference.mobile_owner' },
      mobile_owner_name: 'রহিম',
    });
    const media = await cellsFor(mediaUser);
    expect(media).toBeDefined();
    expect(media).toHaveProperty('name', name);
    for (const column of ['mobile', 'mobile_owner', 'mobile_owner_name'])
      expect(media, column).not.toHaveProperty(column);
  });
});
