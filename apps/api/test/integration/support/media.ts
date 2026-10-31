import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import { SeedContext } from '../../../seed/context';
import { seedReferenceLists } from '../../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../../seed/sets/base/workflows';
import { accessWorld } from './access-fixtures';
import { applicationProject, IDENTITY_ANSWERS } from './applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './auth-app';
import { question } from './forms';
import { fakeMobile, fakeNid } from './fixtures';

/**
 * The world of the Media Team tests: the access fixtures' people with a PM of another program, the
 * two directors, a member and the Finance Team; a distribution project of the program with the
 * Dhaka and Rangpur RPMs, its executive and a volunteer of Dhaka; a form that asks the occupation
 * and carries the official's comment.
 */
export async function mediaWorld() {
  const h: AuthHarness = await authHarness();
  const accounts = new Map<string, Account>();
  // one session per person: a login per call would end the oldest of a person's devices
  const sessions = new Map<string, Promise<Session>>();
  const as = (userId: string) => {
    if (!sessions.has(userId)) sessions.set(userId, login(h, accounts.get(userId)!));
    return sessions.get(userId)!;
  };
  const api = () => request(h.server());
  const at = (s: Session, method: 'get' | 'post' | 'put' | 'patch', path: string) =>
    api()[method](`/api/v1${path}`).set(bearer(s));
  const media = { director: '', assistant: '', member: '', finance: '', otherPm: '' };
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  const world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
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
  const project = made.body.data.id as string;
  const { versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
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
  });
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
  return { h, world, accounts, as, at, media, project, versionId };
}
export type MediaWorld = Awaited<ReturnType<typeof mediaWorld>>;

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));

/** Moves an application by a workflow action, with the record's own version. */
export async function act(
  m: MediaWorld,
  s: Session,
  id: string,
  action: string,
  body: Record<string, unknown> = {},
) {
  const before = await m.at(s, 'get', `/applications/${id}`);
  const res = await m
    .at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', before.headers.etag as string)
    .send(body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
}

/** A volunteer's application of the Dhaka region, moved as far as `until`; answers its id. */
export async function mediaApplication(
  m: MediaWorld,
  until: 'submitted' | 'approved' = 'approved',
): Promise<string> {
  const s = await m.as(m.world.users.general);
  const made = await m.at(s, 'post', `/projects/${m.project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: m.project,
    formVersionId: m.versionId,
    answers: toAnswers({
      ...IDENTITY_ANSWERS(fakeNid(), fakeMobile(), m.world.dhaka),
      q_occupation: { t: 'single_select', v: 'day_labourer' },
    }),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.data.id as string;
  await act(m, s, id, 'submit');
  if (until === 'submitted') return id;
  const rpm = await m.as(m.world.users.rpmDhaka);
  await act(m, rpm, id, 'review');
  await act(m, rpm, id, 'send_for_approval');
  await act(m, rpm, id, 'approve');
  return id;
}

export const REFERRAL = {
  priority: 'high',
  note: 'ভালো গল্প হতে পারে',
  story: 'তিনি একাই সংসার চালান',
};

/** An approved application referred by the Dhaka RPM; answers the referral's id. */
export async function mediaReferral(m: MediaWorld, applicationId: string, by?: string) {
  const res = await m
    .at(
      await m.as(by ?? m.world.users.rpmDhaka),
      'post',
      `/applications/${applicationId}/media-referral`,
    )
    .send(REFERRAL);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

/** A new application referred and accepted by the Media Director; answers the ids. */
export async function mediaWork(m: MediaWorld) {
  const applicationId = await mediaApplication(m);
  const referralId = await mediaReferral(m, applicationId);
  const res = await m
    .at(await m.as(m.media.director), 'post', `/media-referrals/${referralId}/decision`)
    .send({ decision: 'accept' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { applicationId, referralId, workId: res.body.data.work.id as string };
}

/** The work's version as the director reads it, for If-Match. */
export async function workVersion(m: MediaWorld, referralId: string): Promise<string> {
  const res = await m.at(await m.as(m.media.director), 'get', `/media-referrals/${referralId}`);
  return res.body.data.work.version as string;
}

/**
 * A work run to the end by the API: the members with their roles, the director's moves to ready to
 * publish, the final review and a YouTube publication; answers the ids.
 */
export async function publishedWork(m: MediaWorld, members: { userId: string; roles: string[] }[]) {
  const ids = await mediaWork(m);
  const director = await m.as(m.media.director);
  const ok = (res: { status: number; body: unknown }, what: string) =>
    expect(res.status, `${what}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
  ok(
    await m
      .at(director, 'put', `/media-works/${ids.workId}/members`)
      .set('If-Match', await workVersion(m, ids.referralId))
      .send({ members }),
    'members',
  );
  for (const stageCode of ['editing', 'ready_to_publish'])
    ok(
      await m
        .at(director, 'patch', `/media-works/${ids.workId}`)
        .set('If-Match', await workVersion(m, ids.referralId))
        .send({ stageCode }),
      stageCode,
    );
  ok(
    await m
      .at(director, 'post', `/media-works/${ids.workId}/final-review`)
      .set('If-Match', await workVersion(m, ids.referralId))
      .send({ decision: 'approve' }),
    'review',
  );
  ok(
    await m.at(director, 'post', `/media-works/${ids.workId}/publications`).send({
      platformCode: 'asf_youtube',
      state: 'published',
      link: 'https://youtu.be/dQw4w9WgXcQ',
      publishedOn: '2026-10-27',
    }),
    'publication',
  );
  return ids;
}
