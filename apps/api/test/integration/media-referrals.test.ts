import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, IDENTITY_ANSWERS } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import { question } from './support/forms';
import { fakeMobile, fakeNid } from './support/fixtures';
import { notificationsOf } from './support/notifications';

// The referral of an approved application to the Media Team: a PM of the program or an RPM of the
// region refers it with a priority, a note and an optional story; the Media Director or the
// Assistant Director accepts it (its work starts), sends it back with a comment or rejects it with
// a reason; a returned referral is corrected and sent again. The application's own workflow never
// moves, and the Media Team never opens the application itself.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
const media = { director: '', assistant: '', member: '', finance: '', otherPm: '' };

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const read = (s: Session, id: string) => at(s, 'get', `/applications/${id}`);
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const before = await read(s, id);
  const res = await at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', before.headers.etag as string)
    .send(body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
};

/** A volunteer's application of the Dhaka region, moved as far as `until`; answers its id. */
async function application(until: 'submitted' | 'approved' = 'approved'): Promise<string> {
  const s = await as(world.users.general);
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers: toAnswers({
      ...IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
      q_occupation: { t: 'single_select', v: 'day_labourer' },
    }),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.data.id as string;
  await act(s, id, 'submit');
  if (until === 'submitted') return id;
  const rpm = await as(world.users.rpmDhaka);
  await act(rpm, id, 'review');
  await act(rpm, id, 'send_for_approval');
  await act(rpm, id, 'approve');
  return id;
}

const REFERRAL = { priority: 'high', note: 'ভালো গল্প হতে পারে', story: 'তিনি একাই সংসার চালান' };
const refer = (s: Session, id: string, body: Record<string, unknown> = REFERRAL) =>
  at(s, 'post', `/applications/${id}/media-referral`).send(body);
const decide = (s: Session, referralId: string, body: Record<string, unknown>) =>
  at(s, 'post', `/media-referrals/${referralId}/decision`).send(body);
const referred = async (id: string, by = world.users.rpmDhaka) => {
  const res = await refer(await as(by), id);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};
const workflowOf = async (id: string) => {
  const app = await h.db.query<{ status: string }>(
    'SELECT status FROM applications WHERE id = $1',
    [id],
  );
  const moves = await h.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_log WHERE entity_type = 'application' AND entity_id = $1`,
    [id],
  );
  return { status: app.rows[0]!.status, moves: moves.rows[0]!.n };
};
const auditActions = async (referralId: string) =>
  (
    await h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'media_referral' AND entity_id = $1 ORDER BY created_at`,
      [referralId],
    )
  ).rows.map((r) => r.action);

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
  media.director = await make('staff')('media_director');
  media.assistant = await make('staff')('media_assistant_director');
  media.member = await make('staff')('media_team');
  media.finance = await make('staff')('finance_team');
  media.otherPm = await make('staff')('program_manager');
  await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
    media.otherPm,
    world.b1.program,
  ]);
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'MED',
    year: 2026,
    name: { bn: 'মিডিয়া', en: 'Media' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    form: {
      fields: [
        question('q_occupation', 'single_select', {
          standardColumn: 'occupation_code',
          options: [
            {
              code: 'day_labourer',
              label: { bn: 'দিনমজুর', en: 'Day labourer' },
              dependsOnOptionCode: null,
              allowsOtherText: false,
            },
          ],
        }),
        question('official_comment', 'long_text'),
      ],
    },
  }));
  for (const [rpm, division] of [
    [world.users.rpmDhaka, world.dhaka.division],
    [world.users.rpmRangpur, world.rangpur.division],
  ] as const)
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), project, division, rpm],
    );
  const general = await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [
    world.users.general,
  ]);
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, general.rows[0]!.id, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
});
afterAll(async () => h.close());

