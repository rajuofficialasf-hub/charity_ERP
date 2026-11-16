import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { applicationProject, IDENTITY_ANSWERS } from './support/applications.js';
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

// Whether the name beside a beneficiary is the father's or the husband's: an optional question of
// a form, its options from the reference list, fills one column of the profile. A submit writes it
// to a new profile; a later application gives it to a known profile only while the profile holds
// none and never changes one it holds; every reader who is not shown the father's or husband's
// name is not shown the relation either.
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
/** Three projects whose form asks whose name it is, and one whose form has the seven questions only. */
let asking: Target;
let askingToo: Target;
let askingThree: Target;
let plain: Target;
let generalVolunteer: string;
let mediaUser: string;

type AnswerRecord = Record<string, unknown>;
const text = (v: string) => ({ t: 'short_text', v });
const relation = (code: string) => ({ t: 'single_select', v: code });
/** The identity answers of a new person, with these in the place of the fixture's. */
const answersOf = (over: AnswerRecord = {}) =>
  Object.entries({ ...IDENTITY_ANSWERS(f.fakeNid(), f.fakeMobile(), world.dhaka), ...over }).map(
    ([fieldKey, value]) => ({ fieldKey, value }),
  );
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
const relationOf = async (beneficiaryId: string) =>
  (
    await h.db.query<{ guardian_relation_code: string | null }>(
      'SELECT guardian_relation_code FROM beneficiaries WHERE id = $1',
      [beneficiaryId],
    )
  ).rows[0]!.guardian_relation_code;
const fills = async (beneficiaryId: string) =>
  (
    await h.db.query<{ actor_user_id: string; new: Record<string, unknown> }>(
      `SELECT actor_user_id, new FROM audit_log
        WHERE action = 'beneficiary.guardian_relation_set' AND entity_id = $1`,
      [beneficiaryId],
    )
  ).rows;

/** The question as the builder's press writes it, with the builder's own (empty) options. */
const RELATION_QUESTION = [
  question('q_relation', 'single_select', { standardColumn: 'guardian_relation_code' }),
];

