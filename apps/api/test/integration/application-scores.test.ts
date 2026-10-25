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
import { beneficiary, fakeMobile, fakeNid, insert } from './support/fixtures';
import { option, question } from './support/forms';

// The priority score on the application: computed when it reaches the office and on every
// answer change until the decision, frozen at the decision, sorting the office's list, and never
// shown to a volunteer. "Not previously assisted" reads the person's approvals in the program.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let generalVolunteer: string;

/** The scored questions: a kind worth up to 20 and a family size worth up to 20, plus 20 for "not previously assisted". */
const SCORED = {
  fields: [
    question('q_kind', 'radio', {
      options: [option('widow'), option('elderly'), option('other')],
      settings: { score: { options: { widow: 20, elderly: 15 } } },
    }),
    question('q_members', 'number', {
      settings: {
        score: {
          ranges: [
            { min: 6, points: 20 },
            { min: 4, points: 10 },
          ],
        },
      },
    }),
  ],
  scoring: { not_previously_assisted: 20 },
};

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const answers = (kind: string, members: number, nid = fakeNid()) =>
  toAnswers({
    ...IDENTITY_ANSWERS(nid, fakeMobile(), world.dhaka),
    q_kind: { t: 'radio', v: kind },
    q_members: { t: 'number', v: members },
  });
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const read = await at(s, 'get', `/applications/${id}`);
  const res = await at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', read.headers.etag as string)
    .send(body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
  return res;
};
/** A volunteer's application sent to the office; answers its id. */
async function sent(kind: string, members: number, nid?: string): Promise<string> {
  const s = await as(world.users.general);
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers: answers(kind, members, nid),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  await act(s, made.body.data.id as string, 'submit');
  return made.body.data.id as string;
}
const scoreRow = async (id: string) =>
  (
    await h.db.query<{ total_score: string | null; snapshot_at: Date | null; criteria: unknown }>(
      `SELECT a.total_score, s.snapshot_at, s.criteria FROM applications a
       LEFT JOIN application_scores s ON s.application_id = a.id WHERE a.id = $1`,
      [id],
    )
  ).rows[0]!;

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
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'SCO',
    year: 2026,
    name: { bn: 'স্কোর', en: 'Scores' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    form: SCORED,
  }));
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

