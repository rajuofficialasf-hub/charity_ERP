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
import { question } from './support/forms.js';

// The family members on a beneficiary's profile: the rows of the family group a submitted
// application carries replace the person's active members, the earlier ones kept as inactive; the
// list of the latest submitted application stands, so a list that arrives late never replaces a
// newer one; an application without the group changes nothing; each member gets its name key and
// each replacement is audited by its counts. The profile shows the active members to the office,
// never to the Media or the Procurement Team, and a volunteer reads no other volunteer's person.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

interface Target {
  project: string;
  versionId: string;
}
/** Projects whose form asks the household's members, and one whose form does not. */
const asking: Target[] = [];
let plain: Target;
let generalVolunteer: string;
let daeeVolunteer: string;

/** The family group of the form: the members' rows, each filling a column of a member. */
const FAMILY_QUESTIONS = [
  question('q_members', 'repeat_group', {
    standardColumn: 'beneficiary_family_members',
    settings: { repeat: { earner: false } },
  }),
  question('q_member_name', 'short_text', {
    standardColumn: 'name',
    settings: { repeat: { group: 'q_members' } },
  }),
  question('q_member_relationship', 'single_select', {
    standardColumn: 'relationship_code',
    settings: { repeat: { group: 'q_members' } },
  }),
  question('q_member_age', 'number', {
    standardColumn: 'age_years',
    settings: { repeat: { group: 'q_members' } },
  }),
  question('q_member_income', 'money', {
    standardColumn: 'monthly_income',
    settings: { repeat: { group: 'q_members' } },
  }),
];

interface Member {
  name: string;
  relationship?: string;
  age?: number;
  income?: string;
}
type Answer = { fieldKey: string; value: unknown; repeatIndex?: number };

/** The rows of the family group, one answer per column a member has. */
const memberAnswers = (members: readonly Member[]): Answer[] =>
  members.flatMap((m, repeatIndex) => [
    { fieldKey: 'q_member_name', repeatIndex, value: { t: 'short_text', v: m.name } },
    ...(m.relationship
      ? [
          {
            fieldKey: 'q_member_relationship',
            repeatIndex,
            value: { t: 'single_select', v: m.relationship },
          },
        ]
      : []),
    ...(m.age !== undefined
      ? [{ fieldKey: 'q_member_age', repeatIndex, value: { t: 'number', v: m.age } }]
      : []),
    ...(m.income
      ? [{ fieldKey: 'q_member_income', repeatIndex, value: { t: 'money', v: m.income } }]
      : []),
  ]);

/** A person the tests apply for: their identity answers, the same in every project. */
interface Person {
  nid: string;
  mobile: string;
  father: string;
}
const newPerson = (): Person => ({
  nid: f.fakeNid(),
  mobile: f.fakeMobile(),
  father: `নমুনা পিতা ${randomUUID().slice(0, 8)}`,
});
const identityOf = (person: Person) =>
  Object.entries({
    ...IDENTITY_ANSWERS(person.nid, person.mobile, world.dhaka),
    q_father: { t: 'short_text', v: person.father },
  }).map(([fieldKey, value]) => ({ fieldKey, value }));

