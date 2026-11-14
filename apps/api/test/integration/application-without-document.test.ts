import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { SubmissionWriter } from '../../src/applications/submission.js';
import {
  applicationProject,
  applicationRow,
  IDENTITY_ANSWERS,
  principalOf,
  setIdentityRules,
  statusOf,
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
import { beneficiary, fakeMobile, fakeNid, volunteer } from './support/fixtures.js';

// An application without an identity document, by the project's own rule: where the document is
// asked "if they have one" the send makes a profile without a document (and without a mobile when
// none was given); where it is required the send is refused as it always was. A new person who
// looks like a blocked one, with a number or without, gets no profile by a send: the entry waits
// for an official.
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
/** The document and the mobile asked "if they have one". */
let open: Target;
/** Both required. */
let strict: Target;
let generalVolunteer: string;
let teamVolunteer: string;
let mediaUser: string;

type AnswerRecord = Record<string, unknown>;
const toAnswers = (record: AnswerRecord) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
/** The fixture's identity answers without the given questions, with these in their place. */
const answersOf = (without: string[], over: AnswerRecord = {}) => {
  const all: AnswerRecord = { ...IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka), ...over };
  return toAnswers(
    Object.fromEntries(Object.entries(all).filter(([key]) => !without.includes(key))),
  );
};
const text = (v: string) => ({ t: 'short_text', v });
/** A person nobody else in the tests is: each call names another one. */
const someone = () => {
  const tag = randomUUID().slice(0, 8);
  return { q_name: text(`নামহীন ${tag}`), q_father: text(`পিতা ${tag}`) };
};
const create = (s: Session, target: Target, answers: unknown[], over: AnswerRecord = {}) =>
  at(s, 'post', `/projects/${target.project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: target.project,
    formVersionId: target.versionId,
    answers,
    ...over,
  });
const draft = async (s: Session, target: Target, answers: unknown[]) => {
  const made = await create(s, target, answers);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.data.id as string;
};
/** A workflow action with the version the caller last read, as the screen sends it. */
const act = async (s: Session, id: string, action: string, body: AnswerRecord = {}) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', (read.headers.etag as string | undefined) ?? '"none"')
    .send(body);
};
const profileOf = async (beneficiaryId: string) =>
  (
    await h.db.query<{
      nid: string | null;
      birth_reg: string | null;
      mobile: string | null;
      ben_no: number;
      name: string;
    }>('SELECT nid, birth_reg, mobile, ben_no, name FROM beneficiaries WHERE id = $1', [
      beneficiaryId,
    ])
  ).rows[0]!;
const profilesNamed = async (name: string) =>
  (await h.db.query('SELECT id FROM beneficiaries WHERE name = $1', [name])).rowCount;
const answerOf = (
  body: { data: { answers: { fieldKey: string; value: unknown }[] } },
  key: string,
) => body.data.answers.find((a) => a.fieldKey === key)?.value;

async function projectOf(code: string): Promise<Target> {
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code,
    year: 2026,
    name: { bn: 'পরিচয়', en: 'Identity' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const project = made.body.data.id as string;
  const { versionId } = await applicationProject(h, await as(world.users.monitoring), project);
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status, consent_at, created_by)
     VALUES ($1, $2, $3, $4, 'accepted', now(), $5)`,
    [randomUUID(), project, generalVolunteer, teamVolunteer, world.users.general],
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
  await volunteer(h.db, world.dhaka, world.users.team, { type: 'team_member' });
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.team]],
  );
  generalVolunteer = volunteers.rows.find((v) => v.user_id === world.users.general)!.id;
  teamVolunteer = volunteers.rows.find((v) => v.user_id === world.users.team)!.id;
  // a project of the distribution workflow starts with both asked "if they have one"
  open = await projectOf('OPN');
  strict = await projectOf('STR');
  await setIdentityRules(h.db, strict.project, { document: 'required', mobile: 'required' });
});
afterAll(async () => h.close());

