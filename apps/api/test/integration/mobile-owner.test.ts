import { randomUUID } from 'node:crypto';
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
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
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
  let person: { id: string; applicationId: string };
  let procurement: Session;
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
    person = { id: record.beneficiaryId, applicationId: record.id };
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
