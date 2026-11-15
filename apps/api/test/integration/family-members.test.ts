import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { BeneficiaryFamilyMembersService } from '../../src/services/beneficiary-family-members.js';
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
// newer one (a deleted application no longer places its list); an application without the group
// changes nothing, a wholly blank row is no member and a row without a name is refused; each member
// gets its name key and each replacement is audited by its counts and the ids it set inactive. A
// merge keeps one list active and its revert restores it. The profile shows every active member to
// the office, never to the Media or the Procurement Team, and a volunteer reads no other
// volunteer's person.
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
/** A project whose form asks the members' income as typed text. */
let textIncome: Target;
let generalVolunteer: string;
let daeeVolunteer: string;

/** The family group of the form: the members' rows, each filling a column of a member. */
const familyQuestions = (incomeType: 'money' | 'short_text') => [
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
  question('q_member_income', incomeType, {
    standardColumn: 'monthly_income',
    settings: { repeat: { group: 'q_members' } },
  }),
];
const FAMILY_QUESTIONS = familyQuestions('money');

interface Member {
  name: string;
  relationship?: string;
  age?: number;
  income?: string;
}
type Answer = { fieldKey: string; value: unknown; repeatIndex?: number };

/** The rows of the family group, one answer per column a member has (no answer for no name). */
const memberAnswers = (
  members: readonly Member[],
  incomeType: 'money' | 'short_text' = 'money',
): Answer[] =>
  members.flatMap((m, repeatIndex) => [
    ...(m.name
      ? [{ fieldKey: 'q_member_name', repeatIndex, value: { t: 'short_text', v: m.name } }]
      : []),
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
      ? [{ fieldKey: 'q_member_income', repeatIndex, value: { t: incomeType, v: m.income } }]
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
  id: string;
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
      `SELECT id, name, relationship_code, age_years, monthly_income::text AS monthly_income,
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
  textIncome = await projectOf('FMI', familyQuestions('short_text'));
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
      {
        old: { activeMembers: 0 },
        new: { activeMembers: 3, applicationId: record.id, deactivatedIds: [] },
      },
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
        // no profile of hers is known, so the member links to none
        profile: null,
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
    // the rows it set inactive are named by id, so the earlier list can be put back by hand
    expect((await replacements(first.beneficiaryId)).at(-1)).toEqual({
      old: { activeMembers: 3 },
      new: {
        activeMembers: 2,
        applicationId: later.id,
        deactivatedIds: stored
          .filter((m) => !m.active)
          .map((m) => m.id)
          .sort(),
      },
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
    const received = new Date(h.clock.now().getTime() - 60_000);
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
      over: {
        flags: ['public_entry', 'existing_identity'],
        submitted_at: new Date(h.clock.now().getTime() + 60_000),
      },
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
  const merge = async (keptId: string, mergedId: string) => {
    const res = await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(await as(world.users.head)))
      .send({ keptId, mergedId, reason: 'একই মানুষ, দুইবার নিবন্ধন হয়েছিল' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  };
  const revert = async (mergeId: string) => {
    const res = await api()
      .post(`/api/v1/beneficiary-merges/${mergeId}/revert`)
      .set(bearer(await as(world.users.head)))
      .send({ reason: 'দুজন আলাদা মানুষ' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  };
  const snapshotOf = async (mergeId: string) =>
    (
      await h.db.query<{ snapshot: { familyDeactivated?: string[] } }>(
        'SELECT snapshot FROM profile_merges WHERE id = $1',
        [mergeId],
      )
    ).rows[0]!.snapshot;

  it('keeps active only the list submitted later, the retired profile’s here, and moves every row', async () => {
    const s = await as(world.users.general);
    const kept = await sent(s, asking[0]!, newPerson(), TWO);
    h.clock.advance(1_000);
    const retired = await sent(s, asking[1]!, newPerson(), THREE);
    const keptRows = (await membersOf(kept.beneficiaryId)).map((m) => m.id).sort();
    const mergeId = await merge(kept.beneficiaryId, retired.beneficiaryId);
    expect(await membersOf(retired.beneficiaryId)).toEqual([]);
    expect(await membersOf(kept.beneficiaryId)).toHaveLength(5);
    expect(await activeNames(kept.beneficiaryId)).toEqual(THREE.map((m) => m.name));
    expect((await snapshotOf(mergeId)).familyDeactivated).toEqual(keptRows);
    const profile = await profileOf(await as(world.users.rpmDhaka), kept.beneficiaryId);
    expect(profile.body.data.familyMembers.map((m: { name: string }) => m.name)).toEqual(
      THREE.map((m) => m.name),
    );
  });

  it('keeps the kept profile’s list where the retired one is older', async () => {
    const s = await as(world.users.general);
    const retired = await sent(s, asking[0]!, newPerson(), THREE);
    h.clock.advance(1_000);
    const kept = await sent(s, asking[1]!, newPerson(), TWO);
    await merge(kept.beneficiaryId, retired.beneficiaryId);
    expect(await activeNames(kept.beneficiaryId)).toEqual(TWO.map((m) => m.name));
  });

  it('keeps the kept profile’s list on a tie, and the other where the kept one has no application', async () => {
    const s = await as(world.users.general);
    const kept = await sent(s, asking[0]!, newPerson(), TWO);
    const retired = await sent(s, asking[1]!, newPerson(), THREE);
    await h.db.query('UPDATE applications SET submitted_at = $1 WHERE id = ANY($2::uuid[])', [
      h.clock.now(),
      [kept.id, retired.id],
    ]);
    await merge(kept.beneficiaryId, retired.beneficiaryId);
    expect(await activeNames(kept.beneficiaryId)).toEqual(TWO.map((m) => m.name));

    // a list written by no application is older than any list of one
    const bare = await f.beneficiary(h.db, world.dhaka);
    await f.insert(h.db, 'beneficiary_family_members', {
      id: randomUUID(),
      beneficiary_id: bare,
      name: 'আগের সদস্য',
    });
    const other = await sent(s, asking[2]!, newPerson(), THREE);
    await merge(bare, other.beneficiaryId);
    expect(await activeNames(bare)).toEqual(THREE.map((m) => m.name));
  });

  it('sets the list it put aside active again on a revert, each row back on its own profile', async () => {
    const s = await as(world.users.general);
    const kept = await sent(s, asking[0]!, newPerson(), TWO);
    h.clock.advance(1_000);
    const retired = await sent(s, asking[1]!, newPerson(), THREE);
    const before = {
      kept: await membersOf(kept.beneficiaryId),
      retired: await membersOf(retired.beneficiaryId),
    };
    const mergeId = await merge(kept.beneficiaryId, retired.beneficiaryId);
    expect(await activeNames(kept.beneficiaryId)).toEqual(THREE.map((m) => m.name));
    await revert(mergeId);
    expect(await membersOf(kept.beneficiaryId)).toEqual(before.kept);
    expect(await membersOf(retired.beneficiaryId)).toEqual(before.retired);
  });
});

describe('the rows of the group', () => {
  it('reads back every member of a large household, in the order the form gave them', async () => {
    const thirty: Member[] = Array.from({ length: 30 }, (_, i) => ({
      name: `সদস্য ${String(i + 1).padStart(2, '0')}`,
      age: i,
    }));
    const record = await sent(await as(world.users.general), asking[0]!, newPerson(), thirty);
    const profile = await profileOf(await as(world.users.rpmDhaka), record.beneficiaryId);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data.familyMembers.map((m: { name: string }) => m.name)).toEqual(
      thirty.map((m) => m.name),
    );
  });

  it('skips a row that answers nothing, and refuses one that tells of a member without a name', async () => {
    const s = await as(world.users.general);
    // a blank row stored with an entry is no member: the others are written
    const person = newPerson();
    const first = await sent(s, asking[0]!, person, THREE);
    const entry = await applicationRow(h.db, {
      projectId: asking[2]!.project,
      versionId: asking[2]!.versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: Object.fromEntries(identityOf(person).map((a) => [a.fieldKey, a.value])),
      over: {
        flags: ['public_entry', 'existing_identity'],
        submitted_at: new Date(h.clock.now().getTime() + 60_000),
      },
    });
    await answersOfEntry(entry, asking[2]!.versionId, [{ name: 'আমিনা' }]);
    await rawAnswer(entry, asking[2]!.versionId, 'q_member_name', 1, { t: 'short_text', v: '' });
    const verified = await act(await as(world.users.rpmDhaka), entry, 'verify_link', {
      linkBeneficiaryId: first.beneficiaryId,
    });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(await activeNames(first.beneficiaryId)).toEqual(['আমিনা']);

    // a row with an age and a relationship but no name is the form's mistake, at the name
    const other = newPerson();
    const made = await create(s, asking[1]!, [
      ...identityOf(other),
      ...memberAnswers([
        { name: 'করিম', age: 12 },
        { name: '', relationship: 'son', age: 7 },
      ]),
    ]);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const refused = await act(s, made.body.data.id as string, 'submit');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error).toMatchObject({
      code: 'validation.failed',
      details: [{ path: 'q_member_name[1]', code: 'validation.required' }],
    });
    await expectNothingWritten(other);
  });

  it.each([
    ['an age beyond 150', { name: 'করিম', age: 151 }, 'validation.out_of_range'],
    [
      'an income beyond the column',
      { name: 'করিম', income: '1000000000000' },
      'validation.out_of_range',
    ],
    ['an income in hexadecimal', { name: 'করিম', income: '0x10' }, 'validation.amount_format'],
    ['an income with an exponent', { name: 'করিম', income: '1e3' }, 'validation.amount_format'],
  ])('refuses %s with 422, and writes nothing', async (_case, member, code) => {
    const s = await as(world.users.general);
    const person = newPerson();
    const made = await create(s, textIncome, [
      ...identityOf(person),
      ...memberAnswers([member], 'short_text'),
    ]);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const refused = await act(s, made.body.data.id as string, 'submit');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error).toMatchObject({
      code: 'validation.failed',
      details: [{ path: 'answers', code }],
    });
    await expectNothingWritten(person);
  });

  it('writes an income typed as text as the amount it was checked as, with two decimals', async () => {
    const s = await as(world.users.general);
    const made = await create(s, textIncome, [
      ...identityOf(newPerson()),
      ...memberAnswers([{ name: 'করিম', income: '2500.5' }], 'short_text'),
    ]);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const res = await act(s, made.body.data.id as string, 'submit');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await membersOf(res.body.data.beneficiaryId as string))[0]).toMatchObject({
      monthly_income: '2500.50',
    });
  });
});

describe('the order of the lists', () => {
  it('no longer counts a deleted application: an older list then replaces its rows', async () => {
    const s = await as(world.users.general);
    const person = newPerson();
    // an entry received first, verified after a newer application that is then deleted
    const entry = await applicationRow(h.db, {
      projectId: asking[2]!.project,
      versionId: asking[2]!.versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: Object.fromEntries(identityOf(person).map((a) => [a.fieldKey, a.value])),
      over: {
        flags: ['public_entry', 'existing_identity'],
        submitted_at: new Date(h.clock.now().getTime() - 60_000),
      },
    });
    await answersOfEntry(entry, asking[2]!.versionId, [{ name: 'আগের তালিকার সদস্য' }]);
    const newer = await sent(s, asking[1]!, person, TWO);
    const deleted = await act(s, newer.id, 'delete');
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    const verified = await act(await as(world.users.rpmDhaka), entry, 'verify_link', {
      linkBeneficiaryId: newer.beneficiaryId,
    });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(await activeNames(newer.beneficiaryId)).toEqual(['আগের তালিকার সদস্য']);
  });

  it('orders a list by the very time the move stamps as its submission', async () => {
    const seen: Date[] = [];
    const replace = BeneficiaryFamilyMembersService.prototype.replaceFrom;
    const spy = vi
      .spyOn(BeneficiaryFamilyMembersService.prototype, 'replaceFrom')
      .mockImplementation(function (this: BeneficiaryFamilyMembersService, tx, actor, input) {
        seen.push(input.submittedAt);
        return replace.call(this, tx, actor, input);
      });
    // every reading of the clock a millisecond later, so a second reading would differ
    const frozen = h.clock.now;
    let t = frozen().getTime();
    h.clock.now = () => new Date((t += 1));
    let record: { id: string };
    try {
      record = await sent(await as(world.users.general), asking[3]!, newPerson(), TWO);
    } finally {
      h.clock.now = frozen;
      spy.mockRestore();
    }
    const stored = await h.db.query<{ submitted_at: Date }>(
      'SELECT submitted_at FROM applications WHERE id = $1',
      [record.id],
    );
    expect(seen.map((d) => d.getTime())).toEqual([stored.rows[0]!.submitted_at.getTime()]);
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

/** No profile for the person, so no member either: the refused move left nothing behind. */
async function expectNothingWritten(person: Person): Promise<void> {
  expect(
    (await h.db.query('SELECT 1 FROM beneficiaries WHERE nid = $1', [person.nid])).rowCount,
  ).toBe(0);
  expect(
    (
      await h.db.query(
        `SELECT 1 FROM beneficiary_family_members m JOIN beneficiaries b ON b.id = m.beneficiary_id
          WHERE b.nid = $1`,
        [person.nid],
      )
    ).rowCount,
  ).toBe(0);
}

/** One answer written straight into an entry, as a public entry may store it. */
async function rawAnswer(
  applicationId: string,
  versionId: string,
  fieldKey: string,
  repeatIndex: number,
  value: unknown,
): Promise<void> {
  const field = await h.db.query<{ id: string }>(
    'SELECT id FROM form_fields WHERE form_version_id = $1 AND field_key = $2',
    [versionId, fieldKey],
  );
  await f.insert(h.db, 'application_answers', {
    id: randomUUID(),
    application_id: applicationId,
    field_id: field.rows[0]!.id,
    repeat_index: repeatIndex,
    value: JSON.stringify(value),
  });
}

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