describe('a send without an identity number', () => {
  it('makes one profile without a document and without a mobile, bound to the application, and records who made it under which rule', async () => {
    const s = await as(world.users.general);
    const who = someone();
    const id = await draft(s, open, answersOf(['q_id', 'q_mobile'], who));
    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({
      status: 'submitted',
      identityKind: 'none',
      hasDocument: false,
      hasMobile: false,
      flags: [],
    });
    const beneficiaryId = sent.body.data.beneficiaryId as string;
    expect(beneficiaryId).toEqual(expect.any(String));
    const profile = await profileOf(beneficiaryId);
    expect(profile).toMatchObject({ nid: null, birth_reg: null, mobile: null, name: who.q_name.v });
    expect(profile.ben_no).toBeGreaterThan(0);
    const stored = await h.db.query(
      'SELECT beneficiary_id, identity_kind FROM applications WHERE id = $1',
      [id],
    );
    expect(stored.rows).toEqual([{ beneficiary_id: beneficiaryId, identity_kind: 'none' }]);
    const audit = await h.db.query<{ new: Record<string, unknown>; actor_user_id: string }>(
      `SELECT new, actor_user_id FROM audit_log WHERE action = 'beneficiary.create' AND entity_id = $1`,
      [beneficiaryId],
    );
    expect(audit.rows).toEqual([
      {
        actor_user_id: world.users.general,
        new: {
          benNo: profile.ben_no,
          applicationId: id,
          projectId: open.project,
          identityDocument: 'optional',
          mobileRule: 'optional',
          document: 'none',
          hasMobile: false,
          madeBy: world.users.general,
        },
      },
    ]);
  });

  it('makes no second profile when the same application is sent a second time', async () => {
    const s = await as(world.users.general);
    const who = someone();
    const id = await draft(s, open, answersOf(['q_id', 'q_mobile'], who));
    const first = await act(s, id, 'submit');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const again = await act(s, id, 'submit');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('workflow.transition_not_allowed');
    expect(await profilesNamed(who.q_name.v)).toBe(1);
    const stored = await h.db.query('SELECT beneficiary_id FROM applications WHERE id = $1', [id]);
    expect(stored.rows).toEqual([{ beneficiary_id: first.body.data.beneficiaryId }]);
    const made = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_log
        WHERE action = 'beneficiary.create' AND new->>'applicationId' = $1`,
      [id],
    );
    expect(made.rows[0].n).toBe(1);
  });

  it('is refused where the project requires the document, with the error it always gave, whatever the request claims', async () => {
    const s = await as(world.users.general);
    const who = someone();
    const id = await draft(s, strict, answersOf(['q_id'], who));
    const refused = await act(s, id, 'submit');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('workflow.guard.identity_present');
    // the rule is the project's stored one: a body that names another changes nothing
    const claimed = await act(s, id, 'submit', {
      identityRules: { document: 'optional', mobile: 'optional' },
      optionalIdentity: { document: true, mobile: true },
    });
    expect(claimed.status).toBe(409);
    expect(claimed.body.error.code).toBe('workflow.guard.identity_present');
    const smuggled = await create(s, strict, answersOf(['q_id'], someone()), {
      identityRules: { document: 'optional' },
    });
    expect(smuggled.status).toBe(422);
    expect(await statusOf(h.db, id)).toBe('draft');
    expect(await profilesNamed(who.q_name.v)).toBe(0);
    // the same draft goes through once the PM lets the document be left out
    await setIdentityRules(h.db, strict.project, { document: 'optional' });
    try {
      const sent = await act(s, id, 'submit');
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body.data.identityKind).toBe('none');
    } finally {
      await setIdentityRules(h.db, strict.project, { document: 'required' });
    }
  });

  it('still refuses a number that is given in a wrong shape, in both projects', async () => {
    const s = await as(world.users.general);
    for (const target of [open, strict]) {
      const made = await create(s, target, answersOf([], { q_id: text('12345') }));
      expect(made.status).toBe(422);
      expect(made.body.error.details).toEqual([
        expect.objectContaining({ path: 'q_id', code: 'beneficiary.identity_missing' }),
      ]);
    }
  });
});

describe('an identity number of only spaces, or with spaces around it', () => {
  /** A draft written directly, as a row another writer or an earlier version could have left. */
  const stored = (target: Target, id: string, who = someone()) =>
    applicationRow(h.db, {
      projectId: target.project,
      versionId: target.versionId,
      loc: world.dhaka,
      status: 'draft',
      ownerVolunteerId: generalVolunteer,
      createdByUserId: world.users.general,
      answers: Object.fromEntries(
        answersOf([], { ...who, q_id: text(id) }).map((a) => [a.fieldKey, a.value]),
      ),
      over: { beneficiary_id: null },
    });

  it('is never stored by a save: spaces are no answer, and a number loses the spaces around it', async () => {
    const s = await as(world.users.general);
    const spaces = await create(s, open, answersOf([], { ...someone(), q_id: text('   ') }));
    expect(spaces.status, JSON.stringify(spaces.body)).toBe(201);
    expect(answerOf(spaces.body, 'q_id')).toBeUndefined();
    const sent = await act(s, spaces.body.data.id as string, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({ identityKind: 'none', hasDocument: false });
    expect(await profileOf(sent.body.data.beneficiaryId as string)).toMatchObject({
      nid: null,
      birth_reg: null,
    });

    const nid = fakeNid();
    const padded = await create(s, open, answersOf([], { ...someone(), q_id: text(`  ${nid} `) }));
    expect(padded.status, JSON.stringify(padded.body)).toBe(201);
    expect(answerOf(padded.body, 'q_id')).toEqual(text(nid));
    // where the document is required, spaces are as good as nothing
    const who = someone();
    const strictId = await draft(s, strict, answersOf([], { ...who, q_id: text('  ') }));
    const refused = await act(s, strictId, 'submit');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('workflow.guard.identity_present');
    expect(await profilesNamed(who.q_name.v)).toBe(0);
  });

  it('ends as an entry without a number when a stored answer holds only spaces: a profile without a document', async () => {
    const s = await as(world.users.general);
    const who = someone();
    const id = await stored(open, '   ', who);
    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({
      status: 'submitted',
      identityKind: 'none',
      hasDocument: false,
    });
    expect(await profileOf(sent.body.data.beneficiaryId as string)).toMatchObject({
      nid: null,
      birth_reg: null,
      name: who.q_name.v,
    });
    const kind = await h.db.query('SELECT identity_kind FROM applications WHERE id = $1', [id]);
    expect(kind.rows).toEqual([{ identity_kind: 'none' }]);
    // the guard and the binding agree where the document is required too: no number, no send
    const strictWho = someone();
    const strictId = await stored(strict, '   ', strictWho);
    const refused = await act(s, strictId, 'submit');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('workflow.guard.identity_present');
    expect(await profilesNamed(strictWho.q_name.v)).toBe(0);
  });

  it('takes a stored number with spaces around it as the number it is', async () => {
    const s = await as(world.users.general);
    const nid = fakeNid();
    const id = await stored(strict, ` ${nid}  `);
    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({
      status: 'submitted',
      identityKind: 'nid',
      hasDocument: true,
    });
    expect(await profileOf(sent.body.data.beneficiaryId as string)).toMatchObject({
      nid,
      birth_reg: null,
    });
    // a second entry with the same number, written with spaces, binds that profile and makes none
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`,
      [id],
    );
    const again = await stored(strict, `${nid} `);
    const bound = await act(s, again, 'submit');
    expect(bound.status, JSON.stringify(bound.body)).toBe(200);
    expect(bound.body.data.beneficiaryId).toBe(sent.body.data.beneficiaryId);
    const holders = await h.db.query(
      'SELECT count(*)::int AS n FROM beneficiaries WHERE nid = $1',
      [nid],
    );
    expect(holders.rows[0].n).toBe(1);
  });
});