const create = (s: Session, target: Target, answers: unknown[]) =>
  at(s, 'post', `/projects/${target.project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: target.project,
    formVersionId: target.versionId,
    answers,
  });
const act = async (s: Session, id: string, action: string, body: object = {}) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', (read.headers.etag as string | undefined) ?? '"none"')
    .send(body);
};
/** A new application of the person, with these members, sent; answers the record. */
async function sent(
  s: Session,
  target: Target,
  person: Person,
  members: readonly Member[] | null,
): Promise<{ id: string; beneficiaryId: string }> {
  const made = await create(s, target, [
    ...identityOf(person),
    ...(members ? memberAnswers(members) : []),
  ]);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const res = await act(s, made.body.data.id as string, 'submit');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as { id: string; beneficiaryId: string };
}

interface StoredMember {
  name: string;
  relationship_code: string | null;
  age_years: number | null;
  monthly_income: string | null;
  is_earner: boolean;
  active: boolean;
  name_key: string | null;
  match_keys_version: number | null;
  source_application_id: string | null;
}
const membersOf = async (beneficiaryId: string) =>
  (
    await h.db.query<StoredMember>(
      `SELECT name, relationship_code, age_years, monthly_income::text AS monthly_income,
              is_earner, active, name_key, match_keys_version, source_application_id
         FROM beneficiary_family_members WHERE beneficiary_id = $1 ORDER BY created_at, id`,
      [beneficiaryId],
    )
  ).rows;
const activeNames = async (beneficiaryId: string) =>
  (await membersOf(beneficiaryId)).filter((m) => m.active).map((m) => m.name);
const replacements = async (beneficiaryId: string) =>
  (
    await h.db.query<{ old: unknown; new: unknown }>(
      `SELECT old, new FROM audit_log
        WHERE action = 'beneficiary.family_replaced' AND entity_id = $1 ORDER BY created_at, id`,
      [beneficiaryId],
    )
  ).rows;
const profileOf = (s: Session, beneficiaryId: string) =>
  at(s, 'get', `/beneficiaries/${beneficiaryId}`);

const THREE: Member[] = [
  { name: 'মোছাঃ রহিমা খাতুন', relationship: 'spouse', age: 34, income: '3000.00' },
  { name: 'করিম', relationship: 'son', age: 12 },
  { name: 'সালমা', relationship: 'daughter', age: 9 },
];
const TWO: Member[] = [
  { name: 'রহিমা খাতুন', relationship: 'spouse', age: 35, income: '3500.50' },
  { name: 'করিম', relationship: 'son', age: 13 },
];

async function projectOf(code: string, fields?: unknown[]): Promise<Target> {
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code,
    year: 2026,
    name: { bn: 'পরিবারের সদস্য', en: 'Family members' },
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
  for (const volunteerId of [generalVolunteer, daeeVolunteer])
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [randomUUID(), project, volunteerId, world.dhaka.division, world.users.rpmDhaka],
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
  const volunteerOf = async (userId: string) =>
    (await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [userId]))
      .rows[0]!.id;
  generalVolunteer = await volunteerOf(world.users.general);
  daeeVolunteer = await volunteerOf(world.users.daee);
  for (const code of ['FMA', 'FMB', 'FMC', 'FMD'])
    asking.push(await projectOf(code, FAMILY_QUESTIONS));
  plain = await projectOf('FMP');
});
afterAll(async () => h.close());

describe('the family section of the profile', () => {
  it('reads the active members of the table, and leaves out a member who left the household', async () => {
    const person = await f.beneficiary(h.db, world.dhaka);
    await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: person });
    const member = await f.insert(h.db, 'beneficiary_family_members', {
      id: randomUUID(),
      beneficiary_id: person,
      name: 'রহিমা',
      age_years: 34,
    });
    await f.insert(h.db, 'beneficiary_family_members', {
      id: randomUUID(),
      beneficiary_id: person,
      name: 'পুরনো সদস্য',
      active: false,
    });
    const res = await at(await as(world.users.rpmDhaka), 'get', `/beneficiaries/${person}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.familyMembers).toEqual([
      expect.objectContaining({ id: member, name: 'রহিমা', relationshipCode: null, ageYears: 34 }),
    ]);
  });
});

