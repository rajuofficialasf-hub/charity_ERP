import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import type { QuestionColumn } from '../../src/exports/questions';
import { accessWorld } from './support/access-fixtures';
import { applicationRow, IDENTITY_ANSWERS } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';
import { publishedReadyForm, question } from './support/forms';

// The form questions of a project's application list as export columns: one per question key
// across every version, under the newest version's words, filled from each application's own
// version, the official ones only for an export that carries them.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const questions = () => h.container.exportQuestions;

let projectId: string;
let v1: string;
let v2: string;
let oldApp: string;
let newApp: string;

const FAMILY = [
  question('q_income', 'number', { label: { bn: 'আয়', en: 'Income' } }),
  question('members', 'repeat_group'),
  question('m_name', 'short_text', { settings: { repeat: { group: 'members' } } }),
];

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const builder: Session = await login(h, accounts.get(world.users.monitoring)!);
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  const made = await api()
    .post('/api/v1/projects')
    .set(bearer(await login(h, accounts.get(world.users.pm)!)))
    .send({
      programId: world.a1.program,
      code: 'EXQ',
      year: 2026,
      name: { bn: 'এক্সপোর্ট', en: 'Export' },
      source: { kind: 'workflow', workflowKey: 'distribution' },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  projectId = made.body.data.id as string;
  // the project's form is placed from a ready form; its version 2 is made on the ready form and
  // taken onto the project, as an office does
  const readyId = await publishedReadyForm(h, builder, 'beneficiary_application', {
    fields: FAMILY,
  });
  const placed = await api()
    .post(`/api/v1/projects/${projectId}/forms/place`)
    .set(bearer(builder))
    .send({ readyFormId: readyId, key: 'default' });
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  const placedFormId = placed.body.data.id as string;
  v1 = placed.body.data.publishedVersionId as string;
  // version 2: the income question renamed, a new question added
  const draft = await api().post(`/api/v1/forms/${readyId}/versions`).set(bearer(builder));
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const readyV2 = draft.body.data.id as string;
  const read = await api().get(`/api/v1/form-versions/${readyV2}`).set(bearer(builder));
  const sections = (read.body.data.sections as Record<string, unknown>[]).map((s) =>
    s.key === 'section_1'
      ? {
          ...s,
          fields: [
            ...(s.fields as Record<string, unknown>[]).map((fl) =>
              fl.fieldKey === 'q_income'
                ? { ...fl, label: { bn: 'মাসিক আয়', en: 'Monthly income' } }
                : fl,
            ),
            question('q_new', 'short_text', { label: { bn: 'নতুন প্রশ্ন', en: 'New question' } }),
          ],
        }
      : s,
  );
  const saved = await api()
    .patch(`/api/v1/form-versions/${readyV2}`)
    .set(bearer(builder))
    .set('If-Match', read.headers.etag as string)
    .send({ sections });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const published = await api()
    .post(`/api/v1/form-versions/${readyV2}/publish`)
    .set(bearer(builder))
    .set('If-Match', saved.headers.etag as string);
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  const taken = await api().post(`/api/v1/forms/${placedFormId}/take-version`).set(bearer(builder));
  expect(taken.status, JSON.stringify(taken.body)).toBe(200);
  const latest = await h.db.query<{ id: string }>(
    `SELECT id FROM form_versions WHERE form_id = $1 AND status = 'published'
      ORDER BY version_no DESC LIMIT 1`,
    [placedFormId],
  );
  v2 = latest.rows[0]!.id;
  expect(v2).not.toBe(v1);

  const identity = () => IDENTITY_ANSWERS(f.fakeNid(), f.fakeMobile(), world.dhaka);
  oldApp = await applicationRow(h.db, {
    projectId,
    versionId: v1,
    loc: world.dhaka,
    status: 'submitted',
    answers: {
      ...identity(),
      q_income: { t: 'number', v: 5000 },
      m_name: { t: 'short_text', v: 'করিম' },
      q_official: { t: 'short_text', v: 'অফিসের মন্তব্য' },
    },
  });
  // a second family member of the old application
  const member = await h.db.query<{ id: string }>(
    `SELECT id FROM form_fields WHERE form_version_id = $1 AND field_key = 'm_name'`,
    [v1],
  );
  await h.db.query(
    `INSERT INTO application_answers (id, application_id, field_id, repeat_index, value)
     VALUES ($1, $2, $3, 1, $4)`,
    [randomUUID(), oldApp, member.rows[0]!.id, JSON.stringify({ t: 'short_text', v: 'রহিমা' })],
  );
  newApp = await applicationRow(h.db, {
    projectId,
    versionId: v2,
    loc: world.dhaka,
    status: 'submitted',
    answers: {
      ...identity(),
      q_income: { t: 'number', v: 7000 },
      q_new: { t: 'short_text', v: 'হ্যাঁ' },
    },
  });
});
afterAll(async () => h.close());