describe('a send without a mobile', () => {
  it('makes the profile with its number and no mobile where the mobile may be left out', async () => {
    const s = await as(world.users.general);
    const nid = fakeNid();
    const id = await draft(s, open, answersOf(['q_mobile'], { q_id: text(nid), ...someone() }));
    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({
      identityKind: 'nid',
      hasDocument: true,
      hasMobile: false,
    });
    expect(await profileOf(sent.body.data.beneficiaryId as string)).toMatchObject({
      nid,
      mobile: null,
    });
  });

  it('is refused where the project requires the mobile', async () => {
    const s = await as(world.users.general);
    const who = someone();
    const id = await draft(s, strict, answersOf(['q_mobile'], who));
    const refused = await act(s, id, 'submit');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('workflow.guard.mandatory_fields_present');
    expect(await profilesNamed(who.q_name.v)).toBe(0);
  });
});

describe('a volunteer’s own number as the person’s', () => {
  it('is refused at the draft for the volunteer, the team member and the lead the draft belongs to', async () => {
    const lead = await as(world.users.general);
    const member = await as(world.users.team);
    const leadMobile = accounts.get(world.users.general)!.mobile;
    const memberMobile = accounts.get(world.users.team)!.mobile;
    const phone = (v: string) => ({ q_mobile: { t: 'phone', v } });
    const cases: [Session, string][] = [
      [lead, leadMobile],
      [member, memberMobile],
      [member, leadMobile],
    ];
    for (const [session, mobile] of cases) {
      const made = await create(
        session,
        open,
        answersOf(['q_id'], { ...someone(), ...phone(mobile) }),
      );
      expect(made.status).toBe(409);
      expect(made.body.error.code).toBe('beneficiary.mobile_is_volunteer_mobile');
    }
  });

  it('is refused at the send too, when the draft already holds it', async () => {
    const lead = await as(world.users.general);
    // drafts written directly, as a draft made before the volunteer's number changed would stand
    const held = (createdBy: string, mobile: string, who = someone()) =>
      applicationRow(h.db, {
        projectId: open.project,
        versionId: open.versionId,
        loc: world.dhaka,
        status: 'draft',
        ownerVolunteerId: generalVolunteer,
        createdByUserId: createdBy,
        answers: Object.fromEntries(
          answersOf(['q_id'], { ...who, q_mobile: { t: 'phone', v: mobile } }).map((a) => [
            a.fieldKey,
            a.value,
          ]),
        ),
        over: { beneficiary_id: null },
      });
    const ofLead = await held(world.users.general, accounts.get(world.users.general)!.mobile);
    const ofMember = await held(world.users.team, accounts.get(world.users.team)!.mobile);
    for (const id of [ofLead, ofMember]) {
      const sent = await act(lead, id, 'submit');
      expect(sent.status, JSON.stringify(sent.body)).toBe(409);
      expect(sent.body.error.code).toBe('beneficiary.mobile_is_volunteer_mobile');
      expect(await statusOf(h.db, id)).toBe('draft');
    }
  });
});