describe('the score of an application', () => {
  it('keeps the form-level points with the placed version', async () => {
    const read = await at(await as(world.users.rpmDhaka), 'get', `/form-versions/${versionId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data.scoring).toEqual({ not_previously_assisted: 20 });
  });

  it('is computed at submission, follows an edit under review and freezes at the approval', async () => {
    const id = await sent('widow', 7);
    const rpm = await as(world.users.rpmDhaka);
    const first = await at(rpm, 'get', `/applications/${id}`);
    expect(first.body.data.totalScore).toBe(60);
    expect(first.body.data.scoreItems).toEqual([
      expect.objectContaining({ key: 'q_kind', input: 'widow', max_points: 20, points: 20 }),
      expect.objectContaining({ key: 'q_members', input: 7, max_points: 20, points: 20 }),
      { key: 'not_previously_assisted', input: true, max_points: 20, points: 20 },
    ]);
    await act(rpm, id, 'review');
    const read = await at(rpm, 'get', `/applications/${id}`);
    const edited = await at(rpm, 'patch', `/applications/${id}`)
      .set('If-Match', read.headers.etag as string)
      .send({
        answers: read.body.data.answers.map((a: { fieldKey: string; value: unknown }) =>
          a.fieldKey === 'q_kind' ? { ...a, value: { t: 'radio', v: 'elderly' } } : a,
        ),
      });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data.totalScore).toBe(55);
    await act(rpm, id, 'send_for_approval');
    await act(rpm, id, 'approve');
    const frozen = await scoreRow(id);
    expect(frozen.total_score).toBe('55.00');
    expect(frozen.snapshot_at).not.toBeNull();
    // a later computation leaves a decided score alone
    await h.container.scoring.compute(h.container.prisma, id, world.users.rpmDhaka);
    expect((await scoreRow(id)).total_score).toBe('55.00');
  });

  it('drops "not previously assisted" after an approval in the same program, and keeps it after one in another', async () => {
    const samePerson = fakeNid();
    const known = await beneficiary(h.db, world.dhaka, { nid: samePerson });
    const earlier = await insert(h.db, 'projects', {
      id: randomUUID(),
      program_id: world.a1.program,
      code: 'SCP',
      year: 2025,
      name_bn: 'আগের',
      name_en: 'Earlier',
      workflow_definition_id: (
        await h.db.query<{ workflow_definition_id: string }>(
          'SELECT workflow_definition_id FROM projects WHERE id = $1',
          [project],
        )
      ).rows[0]!.workflow_definition_id,
      workflow_version: 1,
    });
    await insert(h.db, 'applications', {
      id: randomUUID(),
      project_id: earlier,
      form_version_id: versionId,
      beneficiary_id: known,
      status: 'completed',
      approved_at: new Date('2025-12-01'),
      region_location_id: world.dhaka.division,
      district_id: world.dhaka.district,
      union_id: world.dhaka.union,
    });
    const id = await sent('widow', 7, samePerson);
    const read = await at(await as(world.users.rpmDhaka), 'get', `/applications/${id}`);
    expect(read.body.data.totalScore).toBe(40);
    expect(read.body.data.scoreItems.at(-1)).toMatchObject({ input: false, points: 0 });

    const other = await beneficiary(h.db, world.dhaka, { nid: fakeNid() });
    const otherNid = (
      await h.db.query<{ nid: string }>('SELECT nid FROM beneficiaries WHERE id = $1', [other])
    ).rows[0]!.nid;
    const elsewhere = (
      await h.db.query<{ id: string }>('SELECT id FROM projects WHERE program_id <> $1 LIMIT 1', [
        world.a1.program,
      ])
    ).rows[0]!.id;
    await insert(h.db, 'applications', {
      id: randomUUID(),
      project_id: elsewhere,
      form_version_id: versionId,
      beneficiary_id: other,
      status: 'completed',
      approved_at: new Date('2025-12-01'),
      region_location_id: world.dhaka.division,
      district_id: world.dhaka.district,
      union_id: world.dhaka.union,
    });
    const kept = await sent('widow', 7, otherNid);
    expect(
      (await at(await as(world.users.rpmDhaka), 'get', `/applications/${kept}`)).body.data
        .totalScore,
    ).toBe(60);
  });

  it('sorts the office list highest first and pages by cursor, unscored last', async () => {
    // sent in an order neither by score nor by its reverse, so arrival order cannot pass
    const mid = await sent('elderly', 5);
    const high = await sent('widow', 6);
    const low = await sent('other', 2);
    const rpm = await as(world.users.rpmDhaka);
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await at(
        rpm,
        'get',
        `/projects/${project}/applications?sort=-score&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      ids.push(...res.body.data.map((r: { id: string }) => r.id));
      cursor = res.body.meta.nextCursor as string | null;
    } while (cursor);
    const ours = ids.filter((i) => [low, mid, high].includes(i));
    expect(ours).toEqual([high, mid, low]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is never shown to a volunteer, who cannot sort by it either', async () => {
    const id = await sent('widow', 7);
    const s = await as(world.users.general);
    const record = await at(s, 'get', `/applications/${id}`);
    expect(record.status).toBe(200);
    expect(record.body.data).not.toHaveProperty('totalScore');
    expect(record.body.data).not.toHaveProperty('scoreItems');
    const form = record.body.data.form.sections
      .flatMap((sec: { fields: { fieldKey: string; settings?: unknown }[] }) => sec.fields)
      .find((f: { fieldKey: string }) => f.fieldKey === 'q_kind');
    expect(form.settings).not.toHaveProperty('score');
    const mine = await at(s, 'get', '/me/applications');
    expect(mine.body.data.every((r: object) => !('totalScore' in r))).toBe(true);
    const listed = await at(s, 'get', `/projects/${project}/applications`);
    expect(listed.body.data.every((r: object) => !('totalScore' in r))).toBe(true);
    const sorted = await at(s, 'get', `/projects/${project}/applications?sort=-score`);
    expect(sorted.status).toBe(422);
  });
});