const byKey = (columns: QuestionColumn[]) => new Map(columns.map((c) => [c.fieldKey, c]));

describe('the form questions of an application export', () => {
  it('list each question once across the versions, under the newest version’s words', async () => {
    const columns = await questions().catalogue(projectId, true);
    const keys = columns.map((c) => c.fieldKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining(['q_name', 'q_income', 'q_new', 'm_name', 'q_official']),
    );
    expect(byKey(columns).get('q_income')?.label).toEqual({
      bn: 'মাসিক আয়',
      en: 'Monthly income',
    });
    // the repeat group itself holds no value of its own, and photos never leave in an export
    expect(keys).not.toContain('members');
    expect(keys).not.toContain('q_photo');
    // the fixture's q_note is a long text, an answer like any other
    expect(keys).toContain('q_note');
    expect(byKey(columns).get('m_name')?.group).toBe('members');
  });

  it('leave the official questions out of an export that does not carry them', async () => {
    const columns = await questions().catalogue(projectId, false);
    expect(columns.map((c) => c.fieldKey)).not.toContain('q_official');
    expect(columns.map((c) => c.fieldKey)).toContain('q_income');
  });

  it('fill each application from its own version, empty where its version had no such question', async () => {
    const columns = await questions().catalogue(projectId, true);
    const values = await questions().values(
      [oldApp, newApp],
      columns,
      'bn',
      new Set([oldApp, newApp]),
    );
    expect(values.get(oldApp)?.cells['q:q_income']).toBe(5000);
    expect(values.get(oldApp)?.cells['q:q_new'] ?? null).toBeNull();
    expect(values.get(newApp)?.cells['q:q_income']).toBe(7000);
    expect(values.get(newApp)?.cells['q:q_new']).toBe('হ্যাঁ');
    expect(values.get(oldApp)?.cells['q:q_official']).toBe('অফিসের মন্তব্য');
  });

  it('give a repeat group one row per member with the application, and join them in one cell', async () => {
    const columns = await questions().catalogue(projectId, true);
    const values = await questions().values([oldApp], columns, 'bn', new Set([oldApp]));
    const repeats = values.get(oldApp)?.repeats ?? [];
    expect(repeats.map((r) => [r.group, r.index, r.cells['q:m_name']])).toEqual([
      ['members', 0, 'করিম'],
      ['members', 1, 'রহিমা'],
    ]);
    expect(values.get(oldApp)?.cells['q:m_name']).toBe('করিম; রহিমা');
  });

  it('drop the official answers of a row outside the export’s reach of the official section', async () => {
    const columns = await questions().catalogue(projectId, true);
    const values = await questions().values([oldApp], columns, 'bn', new Set());
    expect(values.get(oldApp)?.cells).not.toHaveProperty('q:q_official');
    expect(values.get(oldApp)?.cells['q:q_income']).toBe(5000);
  });
});