describe('a person who looks like a blocked one', () => {
  const blockedPerson = {
    name: 'আব্দুর রহিম',
    father_or_husband_name: 'আব্দুল করিম',
    village: 'চর নিকলী',
  };
  const lookalike = (village = blockedPerson.village) => ({
    q_name: text(blockedPerson.name),
    q_father: text(blockedPerson.father_or_husband_name),
    q_village: text(village),
  });
  let blocked: string;
  beforeAll(async () => {
    blocked = await beneficiary(h.db, world.dhaka, { ...blockedPerson, is_blocked: true });
  });

  it('gets no profile by the send: the entry waits for verification with that profile as its candidate, and the volunteer is told only that it waits', async () => {
    const s = await as(world.users.general);
    const id = await draft(s, open, answersOf(['q_id'], lookalike()));
    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({
      status: 'needs_verification',
      beneficiaryId: null,
      candidateBeneficiaryId: null,
      flags: [],
    });
    expect(JSON.stringify(sent.body)).not.toContain('blocked');
    expect(JSON.stringify(sent.body)).not.toContain(blocked);
    const stored = await h.db.query(
      'SELECT status, flags, candidate_beneficiary_id, beneficiary_id FROM applications WHERE id = $1',
      [id],
    );
    expect(stored.rows).toEqual([
      {
        status: 'needs_verification',
        flags: ['blocked_name_match'],
        candidate_beneficiary_id: blocked,
        beneficiary_id: null,
      },
    ]);
    // only the blocked profile carries the name
    expect(await profilesNamed(blockedPerson.name)).toBe(1);
    // neither the volunteer's lists nor a filter by the flag say more
    const mine = await at(
      s,
      'get',
      `/projects/${open.project}/applications?flag=blocked_name_match`,
    );
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual([]);
    const listed = await at(s, 'get', '/me/applications?status=needs_verification');
    const row = (listed.body.data as { id: string; flags: string[] }[]).find((r) => r.id === id);
    expect(row?.flags).toEqual([]);
    const steps = await at(s, 'get', `/applications/${id}/timeline`);
    expect(JSON.stringify(steps.body)).not.toContain('blocked');

    // the office reads why it waits and with whom to compare
    const rpm = await as(world.users.rpmDhaka);
    const office = await at(rpm, 'get', `/applications/${id}`);
    expect(office.body.data).toMatchObject({
      status: 'needs_verification',
      flags: ['blocked_name_match'],
      candidateBeneficiaryId: blocked,
    });
    const queue = await at(
      rpm,
      'get',
      `/projects/${open.project}/applications?flag=blocked_name_match`,
    );
    expect((queue.body.data as { id: string }[]).map((r) => r.id)).toContain(id);

    // linking the entry to that person is refused by the block, as every application of theirs is
    const linked = await act(rpm, id, 'verify_link', { linkBeneficiaryId: blocked });
    expect(linked.status).toBe(409);
    expect(linked.body.error.code).toBe('beneficiary.blocked');
    expect(await statusOf(h.db, id)).toBe('needs_verification');
    // the official who compared the two says it is another person: the profile is made
    const created = await act(rpm, id, 'verify_create', {});
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.data).toMatchObject({ status: 'submitted', hasDocument: false });
    expect(created.body.data.beneficiaryId).not.toBe(blocked);
    const audit = await h.db.query<{ new: { madeBy: string; document: string } }>(
      `SELECT new FROM audit_log WHERE action = 'beneficiary.create' AND entity_id = $1`,
      [created.body.data.beneficiaryId],
    );
    expect(audit.rows[0]!.new).toMatchObject({ madeBy: world.users.rpmDhaka, document: 'none' });
  });

  it('links the entry to that person once the block is lifted', async () => {
    const s = await as(world.users.general);
    const rpm = await as(world.users.rpmDhaka);
    const id = await draft(s, open, answersOf(['q_id'], lookalike()));
    expect((await act(s, id, 'submit')).body.data.status).toBe('needs_verification');
    // another profile than the entry's candidate is not the person it waits for
    const stranger = await beneficiary(h.db, world.dhaka);
    const wrong = await act(rpm, id, 'verify_link', { linkBeneficiaryId: stranger });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.verify_other_person' }),
    ]);
    await h.db.query('UPDATE beneficiaries SET is_blocked = false WHERE id = $1', [blocked]);
    try {
      const linked = await act(rpm, id, 'verify_link', { linkBeneficiaryId: blocked });
      expect(linked.status, JSON.stringify(linked.body)).toBe(200);
      expect(linked.body.data).toMatchObject({
        status: 'submitted',
        beneficiaryId: blocked,
        identityKind: 'none',
      });
    } finally {
      await h.db.query(
        `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`,
        [id],
      );
      await h.db.query('UPDATE beneficiaries SET is_blocked = true WHERE id = $1', [blocked]);
    }
  });

  it('holds a new person with an unused number too, also where the project requires the document, and the official who says it is another person makes the profile', async () => {
    const s = await as(world.users.general);
    const rpm = await as(world.users.rpmDhaka);
    for (const target of [strict, open]) {
      const nid = fakeNid();
      const id = await draft(s, target, answersOf([], { ...lookalike(), q_id: text(nid) }));
      const sent = await act(s, id, 'submit');
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      // the volunteer reads only that the entry waits
      expect(sent.body.data).toMatchObject({
        status: 'needs_verification',
        beneficiaryId: null,
        candidateBeneficiaryId: null,
        flags: [],
      });
      expect(JSON.stringify(sent.body)).not.toContain('blocked');
      expect(JSON.stringify(sent.body)).not.toContain(blocked);
      const mine = await at(s, 'get', `/applications/${id}`);
      expect(mine.body.data).toMatchObject({ flags: [], candidateBeneficiaryId: null });
      const stored = await h.db.query(
        'SELECT status, flags, candidate_beneficiary_id, beneficiary_id, app_no FROM applications WHERE id = $1',
        [id],
      );
      expect(stored.rows).toEqual([
        {
          status: 'needs_verification',
          flags: ['blocked_name_match'],
          candidate_beneficiary_id: blocked,
          beneficiary_id: null,
          app_no: null,
        },
      ]);
      // the abandoned send left no profile for the number
      const holders = () =>
        h.db.query<{ id: string }>('SELECT id FROM beneficiaries WHERE nid = $1', [nid]);
      expect((await holders()).rows).toEqual([]);

      const office = await at(rpm, 'get', `/applications/${id}`);
      expect(office.body.data).toMatchObject({
        flags: ['blocked_name_match'],
        candidateBeneficiaryId: blocked,
      });
      // the official compared the two and says it is another person: the profile is made, with
      // its number, and the entry does not come back to the queue
      const created = await act(rpm, id, 'verify_create', {});
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      expect(created.body.data).toMatchObject({
        status: 'submitted',
        identityKind: 'nid',
        hasDocument: true,
      });
      expect((await holders()).rows).toEqual([{ id: created.body.data.beneficiaryId }]);
      expect(created.body.data.beneficiaryId).not.toBe(blocked);
      expect(await statusOf(h.db, id)).toBe('submitted');
    }
  });

  it('lets an official make the profile of an entry without a number as another person, once', async () => {
    const s = await as(world.users.general);
    const rpm = await as(world.users.rpmDhaka);
    const id = await draft(s, open, answersOf(['q_id'], lookalike()));
    expect((await act(s, id, 'submit')).body.data.status).toBe('needs_verification');
    const created = await act(rpm, id, 'verify_create', {});
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.data).toMatchObject({ status: 'submitted', identityKind: 'none' });
    // the verification is one move: a second one finds nothing waiting
    const again = await act(rpm, id, 'verify_create', {});
    expect(again.status).toBe(409);
    expect(await statusOf(h.db, id)).toBe('submitted');
    const made = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_log
        WHERE action = 'beneficiary.create' AND new->>'applicationId' = $1`,
      [id],
    );
    expect(made.rows[0].n).toBe(1);
  });

  it('compares at the verification of an entry that waits for another reason: a person blocked after the hold gets no profile, the entry gains the profile to compare, and the official who then says it is another person makes it', async () => {
    const rpm = await as(world.users.rpmDhaka);
    for (const [target, without] of [
      [open, ['q_id']],
      [strict, []],
    ] as const) {
      const tag = randomUUID().slice(0, 8);
      const person = {
        name: `জমিলা ${tag}`,
        father_or_husband_name: `হাশেম ${tag}`,
        village: 'দক্ষিণ পাড়া',
      };
      const profile = await beneficiary(h.db, world.dhaka, person);
      // a late offline send: the entry waits, and nobody of that name was blocked then
      const id = await applicationRow(h.db, {
        projectId: target.project,
        versionId: target.versionId,
        loc: world.dhaka,
        status: 'needs_verification',
        ownerVolunteerId: generalVolunteer,
        createdByUserId: world.users.general,
        answers: Object.fromEntries(
          answersOf([...without], {
            q_name: text(person.name),
            q_father: text(person.father_or_husband_name),
            q_village: text(person.village),
          }).map((a) => [a.fieldKey, a.value]),
        ),
        over: { flags: ['late_sync'], submitted_at: new Date() },
      });
      await h.db.query('UPDATE beneficiaries SET is_blocked = true WHERE id = $1', [profile]);

      const first = await act(rpm, id, 'verify_create', {});
      expect(first.status, JSON.stringify(first.body)).toBe(409);
      expect(first.body.error.code).toBe('application.verify_blocked_match');
      expect(first.body.error.message).toContain('ব্লক করা ব্যক্তির');
      // no profile was made, and the entry still waits, now with the match and whom to compare
      expect(await profilesNamed(person.name)).toBe(1);
      const stored = await h.db.query(
        'SELECT status, flags, candidate_beneficiary_id, beneficiary_id, app_no FROM applications WHERE id = $1',
        [id],
      );
      expect(stored.rows).toEqual([
        {
          status: 'needs_verification',
          flags: ['late_sync', 'blocked_name_match'],
          candidate_beneficiary_id: profile,
          beneficiary_id: null,
          app_no: null,
        },
      ]);
      const office = await at(rpm, 'get', `/applications/${id}`);
      expect(office.body.data).toMatchObject({
        status: 'needs_verification',
        flags: ['late_sync', 'blocked_name_match'],
        candidateBeneficiaryId: profile,
      });
      // the volunteer who brought it still reads only that it waits
      const mine = await at(await as(world.users.general), 'get', `/applications/${id}`);
      expect(mine.body.data).toMatchObject({ flags: ['late_sync'], candidateBeneficiaryId: null });
      // the version the official saw before the match no longer stands
      const stale = await at(rpm, 'post', `/applications/${id}/actions/verify_create`)
        .set('If-Match', '"stale"')
        .send({});
      expect(stale.status).toBe(412);

      // the official has compared the two and says it is another person
      const second = await act(rpm, id, 'verify_create', {});
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(second.body.data.status).toBe('submitted');
      expect(second.body.data.beneficiaryId).not.toBe(profile);
      expect(await profilesNamed(person.name)).toBe(2);
      const audits = await h.db.query<{ action: string; new: Record<string, unknown> }>(
        `SELECT action, new FROM audit_log WHERE entity_type = 'application' AND entity_id = $1
          ORDER BY created_at, id`,
        [id],
      );
      expect(audits.rows.map((r) => r.action)).toEqual([
        'application.blocked_match_found',
        'application.person_bound',
        'application.verify_create',
        'application.numbered',
      ]);
      expect(audits.rows[0]!.new).toMatchObject({
        flags: ['late_sync', 'blocked_name_match'],
        candidateBeneficiaryId: profile,
      });
    }
  });

  it('makes the profile at the first attempt for an entry that waits for another reason when its person matches nobody blocked', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const who = someone();
    const id = await applicationRow(h.db, {
      projectId: open.project,
      versionId: open.versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: Object.fromEntries(answersOf(['q_id'], who).map((a) => [a.fieldKey, a.value])),
      over: { flags: ['late_sync'], submitted_at: new Date() },
    });
    const created = await act(rpm, id, 'verify_create', {});
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.data).toMatchObject({ status: 'submitted', flags: ['late_sync'] });
  });

  it('compares inside the move: a person blocked after the draft was made is held by the send, and nothing of the abandoned send stays', async () => {
    const s = await as(world.users.general);
    const tag = randomUUID().slice(0, 8);
    const person = {
      name: `রহিমা ${tag}`,
      father_or_husband_name: `করিম ${tag}`,
      village: 'পূর্ব পাড়া',
    };
    const profile = await beneficiary(h.db, world.dhaka, person);
    const nid = fakeNid();
    const id = await draft(
      s,
      strict,
      answersOf([], {
        q_id: text(nid),
        q_name: text(person.name),
        q_father: text(person.father_or_husband_name),
        q_village: text(person.village),
      }),
    );
    // the block arrives after every check the draft passed
    await h.db.query('UPDATE beneficiaries SET is_blocked = true WHERE id = $1', [profile]);
    // the binding itself makes no profile, in whatever transaction calls it
    const c = h.container;
    const writer = new SubmissionWriter(
      c.access,
      c.beneficiaryIdentity,
      c.beneficiaryContact,
      c.audit,
    );
    const principal = await principalOf(h.db, world.users.general);
    await expect(
      c.prisma.$transaction((tx) => writer.bindPerson(tx, principal, id)),
    ).rejects.toMatchObject({ name: 'BlockedNamesakeMatch', beneficiaryId: profile });

    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data).toMatchObject({ status: 'needs_verification', flags: [] });
    const stored = await h.db.query(
      'SELECT status, flags, candidate_beneficiary_id, beneficiary_id, app_no, submitted_by FROM applications WHERE id = $1',
      [id],
    );
    expect(stored.rows).toEqual([
      {
        status: 'needs_verification',
        flags: ['blocked_name_match'],
        candidate_beneficiary_id: profile,
        beneficiary_id: null,
        app_no: null,
        submitted_by: null,
      },
    ]);
    const holders = await h.db.query(
      'SELECT count(*)::int AS n FROM beneficiaries WHERE nid = $1',
      [nid],
    );
    expect(holders.rows[0].n).toBe(0);
    // of the send only the hold is on record: no move, no person, no number
    const audits = await h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'application' AND entity_id = $1 ORDER BY created_at, id`,
      [id],
    );
    expect(audits.rows.map((r) => r.action)).toEqual([
      'application.create',
      'application.held_for_verification',
    ]);
  });

  it('does not hold a namesake of another village, with a number or without, nor a person whose number a profile already holds', async () => {
    const s = await as(world.users.general);
    const elsewhere = await draft(s, open, answersOf(['q_id'], lookalike('অন্য গ্রাম')));
    const sent = await act(s, elsewhere, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data.status).toBe('submitted');
    expect(sent.body.data.beneficiaryId).not.toBe(blocked);
    const numbered = await draft(s, strict, answersOf([], lookalike('আরেক গ্রাম')));
    const withNumber = await act(s, numbered, 'submit');
    expect(withNumber.status, JSON.stringify(withNumber.body)).toBe(200);
    expect(withNumber.body.data).toMatchObject({ status: 'submitted', identityKind: 'nid' });
    // a known person is bound to their own profile: nothing is made, so nothing is compared,
    // even when a blocked profile carries the same names in the same village
    const known = await beneficiary(h.db, world.dhaka, blockedPerson);
    const { nid } = await profileOf(known);
    const forKnown = await draft(s, strict, answersOf([], { q_id: text(nid!) }));
    const bound = await act(s, forKnown, 'submit');
    expect(bound.status, JSON.stringify(bound.body)).toBe(200);
    expect(bound.body.data).toMatchObject({ status: 'submitted', beneficiaryId: known });
  });
});