describe('a submitted application that lists the household', () => {
  it('writes each member as an active row of the person, with its name key, audited by its count', async () => {
    const person = newPerson();
    const record = await sent(await as(world.users.general), asking[0]!, person, THREE);
    const stored = await membersOf(record.beneficiaryId);
    expect(stored).toHaveLength(3);
    expect(stored[0]).toMatchObject({
      name: 'মোছাঃ রহিমা খাতুন',
      relationship_code: 'spouse',
      age_years: 34,
      monthly_income: '3000.00',
      // the group's own setting: these rows are household members, not earners
      is_earner: false,
      active: true,
      // the title and the ending title dropped, as for a person's name
      name_key: 'রহিমা',
      match_keys_version: expect.any(Number),
      source_application_id: record.id,
    });
    expect(stored.every((m) => m.active && m.source_application_id === record.id)).toBe(true);
    expect(await replacements(record.beneficiaryId)).toEqual([
      { old: { activeMembers: 0 }, new: { activeMembers: 3, applicationId: record.id } },
    ]);
    // the office reads them on the profile, in the order the form gave them
    const profile = await profileOf(await as(world.users.rpmDhaka), record.beneficiaryId);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data.familyMembers).toEqual([
      {
        id: expect.any(String),
        name: 'মোছাঃ রহিমা খাতুন',
        relationshipCode: 'spouse',
        relationship: { bn: 'স্বামী/স্ত্রী', en: 'Spouse' },
        ageYears: 34,
        occupationCode: null,
        monthlyIncome: 3000,
      },
      expect.objectContaining({ name: 'করিম', relationshipCode: 'son', monthlyIncome: null }),
      expect.objectContaining({ name: 'সালমা', relationshipCode: 'daughter', ageYears: 9 }),
    ]);
  });

  it('replaces them with the list of a later application, and keeps the earlier members as inactive', async () => {
    const person = newPerson();
    const s = await as(world.users.general);
    const first = await sent(s, asking[0]!, person, THREE);
    const later = await sent(s, asking[1]!, person, TWO);
    expect(later.beneficiaryId).toBe(first.beneficiaryId);
    const stored = await membersOf(first.beneficiaryId);
    expect(stored).toHaveLength(5);
    expect(stored.filter((m) => !m.active).map((m) => m.name)).toEqual(THREE.map((m) => m.name));
    expect(stored.filter((m) => m.active)).toEqual([
      expect.objectContaining({
        name: 'রহিমা খাতুন',
        monthly_income: '3500.50',
        source_application_id: later.id,
      }),
      expect.objectContaining({ name: 'করিম', age_years: 13, source_application_id: later.id }),
    ]);
    // the two lists are the same woman: her name keys agree
    expect(new Set(stored.filter((m) => m.name.includes('রহিমা')).map((m) => m.name_key))).toEqual(
      new Set(['রহিমা']),
    );
    expect((await replacements(first.beneficiaryId)).at(-1)).toEqual({
      old: { activeMembers: 3 },
      new: { activeMembers: 2, applicationId: later.id },
    });
    const profile = await profileOf(await as(world.users.rpmDhaka), first.beneficiaryId);
    expect(profile.body.data.familyMembers.map((m: { name: string }) => m.name)).toEqual([
      'রহিমা খাতুন',
      'করিম',
    ]);
  });

  it('changes nothing for an application without the group, or with the group left empty', async () => {
    const person = newPerson();
    const s = await as(world.users.general);
    const first = await sent(s, asking[0]!, person, THREE);
    await sent(s, plain, person, null);
    await sent(s, asking[1]!, person, []);
    expect(await activeNames(first.beneficiaryId)).toEqual(THREE.map((m) => m.name));
    expect(await membersOf(first.beneficiaryId)).toHaveLength(3);
    expect(await replacements(first.beneficiaryId)).toHaveLength(1);
  });

  it('leaves a newer list where an entry received earlier is verified after it', async () => {
    const person = newPerson();
    const s = await as(world.users.general);
    const first = await sent(s, asking[0]!, person, THREE);
    // a public entry for the same person, received before the next application is sent
    const received = new Date(Date.now() - 60_000);
    const entry = await applicationRow(h.db, {
      projectId: asking[2]!.project,
      versionId: asking[2]!.versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: Object.fromEntries(identityOf(person).map((a) => [a.fieldKey, a.value])),
      over: { flags: ['public_entry', 'existing_identity'], submitted_at: received },
    });
    await answersOfEntry(entry, asking[2]!.versionId, [{ name: 'পুরনো তালিকার সদস্য' }]);
    const newer = await sent(s, asking[1]!, person, TWO);
    const rpm = await as(world.users.rpmDhaka);
    const verified = await act(rpm, entry, 'verify_link', {
      linkBeneficiaryId: first.beneficiaryId,
    });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body.data.beneficiaryId).toBe(first.beneficiaryId);
    // the entry's older list is not taken; the newer application's list stands
    expect(await activeNames(first.beneficiaryId)).toEqual(TWO.map((m) => m.name));
    const stored = await membersOf(first.beneficiaryId);
    expect(stored.some((m) => m.source_application_id === entry)).toBe(false);
    expect(stored.filter((m) => m.active).every((m) => m.source_application_id === newer.id)).toBe(
      true,
    );
  });

  it('takes the list of an entry verified later when it was received after the standing list', async () => {
    const person = newPerson();
    const s = await as(world.users.general);
    const first = await sent(s, asking[0]!, person, THREE);
    const entry = await applicationRow(h.db, {
      projectId: asking[2]!.project,
      versionId: asking[2]!.versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: Object.fromEntries(identityOf(person).map((a) => [a.fieldKey, a.value])),
      over: { flags: ['public_entry', 'existing_identity'], submitted_at: new Date() },
    });
    await answersOfEntry(entry, asking[2]!.versionId, [{ name: 'নতুন সদস্য', age: 2 }]);
    const verified = await act(await as(world.users.rpmDhaka), entry, 'verify_link', {
      linkBeneficiaryId: first.beneficiaryId,
    });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(await activeNames(first.beneficiaryId)).toEqual(['নতুন সদস্য']);
  });

  it('refuses a relationship its list does not hold with the option error, and writes nothing', async () => {
    // the list holds the code while the form is published, so the form offers it, and loses it
    // before the send
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en) VALUES ($1, 'relationship', 'cousin', 'চাচাতো ভাই', 'Cousin')`,
      [randomUUID()],
    );
    const withCousin = await projectOf('FMT', FAMILY_QUESTIONS);
    const s = await as(world.users.general);
    const person = newPerson();
    const made = await create(s, withCousin, [
      ...identityOf(person),
      ...memberAnswers([{ name: 'রাশেদ', relationship: 'cousin' }]),
    ]);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await h.db.query(
      `DELETE FROM reference_lists WHERE list_key = 'relationship' AND code = 'cousin'`,
    );
    const refused = await act(s, made.body.data.id as string, 'submit');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error).toMatchObject({
      code: 'validation.failed',
      details: [{ path: 'answers', code: 'validation.option_unknown' }],
    });
    expect(
      (await h.db.query('SELECT 1 FROM beneficiaries WHERE nid = $1', [person.nid])).rowCount,
    ).toBe(0);
  });
});

describe('a merge', () => {
  it('moves the members of the retired profile to the kept one, which shows them', async () => {
    const s = await as(world.users.general);
    const kept = await sent(s, asking[0]!, newPerson(), TWO);
    const retired = await sent(s, asking[1]!, newPerson(), THREE);
    const head = await as(world.users.head);
    const merged = await api().post('/api/v1/beneficiary-merges/direct').set(bearer(head)).send({
      keptId: kept.beneficiaryId,
      mergedId: retired.beneficiaryId,
      reason: 'একই মানুষ, দুইবার নিবন্ধন হয়েছিল',
    });
    expect(merged.status, JSON.stringify(merged.body)).toBe(201);
    expect(await membersOf(retired.beneficiaryId)).toEqual([]);
    expect(await activeNames(kept.beneficiaryId)).toEqual([
      ...TWO.map((m) => m.name),
      ...THREE.map((m) => m.name),
    ]);
    const profile = await profileOf(await as(world.users.rpmDhaka), kept.beneficiaryId);
    expect(profile.body.data.familyMembers).toHaveLength(5);
  });
});

describe('who reads the family', () => {
  let person: { id: string; applicationId: string };
  beforeAll(async () => {
    const record = await sent(await as(world.users.general), asking[3]!, newPerson(), THREE);
    person = { id: record.beneficiaryId, applicationId: record.id };
  });

  it('gives a volunteer no other volunteer’s person, neither the profile nor the application', async () => {
    const other = await as(world.users.daee);
    const profile = await profileOf(other, person.id);
    expect([403, 404]).toContain(profile.status);
    expect(JSON.stringify(profile.body)).not.toContain('করিম');
    const record = await at(other, 'get', `/applications/${person.applicationId}`);
    expect([403, 404]).toContain(record.status);
    expect(JSON.stringify(record.body)).not.toContain('করিম');
  });

  it('gives the Media Team no member, so no member’s income', async () => {
    const media = await login(h, await account(h.db, { role: 'media_team' }));
    const profile = await profileOf(media, person.id);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).toHaveProperty('name');
    expect(profile.body.data).not.toHaveProperty('familyMembers');
    expect(JSON.stringify(profile.body)).not.toContain('3000');
  });

  it('gives the Procurement Team on a house-construction project no member, so no member’s income', async () => {
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
    await f.application(h.db, { project: house, loc: world.dhaka }, { beneficiary_id: person.id });
    const profile = await profileOf(await login(h, team), person.id);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).not.toHaveProperty('familyMembers');
    expect(JSON.stringify(profile.body)).not.toContain('3000');
  });
});

/** The family rows of an entry written straight into its answers, as a public entry stores them. */
async function answersOfEntry(
  applicationId: string,
  versionId: string,
  members: readonly Member[],
): Promise<void> {
  const fields = await h.db.query<{ id: string; field_key: string }>(
    'SELECT id, field_key FROM form_fields WHERE form_version_id = $1',
    [versionId],
  );
  const byKey = new Map(fields.rows.map((r) => [r.field_key, r.id]));
  for (const a of memberAnswers(members))
    await f.insert(h.db, 'application_answers', {
      id: randomUUID(),
      application_id: applicationId,
      field_id: byKey.get(a.fieldKey),
      repeat_index: a.repeatIndex ?? 0,
      value: JSON.stringify(a.value),
    });
}
