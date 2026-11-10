import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { isoDateInDhaka } from '@css/shared/format';
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
import { fakeMobile, fakeNid } from './support/fixtures';
import { question } from './support/forms';

// The form logic through the real app: a read-only question takes its default (and keeps the date
// it was first given), a calculated answer is the server's, a group that follows a count holds
// that many rows at submission, the public link keeps the same rules, and a read-only answer
// never opens for correction.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let formId: string;

const LOGIC = {
  fields: [
    question('q_prefix', 'short_text', {
      settings: { default: { text: 'ASF-CBSRP-' }, read_only: true },
    }),
    question('q_entry', 'date', { settings: { default: { today: true }, read_only: true } }),
    question('q_count', 'number', { settings: { validation: { min: 0, max: 10 } } }),
    question('members', 'repeat_group', { settings: { repeat: { count_from: 'q_count' } } }),
    question('m_name', 'short_text', {
      required: true,
      settings: { repeat: { group: 'members' } },
    }),
    question('m_income', 'money', { settings: { repeat: { group: 'members' } } }),
    question('q_earners', 'calculation', {
      calculation: {
        expr: {
          count_rows: { group: 'members', where: { field: 'm_income', op: 'gt', value: 0 } },
        },
      },
    }),
  ],
};

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const member = (row: number, income?: string) => [
  { fieldKey: 'm_name', repeatIndex: row, value: { t: 'short_text', v: `সদস্য ${row}` } },
  ...(income ? [{ fieldKey: 'm_income', repeatIndex: row, value: { t: 'money', v: income } }] : []),
];
const body = (extra: unknown[]) => [
  ...toAnswers(IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka)),
  ...extra,
];
const stored = async (id: string, fieldKey: string) =>
  (
    await h.db.query<{ value: unknown }>(
      `SELECT a.value FROM application_answers a JOIN form_fields f ON f.id = a.field_id
        WHERE a.application_id = $1 AND f.field_key = $2 AND a.repeat_index = 0`,
      [id, fieldKey],
    )
  ).rows[0]?.value;
async function draft(s: Session, answers: unknown[]) {
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.data.id as string;
}
const act = async (
  s: Session,
  id: string,
  action: string,
  payload: Record<string, unknown> = {},
) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', read.headers.etag as string)
    .send(payload);
};
const edit = async (s: Session, id: string, answers: unknown[]) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'patch', `/applications/${id}`)
    .set('If-Match', read.headers.etag as string)
    .send({ answers });
};

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
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'LOG',
    year: 2026,
    name: { bn: 'ফর্মের লজিক', en: 'Form logic' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId, formId } = await applicationProject(h, await as(world.users.monitoring), project, {
    form: LOGIC,
  }));
  const volunteer = (
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
    [randomUUID(), project, volunteer, world.dhaka.division, world.users.rpmDhaka],
  );
});
afterAll(async () => h.close());