async function projectOf(code: string, fields?: unknown[]): Promise<Target> {
  const made = await draftProject(h, await as(world.users.pm), {
    programId: world.a1.program,
    code,
    year: 2026,
    name: { bn: 'পিতা না স্বামী', en: 'Father or husband' },
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
  asking = await projectOf('GRA', RELATION_QUESTION);
  askingToo = await projectOf('GRB', RELATION_QUESTION);
  askingThree = await projectOf('GRC', RELATION_QUESTION);
  plain = await projectOf('GRP');
});
afterAll(async () => h.close());

describe('the question whose name it is', () => {
  it('takes its options from the list guardian_relation, whatever the builder wrote, and refuses a code the list does not hold', async () => {
    const s = await as(world.users.general);
    const made = await create(s, asking, answersOf({ q_relation: relation('husband') }));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const fields = (
      made.body.data.form.sections as {
        fields: { fieldKey: string; options?: { code: string; label: { bn: string } }[] }[];
      }[]
    ).flatMap((section) => section.fields);
    const options = fields.find((field) => field.fieldKey === 'q_relation')!.options!;
    expect(options.map((o) => [o.code, o.label.bn])).toEqual([
      ['father', 'পিতা'],
      ['husband', 'স্বামী'],
    ]);
    const unlisted = await create(s, asking, answersOf({ q_relation: relation('brother') }));
    expect(unlisted.status).toBe(422);
    expect(unlisted.body.error.details).toEqual([
      expect.objectContaining({ path: 'q_relation', code: 'validation.option_unknown' }),
    ]);
  });
});

describe('a submit that says whose name it is', () => {
  it('writes the relation to the new profile, and the office reads it on the profile and on the record', async () => {
    const record = await sent(
      await as(world.users.general),
      asking,
      answersOf({ q_relation: relation('husband') }),
    );
    expect(await relationOf(record.beneficiaryId)).toBe('husband');
    // a new profile is made with it: the audit of the profile's creation stands for it
    expect(await fills(record.beneficiaryId)).toEqual([]);
    const rpm = await as(world.users.rpmDhaka);
    const profile = await at(rpm, 'get', `/beneficiaries/${record.beneficiaryId}`);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).toMatchObject({
      fatherOrHusbandName: expect.stringMatching(/^নমুনা পিতা/),
      guardianRelationCode: 'husband',
    });
    const read = await at(rpm, 'get', `/applications/${record.id}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data.guardianRelationCode).toBe('husband');
  });

  it('keeps nothing where the question is left empty, and takes a form published without it', async () => {
    const s = await as(world.users.general);
    const silent = await sent(s, asking, answersOf());
    expect(await relationOf(silent.beneficiaryId)).toBeNull();
    const record = await sent(s, plain, answersOf());
    expect(record.status).toBe('submitted');
    expect(await relationOf(record.beneficiaryId)).toBeNull();
    const read = await at(await as(world.users.rpmDhaka), 'get', `/applications/${record.id}`);
    expect(read.body.data.guardianRelationCode).toBeNull();
  });

  it('refuses a relation the list no longer holds with the option error, for a new person and a known one, and writes nothing', async () => {
    // the list holds the code while the form is published, so the form offers it, and loses it
    // before the send
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en) VALUES ($1, 'guardian_relation', 'brother', 'ভাই', 'Brother')`,
      [randomUUID()],
    );
    const withBrother = await projectOf('GRT', RELATION_QUESTION);
    const s = await as(world.users.general);
    const nid = f.fakeNid();
    const made = await create(
      s,
      withBrother,
      answersOf({ q_id: text(nid), q_relation: relation('brother') }),
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    // a person the office already knows, without a relation, whose later application names it
    const person = await sent(s, plain, answersOf());
    const known = (
      await h.db.query<{ nid: string; mobile: string }>(
        'SELECT nid, mobile FROM beneficiaries WHERE id = $1',
        [person.beneficiaryId],
      )
    ).rows[0]!;
    const forKnown = await create(
      s,
      withBrother,
      answersOf({
        q_id: text(known.nid),
        q_mobile: { t: 'phone', v: known.mobile },
        q_relation: relation('brother'),
      }),
    );
    expect(forKnown.status, JSON.stringify(forKnown.body)).toBe(201);
    await h.db.query(
      `DELETE FROM reference_lists WHERE list_key = 'guardian_relation' AND code = 'brother'`,
    );

    for (const id of [made.body.data.id as string, forKnown.body.data.id as string]) {
      const refused = await act(s, id, 'submit');
      expect(refused.status, JSON.stringify(refused.body)).toBe(422);
      expect(refused.body.error).toMatchObject({
        code: 'validation.failed',
        details: [{ path: 'answers', code: 'validation.option_unknown' }],
      });
      const draft = await at(s, 'get', `/applications/${id}`);
      expect(draft.body.data).toMatchObject({ status: 'draft' });
    }
    expect((await h.db.query('SELECT 1 FROM beneficiaries WHERE nid = $1', [nid])).rowCount).toBe(
      0,
    );
    expect(await relationOf(person.beneficiaryId)).toBeNull();
  });
});

describe('a later application of a known person', () => {
  /** A person the office knows by this NID, made through a form without the question. */
  async function knownWithout() {
    const nid = f.fakeNid();
    const mobile = f.fakeMobile();
    const record = await sent(
      await as(world.users.general),
      plain,
      answersOf({ q_id: text(nid), q_mobile: { t: 'phone', v: mobile } }),
    );
    return { nid, mobile, beneficiaryId: record.beneficiaryId };
  }
  const again = (person: { nid: string; mobile: string }, code: string) =>
    answersOf({
      q_id: text(person.nid),
      q_mobile: { t: 'phone', v: person.mobile },
      q_relation: relation(code),
    });

  it('gives the relation to a profile that holds none, audited, whoever sends it', async () => {
    const person = await knownWithout();
    expect(await relationOf(person.beneficiaryId)).toBeNull();
    const record = await sent(await as(world.users.general), asking, again(person, 'father'));
    expect(record.beneficiaryId).toBe(person.beneficiaryId);
    expect(await relationOf(person.beneficiaryId)).toBe('father');
    expect(await fills(person.beneficiaryId)).toEqual([
      {
        actor_user_id: world.users.general,
        new: { guardianRelationCode: 'father', applicationId: record.id },
      },
    ]);
  });

  it('never changes a relation the profile holds, by a volunteer or by an official', async () => {
    const person = await knownWithout();
    await sent(await as(world.users.general), asking, again(person, 'husband'));
    expect(await relationOf(person.beneficiaryId)).toBe('husband');
    // a person applies once per project
    for (const [sender, target] of [
      [world.users.general, askingToo],
      [world.users.rpmDhaka, askingThree],
    ] as const) {
      const record = await sent(await as(sender), target, again(person, 'father'));
      expect(record.beneficiaryId).toBe(person.beneficiaryId);
      expect(await relationOf(person.beneficiaryId)).toBe('husband');
      // the record calls the name by what the profile holds, not by this application's answer
      const read = await at(await as(world.users.rpmDhaka), 'get', `/applications/${record.id}`);
      expect(read.body.data.guardianRelationCode).toBe('husband');
    }
    // the fill was written once, when the profile held none
    expect(await fills(person.beneficiaryId)).toHaveLength(1);
  });
});

describe('who is told whose name it is', () => {
  let person: { id: string; applicationId: string };
  beforeAll(async () => {
    const record = await sent(
      await as(world.users.general),
      asking,
      answersOf({ q_relation: relation('husband') }),
    );
    person = { id: record.beneficiaryId, applicationId: record.id };
  });

  it('tells the Media Team neither the father’s or husband’s name nor the relation on the profile', async () => {
    const media = await at(await as(mediaUser), 'get', `/beneficiaries/${person.id}`);
    expect(media.status, JSON.stringify(media.body)).toBe(200);
    expect(media.body.data).toHaveProperty('name');
    for (const key of ['fatherOrHusbandName', 'guardianRelationCode'])
      expect(media.body.data, key).not.toHaveProperty(key);
  });

  it('tells a reader of the record without the personal-details class nothing of the relation', async () => {
    // a Procurement Team member the permission panel lets read the project's applications keeps
    // the classes of the role, which do not hold the personal details
    const reader = await account(h.db, { role: 'procurement_team' });
    accounts.set(reader.id, reader);
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
       VALUES ($1, $2, 'application.view', 'grant', 'PROJECT', $3, 'Test override', $4)`,
      [randomUUID(), reader.id, asking.project, world.users.head],
    );
    const theirs = await at(await login(h, reader), 'get', `/applications/${person.applicationId}`);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    expect(theirs.body.data).not.toHaveProperty('guardianRelationCode');
    // the office reads it
    const office = await at(
      await as(world.users.rpmDhaka),
      'get',
      `/applications/${person.applicationId}`,
    );
    expect(office.body.data.guardianRelationCode).toBe('husband');
  });
});