describe('the verification of an entry without a number', () => {
  const entry = (target: Target, who = someone()) =>
    applicationRow(h.db, {
      projectId: target.project,
      versionId: target.versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: Object.fromEntries(answersOf(['q_id'], who).map((a) => [a.fieldKey, a.value])),
      over: { flags: ['public_entry'], submitted_at: new Date() },
    });

  it('makes a profile without a document as a new person where the project allows it', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const who = someone();
    const id = await entry(open, who);
    // nobody to link it to: an entry without a number names no profile
    const linked = await act(rpm, id, 'verify_link', { linkBeneficiaryId: randomUUID() });
    expect(linked.status).toBe(422);
    expect(linked.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.verify_no_profile' }),
    ]);
    const created = await act(rpm, id, 'verify_create', {});
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.data).toMatchObject({
      status: 'submitted',
      identityKind: 'none',
      hasDocument: false,
      hasMobile: true,
    });
    expect(await profileOf(created.body.data.beneficiaryId as string)).toMatchObject({
      nid: null,
      birth_reg: null,
      name: who.q_name.v,
    });
  });

  it('is refused where the project requires the document', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const who = someone();
    const id = await entry(strict, who);
    const created = await act(rpm, id, 'verify_create', {});
    expect(created.status).toBe(409);
    expect(created.body.error.code).toBe('workflow.guard.identity_present');
    expect(await statusOf(h.db, id)).toBe('needs_verification');
    expect(await profilesNamed(who.q_name.v)).toBe(0);
  });
});