describe('the form logic through the application', () => {
  it('stores the read-only defaults and the server’s calculation, whatever the volunteer sent', async () => {
    const s = await as(world.users.general);
    const id = await draft(
      s,
      body([
        { fieldKey: 'q_prefix', value: { t: 'short_text', v: 'changed' } },
        { fieldKey: 'q_entry', value: { t: 'date', v: '2000-01-01' } },
        { fieldKey: 'q_count', value: { t: 'number', v: 2 } },
        ...member(0, '3000.00'),
        ...member(1),
        { fieldKey: 'q_earners', value: { t: 'calculation', v: 99 } },
      ]),
    );
    expect(await stored(id, 'q_prefix')).toEqual({ t: 'short_text', v: 'ASF-CBSRP-' });
    expect(await stored(id, 'q_entry')).toEqual({ t: 'date', v: isoDateInDhaka(h.clock.now()) });
    expect(await stored(id, 'q_earners')).toEqual({ t: 'calculation', v: 1 });
  });

  it('keeps the date a read-only answer was first given on a later edit', async () => {
    const s = await as(world.users.general);
    const id = await draft(s, body([{ fieldKey: 'q_count', value: { t: 'number', v: 0 } }]));
    await h.db.query(
      `UPDATE application_answers SET value = '{"t":"date","v":"2026-01-02"}'
        WHERE application_id = $1
          AND field_id = (SELECT f.id FROM form_fields f JOIN application_answers a ON a.field_id = f.id
                          WHERE a.application_id = $1 AND f.field_key = 'q_entry')`,
      [id],
    );
    const read = await at(s, 'get', `/applications/${id}`);
    const answers = (read.body.data.answers as { fieldKey: string }[]).filter(
      (a) => a.fieldKey !== 'q_entry',
    );
    const saved = await edit(s, id, answers);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await stored(id, 'q_entry')).toEqual({ t: 'date', v: '2026-01-02' });
  });

  it('lets a draft hold fewer rows than the count, asks each row at submission, and refuses rows beyond it', async () => {
    const s = await as(world.users.general);
    const id = await draft(
      s,
      body([{ fieldKey: 'q_count', value: { t: 'number', v: 3 } }, ...member(0), ...member(1)]),
    );
    // the third member is still a row, whose name is required
    const refused = await act(s, id, 'submit');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('workflow.guard.mandatory_fields_present');
    const full = await edit(s, id, [
      ...body([{ fieldKey: 'q_count', value: { t: 'number', v: 3 } }]),
      ...member(0),
      ...member(1),
      ...member(2),
    ]);
    expect(full.status, JSON.stringify(full.body)).toBe(200);
    expect((await act(s, id, 'submit')).status).toBe(200);
    // under review the office edits it: a fourth row beyond the count of three is refused,
    // naming the group
    const rpm = await as(world.users.rpmDhaka);
    expect((await act(rpm, id, 'review')).status).toBe(200);
    const over = await edit(rpm, id, [
      ...body([{ fieldKey: 'q_count', value: { t: 'number', v: 3 } }]),
      ...member(0),
      ...member(1),
      ...member(2),
      ...member(3),
    ]);
    expect(over.status).toBe(422);
    expect(over.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'members', code: 'validation.repeat_rows_mismatch' }),
    );
  });

  it('keeps the same rules on the public link', async () => {
    const pm = await as(world.users.pm);
    const link = await at(pm, 'patch', `/projects/${project}/public-link`).send({
      enabled: true,
      formId,
    });
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const token = new URL(link.body.data.url as string).pathname.split('/').pop()!;
    const sent = await api()
      .post(`/api/v1/public/forms/${token}/applications`)
      .send({
        clientUuid: randomUUID(),
        answers: body([
          { fieldKey: 'q_prefix', value: { t: 'short_text', v: 'mine' } },
          { fieldKey: 'q_count', value: { t: 'number', v: 1 } },
          ...member(0, '500.00'),
          ...member(1),
        ]),
      });
    expect(sent.status).toBe(422);
    expect(sent.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'members', code: 'validation.repeat_rows_mismatch' }),
    );
  });

  it('never opens a read-only answer for correction', async () => {
    const s = await as(world.users.general);
    const id = await draft(
      s,
      body([{ fieldKey: 'q_count', value: { t: 'number', v: 1 } }, ...member(0, '100.00')]),
    );
    expect((await act(s, id, 'submit')).status).toBe(200);
    const rpm = await as(world.users.rpmDhaka);
    for (const step of ['review', 'send_for_approval', 'approve'])
      expect((await act(rpm, id, step)).status, step).toBe(200);
    const opened = await at(rpm, 'post', `/applications/${id}/unlocks`).send({
      fieldKey: 'q_prefix',
      reason: 'ভুল নম্বর',
    });
    expect(opened.status).toBe(422);
    expect(opened.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.unlock_type' }),
    ]);
  });

  it('keeps another volunteer out of the application', async () => {
    const id = await draft(
      await as(world.users.general),
      body([{ fieldKey: 'q_count', value: { t: 'number', v: 0 } }]),
    );
    const other = await as(world.users.rangpurVolunteer);
    expect((await at(other, 'get', `/applications/${id}`)).status).toBe(404);
  });
});