describe('a referral to the Media Team', () => {
  it('is sent by the region’s RPM with its priority, note and story, and reaches both directors', async () => {
    const id = await application();
    const before = await workflowOf(id);
    const res = await refer(await as(world.users.rpmDhaka), id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const referral = res.body.data;
    expect(referral).toMatchObject({
      applicationId: id,
      state: 'pending',
      priority: 'high',
      note: REFERRAL.note,
      story: REFERRAL.story,
      referredBy: { id: world.users.rpmDhaka },
      project: { id: project, year: 2026 },
      work: null,
      mayResend: false,
    });
    expect(referral.history).toEqual([
      expect.objectContaining({ kind: 'referred', toValue: 'pending' }),
    ]);
    expect(await workflowOf(id)).toEqual(before);
    expect(await auditActions(referral.id)).toEqual(['media.referral_created']);
    for (const director of [media.director, media.assistant])
      expect(await notificationsOf(h.db, 'media_referral_new', director)).toEqual([
        expect.objectContaining({
          params: expect.objectContaining({ referralId: referral.id }),
        }),
      ]);
    // the entry names the project, never the person
    const [entry] = await notificationsOf(h.db, 'media_referral_new', media.director);
    expect(JSON.stringify(entry!.params)).not.toContain(referral.beneficiaryName);
  });

  it('is sent by the program’s PM, and the record shows its media state to the referrers and the directors', async () => {
    const id = await application();
    const referralId = await referred(id, world.users.pm);
    for (const user of [world.users.pm, world.users.rpmDhaka, world.users.head]) {
      const record = await read(await as(user), id);
      expect(record.status).toBe(200);
      expect(record.body.data.media, user).toMatchObject({ referralId, state: 'pending' });
      expect(record.body.data.mayReferToMedia).toBe(false);
    }
    const volunteer = await read(await as(world.users.general), id);
    expect(volunteer.body.data.media).toBeNull();
    expect(volunteer.body.data.mayReferToMedia).toBe(false);
  });

  it('offers the referral on an approved application only to whoever may send it', async () => {
    const id = await application();
    expect((await read(await as(world.users.rpmDhaka), id)).body.data).toMatchObject({
      media: null,
      mayReferToMedia: true,
    });
    const executive = await read(await as(world.users.executive), id);
    expect(executive.status).toBe(200);
    expect(executive.body.data).toMatchObject({ media: null, mayReferToMedia: false });
    const pending = await application('submitted');
    expect((await read(await as(world.users.rpmDhaka), pending)).body.data.mayReferToMedia).toBe(
      false,
    );
  });

  it('is refused for an application that is not approved, and taken past approval', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const submitted = await application('submitted');
    const refused = await refer(rpm, submitted);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('media.referral_not_referable');
    const rejected = await application();
    await h.db.query(`UPDATE applications SET status = 'rejected' WHERE id = $1`, [rejected]);
    expect((await refer(rpm, rejected)).status).toBe(409);
    const later = await application();
    await h.db.query(`UPDATE applications SET status = 'implementation' WHERE id = $1`, [later]);
    expect((await refer(rpm, later)).status).toBe(201);
  });

  it('is refused outside the region or program (404), and to a volunteer, the Finance Team and the Media Team (403)', async () => {
    const id = await application();
    for (const user of [world.users.rpmRangpur, media.otherPm]) {
      const res = await refer(await as(user), id);
      expect(res.status, user).toBe(404);
    }
    for (const user of [world.users.general, media.finance, media.member, media.director]) {
      const res = await refer(await as(user), id);
      expect(res.status, user).toBe(403);
    }
    expect(
      await h.db.query('SELECT 1 FROM media_referrals WHERE application_id = $1', [id]),
    ).toMatchObject({ rowCount: 0 });
  });

  it('is sent once while it waits or after its acceptance', async () => {
    const id = await application();
    const referralId = await referred(id);
    const again = await refer(await as(world.users.pm), id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('media.referral_open');
    expect(
      (await decide(await as(media.director), referralId, { decision: 'accept' })).status,
    ).toBe(200);
    expect((await refer(await as(world.users.rpmDhaka), id)).status).toBe(409);
  });

  it('asks for a priority and a note, and takes no other field', async () => {
    const id = await application();
    const rpm = await as(world.users.rpmDhaka);
    expect((await refer(rpm, id, { priority: 'high' })).status).toBe(422);
    expect((await refer(rpm, id, { priority: 'urgent', note: 'নোট' })).status).toBe(422);
    expect((await refer(rpm, id, { ...REFERRAL, consent: true })).status).toBe(422);
  });
});

describe('a decision on a referral', () => {
  it('accepts it: the work starts at "accepted" under the application’s number, audited, in the history, and the referrer is told', async () => {
    const id = await application();
    const referralId = await referred(id);
    const before = await workflowOf(id);
    const res = await decide(await as(media.director), referralId, { decision: 'accept' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const appNo = (
      await h.db.query<{ app_no: string }>('SELECT app_no FROM applications WHERE id = $1', [id])
    ).rows[0]!.app_no;
    expect(res.body.data).toMatchObject({
      state: 'accepted',
      decidedBy: { id: media.director },
      decisionComment: null,
      work: { title: appNo, stageCode: 'accepted' },
      mayDecide: false,
    });
    expect(res.body.data.history.map((e: { kind: string }) => e.kind)).toEqual([
      'referred',
      'accepted',
    ]);
    expect(await auditActions(referralId)).toEqual([
      'media.referral_created',
      'media.referral_decided',
    ]);
    expect(await workflowOf(id)).toEqual(before);
    const told = (await notificationsOf(h.db, 'media_referral_decided', world.users.rpmDhaka)).find(
      (n) => n.params.referralId === referralId,
    );
    expect(told?.params).toMatchObject({
      referralId,
      result: { bn: 'গ্রহণ করা হয়েছে', en: 'accepted' },
    });
  });

  it('sends it back with a comment, and the referrer corrects it and sends it again', async () => {
    const id = await application();
    const referralId = await referred(id);
    const assistant = await as(media.assistant);
    expect((await decide(assistant, referralId, { decision: 'send_back' })).status).toBe(422);
    const back = await decide(assistant, referralId, {
      decision: 'send_back',
      comment: 'পরিবারের ছবি তোলার সুযোগ আছে কি না লিখুন',
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.data).toMatchObject({ state: 'sent_back', work: null });
    const record = await read(await as(world.users.rpmDhaka), id);
    expect(record.body.data).toMatchObject({
      media: { state: 'sent_back', decisionComment: 'পরিবারের ছবি তোলার সুযোগ আছে কি না লিখুন' },
      mayReferToMedia: true,
    });
    const again = await refer(await as(world.users.rpmDhaka), id, {
      priority: 'normal',
      note: 'ছবি তোলা যাবে',
    });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.data).toMatchObject({
      id: referralId,
      state: 'pending',
      priority: 'normal',
      story: null,
      decidedBy: null,
      decisionComment: null,
    });
    expect(again.body.data.history.map((e: { kind: string }) => e.kind)).toEqual([
      'referred',
      'sent_back',
      'resent',
    ]);
    expect(await auditActions(referralId)).toEqual([
      'media.referral_created',
      'media.referral_decided',
      'media.referral_resent',
    ]);
  });

  it('rejects it with a reason, and the record still shows the application’s own state', async () => {
    const id = await application();
    const referralId = await referred(id);
    const before = await workflowOf(id);
    const director = await as(media.director);
    expect((await decide(director, referralId, { decision: 'reject' })).status).toBe(422);
    const res = await decide(director, referralId, { decision: 'reject', comment: 'অনুমতি নেই' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ state: 'rejected', decisionComment: 'অনুমতি নেই' });
    expect(await workflowOf(id)).toEqual(before);
    const second = await decide(director, referralId, { decision: 'accept' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('media.referral_not_pending');
  });

  it('is refused to a Media Team member, a referrer and the Finance Team', async () => {
    const id = await application();
    const referralId = await referred(id);
    for (const user of [media.member, world.users.rpmDhaka, world.users.pm, media.finance]) {
      const res = await decide(await as(user), referralId, { decision: 'accept' });
      expect(res.status, user).toBe(403);
    }
    expect(
      (await decide(await as(media.director), randomUUID(), { decision: 'accept' })).status,
    ).toBe(404);
  });
});

describe('reading a referral', () => {
  it('shows the person’s allowed details and the official’s comment, never the identity numbers or scores', async () => {
    const id = await application();
    const field = await h.db.query<{ id: string }>(
      `SELECT f.id FROM form_fields f JOIN applications a ON a.form_version_id = f.form_version_id
        WHERE a.id = $1 AND f.field_key = 'official_comment'`,
      [id],
    );
    await h.db.query(
      `INSERT INTO application_answers (id, application_id, field_id, value) VALUES ($1, $2, $3, $4)`,
      [
        randomUUID(),
        id,
        field.rows[0]!.id,
        JSON.stringify({ t: 'long_text', v: 'পরিশ্রমী মানুষ' }),
      ],
    );
    const referralId = await referred(id);
    const res = await at(await as(media.director), 'get', `/media-referrals/${referralId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const data = res.body.data;
    expect(data.officialComment).toBe('পরিশ্রমী মানুষ');
    expect(data.beneficiary).toMatchObject({
      name: expect.any(String),
      fatherOrHusbandName: expect.any(String),
      mobile: expect.any(String),
      occupation: { bn: 'দিনমজুর', en: 'Day labourer' },
      address: expect.objectContaining({ divisionId: world.dhaka.division }),
    });
    const nid = await h.db.query<{ nid: string }>(
      'SELECT b.nid FROM beneficiaries b JOIN applications a ON a.beneficiary_id = b.id WHERE a.id = $1',
      [id],
    );
    const text = JSON.stringify(data);
    expect(text).not.toContain(nid.rows[0]!.nid);
    expect(text).not.toMatch(/"(nid|birthReg|score|scoreItems|rating|category)"/);
  });

  it('is open to the directors and the referrers of the region or program, and 404 for everyone else', async () => {
    const id = await application();
    const referralId = await referred(id);
    for (const user of [media.director, media.assistant, world.users.rpmDhaka, world.users.pm]) {
      const res = await at(await as(user), 'get', `/media-referrals/${referralId}`);
      expect(res.status, user).toBe(200);
    }
    // a member reaches only the works they are on; this referral has no work yet
    for (const user of [media.member, world.users.rpmRangpur, media.otherPm]) {
      const res = await at(await as(user), 'get', `/media-referrals/${referralId}`);
      expect(res.status, user).toBe(404);
    }
    for (const user of [world.users.general, media.finance]) {
      const res = await at(await as(user), 'get', `/media-referrals/${referralId}`);
      expect(res.status, user).toBe(403);
    }
  });

  it('lists the waiting referrals for the directors, and the decided ones by state', async () => {
    const id = await application();
    const referralId = await referred(id);
    const director = await as(media.director);
    const waiting = await at(director, 'get', '/media-referrals?limit=100');
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200);
    expect(waiting.body.data.map((r: { id: string }) => r.id)).toContain(referralId);
    expect(waiting.body.data.every((r: { state: string }) => r.state === 'pending')).toBe(true);
    await decide(director, referralId, { decision: 'accept' });
    const accepted = await at(director, 'get', '/media-referrals?state=accepted&limit=100');
    expect(accepted.body.data.map((r: { id: string }) => r.id)).toContain(referralId);
    expect((await at(director, 'get', '/media-referrals?state=lost')).status).toBe(422);
    for (const user of [media.member, world.users.rpmDhaka, media.finance]) {
      const res = await at(await as(user), 'get', '/media-referrals');
      expect(res.status, user).toBe(403);
    }
  });
});

describe('the Media Team and the applications', () => {
  it('opens no application, referred or not', async () => {
    const id = await application();
    await referred(id);
    for (const user of [media.member, media.director, media.assistant]) {
      const s = await as(user);
      expect((await read(s, id)).status, user).toBe(403);
      expect((await at(s, 'get', `/projects/${project}/applications`)).status, user).toBe(403);
    }
  });
});