describe('who is told that a person has no document or no mobile', () => {
  let id: string;
  let beneficiaryId: string;
  beforeAll(async () => {
    const s = await as(world.users.general);
    id = await draft(s, open, answersOf(['q_id', 'q_mobile'], someone()));
    const sent = await act(s, id, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    beneficiaryId = sent.body.data.beneficiaryId as string;
  });

  it('tells the volunteer who brought the application, on its record', async () => {
    const s = await as(world.users.general);
    const mine = await at(s, 'get', `/applications/${id}`);
    expect(mine.body.data).toMatchObject({
      identityKind: 'none',
      hasDocument: false,
      hasMobile: false,
    });
    expect(answerOf(mine.body, 'q_mobile')).toBeUndefined();
    // a list row tells a volunteer neither
    const listed = await at(s, 'get', '/me/applications?status=submitted');
    const row = (listed.body.data as { id: string }[]).find((r) => r.id === id);
    expect(row).toMatchObject({ hasDocument: null, hasMobile: null });
  });

  it('tells an official in scope on the record, the list, the profile and the beneficiary list', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const record = await at(rpm, 'get', `/applications/${id}`);
    expect(record.body.data).toMatchObject({
      identityKind: 'none',
      hasDocument: false,
      hasMobile: false,
    });
    const list = await at(rpm, 'get', `/projects/${open.project}/applications?status=submitted`);
    expect((list.body.data as { id: string }[]).find((r) => r.id === id)).toMatchObject({
      hasDocument: false,
      hasMobile: false,
    });
    const profile = await at(rpm, 'get', `/beneficiaries/${beneficiaryId}`);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).toMatchObject({
      mobile: null,
      hasDocument: false,
      nid: null,
      birthReg: null,
    });
    const { name } = await profileOf(beneficiaryId);
    const people = await at(rpm, 'get', `/beneficiaries?q=${encodeURIComponent(name)}`);
    expect(people.status, JSON.stringify(people.body)).toBe(200);
    const row = (people.body.data as Record<string, unknown>[]).find((r) => r.id === beneficiaryId);
    expect(row).toMatchObject({ mobile: null, hasDocument: false });
    expect(row).not.toHaveProperty('nid');
    expect(row).not.toHaveProperty('birthReg');
    // a person with a document reads true, and the number stays out of the list
    const withNumber = await beneficiary(h.db, world.dhaka, { name: `${name} দুই` });
    const both = await at(rpm, 'get', `/beneficiaries?q=${encodeURIComponent(name)}`);
    const full = (both.body.data as Record<string, unknown>[]).find((r) => r.id === withNumber);
    expect(full).toMatchObject({ hasDocument: true });
    expect(full).not.toHaveProperty('nid');
  });

  it('tells an official outside the identity scope whether a document is on file, never the number', async () => {
    // the Rangpur RPM holds the identity class; the profile lives in Dhaka, outside the NID scope
    const rpm = await as(world.users.rpmRangpur);
    const withNumber = await beneficiary(h.db, world.dhaka);
    for (const [personId, has] of [
      [beneficiaryId, false],
      [withNumber, true],
    ] as const) {
      const profile = await at(rpm, 'get', `/beneficiaries/${personId}`);
      expect(profile.status).toBe(200);
      expect(profile.body.data.hasDocument).toBe(has);
      expect(profile.body.data).not.toHaveProperty('nid');
      expect(profile.body.data).not.toHaveProperty('birthReg');
    }
  });

  it('tells the Media Team neither, in its limited view', async () => {
    const media = await as(mediaUser);
    const profile = await at(media, 'get', `/beneficiaries/${beneficiaryId}`);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    for (const key of ['hasDocument', 'mobile', 'nid', 'birthReg'])
      expect(profile.body.data).not.toHaveProperty(key);
    const { name } = await profileOf(beneficiaryId);
    const people = await at(media, 'get', `/beneficiaries?q=${encodeURIComponent(name)}`);
    expect(people.status).toBe(200);
    const row = (people.body.data as Record<string, unknown>[]).find((r) => r.id === beneficiaryId);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('hasDocument');
    expect(row).not.toHaveProperty('mobile');
  });

  it('hides the application and the profile from another volunteer, and the missing document from a paid volunteer of the project', async () => {
    const other = await as(world.users.rangpurVolunteer);
    expect((await at(other, 'get', `/applications/${id}`)).status).toBe(404);
    expect((await at(other, 'get', `/beneficiaries/${beneficiaryId}`)).status).toBe(403);
    expect((await at(other, 'get', '/beneficiaries')).status).toBe(403);
    const paidAccount = await account(h.db, { kind: 'volunteer', role: 'volunteer_paid' });
    accounts.set(paidAccount.id, paidAccount);
    const paid = await volunteer(h.db, world.dhaka, paidAccount.id, { type: 'paid' });
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'work_progress', '{}', $5, 'accepted')`,
      [randomUUID(), open.project, paid, world.dhaka.division, world.users.rpmDhaka],
    );
    const theirs = await at(await as(paidAccount.id), 'get', `/applications/${id}`);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    expect(theirs.body.data).toMatchObject({
      identityKind: null,
      hasDocument: null,
      hasMobile: null,
    });
  });

  it('keeps an edit of the application on its person, with the names the profile holds and no number added', async () => {
    const s = await as(world.users.general);
    const before = await at(s, 'get', `/applications/${id}`);
    const answers = (before.body.data.answers as { fieldKey: string; value: unknown }[]).map((a) =>
      a.fieldKey === 'q_name' ? { ...a, value: text('অন্য নাম') } : a,
    );
    const edited = await at(s, 'patch', `/applications/${id}`)
      .set('If-Match', before.headers.etag as string)
      .send({ answers });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data).toMatchObject({ beneficiaryId, identityKind: 'none' });
    expect(answerOf(edited.body, 'q_name')).toEqual(answerOf(before.body, 'q_name'));
    // a number is put on such a profile by an official who compared the two, never by an edit
    const numbered = await at(s, 'patch', `/applications/${id}`)
      .set('If-Match', edited.headers.etag as string)
      .send({ answers: [...answers, { fieldKey: 'q_id', value: text(fakeNid()) }] });
    expect(numbered.status).toBe(422);
    expect(numbered.body.error.details).toEqual([
      expect.objectContaining({ path: 'q_id', code: 'beneficiary.locked_field' }),
    ]);
    expect(await profileOf(beneficiaryId)).toMatchObject({ nid: null, birth_reg: null });
  });
});
