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
// version; a protected answer only on a row that may carry its class, judged by the question as
// that application's version had it.
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

const OFFICIAL = 'application.official_section';
const NID = 'beneficiary.nid';
const ALL = new Set([OFFICIAL, NID]);
const everything = () => true;
const nothing = () => false;

const worded = (code: string, bn: string, en: string) => ({
  code,
  label: { bn, en },
  dependsOnOptionCode: null,
  allowsOtherText: false,
});

const FAMILY = [
  question('q_income', 'number', { label: { bn: 'আয়', en: 'Income' } }),
  question('members', 'repeat_group'),
  question('m_name', 'short_text', { settings: { repeat: { group: 'members' } } }),
  question('q_needs', 'checkbox', {
    options: [worded('food', 'খাবার', 'Food'), worded('cloth', 'কাপড়', 'Clothes')],
  }),
];

let builderSession: Session;
let readyFormId: string;
let projectFormId: string;

type Sections = Record<string, unknown>[];

/**
 * The next version of the project's form, made the way an office makes it: a draft of the ready
 * form changed by `change`, published, then taken onto the project. Answers the new version's id.
 */
async function nextVersion(change: (sections: Sections) => Sections): Promise<string> {
  const builder = builderSession;
  const draft = await api().post(`/api/v1/forms/${readyFormId}/versions`).set(bearer(builder));
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const draftId = draft.body.data.id as string;
  const read = await api().get(`/api/v1/form-versions/${draftId}`).set(bearer(builder));
  const saved = await api()
    .patch(`/api/v1/form-versions/${draftId}`)
    .set(bearer(builder))
    .set('If-Match', read.headers.etag as string)
    .send({ sections: change(read.body.data.sections as Sections) });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const published = await api()
    .post(`/api/v1/form-versions/${draftId}/publish`)
    .set(bearer(builder))
    .set('If-Match', saved.headers.etag as string);
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  const taken = await api()
    .post(`/api/v1/forms/${projectFormId}/take-version`)
    .set(bearer(builder));
  expect(taken.status, JSON.stringify(taken.body)).toBe(200);
  const latest = await h.db.query<{ id: string }>(
    `SELECT id FROM form_versions WHERE form_id = $1 AND status = 'published'
      ORDER BY version_no DESC LIMIT 1`,
    [projectFormId],
  );
  return latest.rows[0]!.id;
}

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
  builderSession = builder;
  readyFormId = readyId;
  projectFormId = placedFormId;
  // version 2: the income question renamed, a new question added, the note question removed
  v2 = await nextVersion((sections) =>
    sections.map((s) =>
      s.key === 'section_1'
        ? {
            ...s,
            fields: [
              ...(s.fields as Record<string, unknown>[])
                .filter((fl) => fl.fieldKey !== 'q_note')
                .map((fl) =>
                  fl.fieldKey === 'q_income'
                    ? { ...fl, label: { bn: 'মাসিক আয়', en: 'Monthly income' } }
                    : fl,
                ),
              question('q_new', 'short_text', {
                label: { bn: 'নতুন প্রশ্ন', en: 'New question' },
              }),
            ],
          }
        : s,
    ),
  );
  expect(v2).not.toBe(v1);

  const identity = () => IDENTITY_ANSWERS(f.fakeNid(), f.fakeMobile(), world.dhaka);
  oldApp = await applicationRow(h.db, {
    projectId,
    versionId: v1,
    loc: world.dhaka,
    status: 'submitted',
    answers: {
      ...identity(),
      q_note: { t: 'long_text', v: 'পুরনো প্রশ্নের উত্তর' },
      q_income: { t: 'number', v: 5000 },
      m_name: { t: 'short_text', v: 'করিম' },
      q_needs: { t: 'checkbox', v: ['food', 'cloth'] },
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
  it('list each question once, in the newest version’s order and words, the older-only ones after', async () => {
    const columns = await questions().catalogue(projectId, ALL);
    expect(columns.map((c) => c.fieldKey)).toEqual([
      'q_id',
      'q_name',
      'q_father',
      'q_mobile',
      'q_gender',
      'q_address',
      'q_village',
      'q_income',
      'm_name',
      'q_needs',
      'q_new',
      'q_official',
      'q_note',
    ]);
    expect(byKey(columns).get('q_income')?.label).toEqual({
      bn: 'মাসিক আয়',
      en: 'Monthly income',
    });
    // the repeat group itself holds no value of its own, and photos never leave in an export
    expect(byKey(columns).has('members')).toBe(false);
    expect(byKey(columns).has('q_photo')).toBe(false);
    expect(byKey(columns).get('m_name')?.group).toBe('members');
    expect(byKey(columns).get('q_id')?.cls).toBe(NID);
    expect(byKey(columns).get('q_official')?.cls).toBe(OFFICIAL);
  });

  it('leave out the official and identity questions of an export that does not carry them', async () => {
    const columns = (await questions().catalogue(projectId, new Set())).map((c) => c.fieldKey);
    expect(columns).not.toContain('q_official');
    expect(columns).not.toContain('q_id');
    expect(columns).toContain('q_income');
  });

  it('fill each application from its own version, empty where its version had no such question', async () => {
    const columns = await questions().catalogue(projectId, ALL);
    const values = await questions().values([oldApp, newApp], columns, 'bn', everything);
    expect(values.get(oldApp)?.cells['q:q_income']).toBe(5000);
    expect(values.get(oldApp)?.cells['q:q_new'] ?? null).toBeNull();
    expect(values.get(oldApp)?.cells['q:q_note']).toBe('পুরনো প্রশ্নের উত্তর');
    expect(values.get(newApp)?.cells['q:q_income']).toBe(7000);
    expect(values.get(newApp)?.cells['q:q_new']).toBe('হ্যাঁ');
    expect(values.get(newApp)?.cells['q:q_note'] ?? null).toBeNull();
    expect(values.get(oldApp)?.cells['q:q_official']).toBe('অফিসের মন্তব্য');
  });

  it('write a choice as its words and an address as its places, in the file’s language', async () => {
    const columns = await questions().catalogue(projectId, ALL);
    const names = await h.db.query<{ id: string; name_bn: string; name_en: string }>(
      'SELECT id, name_bn, name_en FROM locations WHERE id = ANY($1)',
      [[world.dhaka.union, world.dhaka.upazila, world.dhaka.district]],
    );
    const name = (id: string, locale: 'name_bn' | 'name_en') =>
      names.rows.find((r) => r.id === id)![locale];
    const bn = await questions().values([oldApp], columns, 'bn', everything);
    expect(bn.get(oldApp)?.cells['q:q_needs']).toBe('খাবার, কাপড়');
    expect(bn.get(oldApp)?.cells['q:q_address']).toBe(
      [world.dhaka.union, world.dhaka.upazila, world.dhaka.district]
        .map((id) => name(id, 'name_bn'))
        .join(', '),
    );
    const en = await questions().values([oldApp], columns, 'en', everything);
    expect(en.get(oldApp)?.cells['q:q_needs']).toBe('Food, Clothes');
    expect(en.get(oldApp)?.cells['q:q_address']).toBe(
      [world.dhaka.union, world.dhaka.upazila, world.dhaka.district]
        .map((id) => name(id, 'name_en'))
        .join(', '),
    );
  });

  it('give a repeat group one row per member with the application, and join them in one cell', async () => {
    const columns = await questions().catalogue(projectId, ALL);
    const values = await questions().values([oldApp], columns, 'bn', everything);
    const repeats = values.get(oldApp)?.repeats ?? [];
    expect(repeats.map((r) => [r.group, r.index, r.cells['q:m_name']])).toEqual([
      ['members', 0, 'করিম'],
      ['members', 1, 'রহিমা'],
    ]);
    expect(values.get(oldApp)?.cells['q:m_name']).toBe('করিম; রহিমা');
  });

  it('drop a protected answer on a row that may not carry its class', async () => {
    const columns = await questions().catalogue(projectId, ALL);
    const values = await questions().values([oldApp], columns, 'bn', nothing);
    expect(values.get(oldApp)?.cells).not.toHaveProperty('q:q_official');
    expect(values.get(oldApp)?.cells).not.toHaveProperty('q:q_id');
    expect(values.get(oldApp)?.cells['q:q_income']).toBe(5000);
    // the identity number alone may leave while the official section may not
    const nidOnly = await questions().values([oldApp], columns, 'bn', (_id, cls) => cls === NID);
    expect(nidOnly.get(oldApp)?.cells).toHaveProperty('q:q_id');
    expect(nidOnly.get(oldApp)?.cells).not.toHaveProperty('q:q_official');
  });

  // last: version 3 moves the new question into the official-only section
  it('judge an answer by the section its own version had, when a question turned official', async () => {
    const v3 = await nextVersion((sections) =>
      sections.map((s) => {
        const fields = s.fields as Record<string, unknown>[];
        if (s.key === 'section_1')
          return { ...s, fields: fields.filter((fl) => fl.fieldKey !== 'q_new') };
        if (s.key === 'section_2')
          return {
            ...s,
            fields: [
              ...fields,
              question('q_new', 'short_text', { label: { bn: 'নতুন প্রশ্ন', en: 'New question' } }),
            ],
          };
        return s;
      }),
    );
    const v3App = await applicationRow(h.db, {
      projectId,
      versionId: v3,
      loc: world.dhaka,
      status: 'submitted',
      answers: {
        ...IDENTITY_ANSWERS(f.fakeNid(), f.fakeMobile(), world.dhaka),
        q_new: { t: 'short_text', v: 'অফিসের উত্তর' },
      },
    });
    // an export without the official section offers no column for a question official anywhere
    const plain = (await questions().catalogue(projectId, new Set([NID]))).map((c) => c.fieldKey);
    expect(plain).not.toContain('q_new');
    // given the column, version 3's answer is official and stays out; version 2's is not
    const columns = await questions().catalogue(projectId, ALL);
    const values = await questions().values(
      [newApp, v3App],
      columns,
      'bn',
      (_id, cls) => cls !== OFFICIAL,
    );
    expect(values.get(v3App)?.cells).not.toHaveProperty('q:q_new');
    expect(values.get(newApp)?.cells['q:q_new']).toBe('হ্যাঁ');
  });
});
