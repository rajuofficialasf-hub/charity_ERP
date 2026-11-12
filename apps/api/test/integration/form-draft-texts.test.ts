import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { insert } from './support/fixtures.js';
import { IDENTITY, question, section } from './support/forms.js';

// The texts of a form (docs/BUSINESS_RULES.md, the rule on bilingual configuration texts): a draft
// saves with a text missing in one language or in both, the publish refuses it naming each text,
// and no reader outside the builder is ever given a draft.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
// one sign-in per person: the helpers below read the version tag as the Monitoring Team
const sessions = new Map<string, Promise<Session>>();
const as = (userId: string) => {
  const known = sessions.get(userId) ?? login(h, accounts.get(userId)!);
  sessions.set(userId, known);
  return known;
};
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

const LIBRARY_FORM = '01a16a00-0000-7000-8000-00000000f001';
const LIBRARY_DRAFT = '01a16a00-0000-7000-8000-00000000f002';

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  // no reference list is seeded, so a coded question keeps the options the test gives it
  await seedWorkflows(new SeedContext(h.container.prisma));
});
afterAll(async () => h.close());

let n = 0;
const next = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
async function staff(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return login(h, a);
}
/** A draft project of the PM's program, with no form yet. */
async function draftProject() {
  const res = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: `D${next()}`,
    year: 2026,
    name: { bn: 'নমুনা', en: 'Sample' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}
/** A blank project form as draft 1, made by the Monitoring Team. */
async function blankForm(projectId: string) {
  const res = await at(
    await as(world.users.monitoring),
    'post',
    `/projects/${projectId}/forms`,
  ).send({ key: 'default', title: { bn: 'আবেদন', en: 'Application' }, source: { kind: 'blank' } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { formId: res.body.data.id as string, versionId: res.body.data.draftVersionId as string };
}
async function read(s: Session, versionId: string) {
  const res = await at(s, 'get', `/form-versions/${versionId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { etag: res.headers.etag as string, sections: res.body.data.sections as unknown[] };
}
async function save(s: Session, versionId: string, sections: unknown[], etag?: string) {
  return at(s, 'patch', `/form-versions/${versionId}`)
    .set('If-Match', etag ?? (await read(await as(world.users.monitoring), versionId)).etag)
    .send({ sections });
}
async function publish(s: Session, versionId: string, etag?: string) {
  return at(s, 'post', `/form-versions/${versionId}/publish`).set(
    'If-Match',
    etag ?? (await read(await as(world.users.monitoring), versionId)).etag,
  );
}

const BN = (bn: string) => ({ bn, en: '' });
const EN = (en: string) => ({ bn: '', en });
const both = (bn: string, en: string) => ({ bn, en });
const option = (code: string, label: { bn: string; en: string }) => ({
  code,
  label,
  dependsOnOptionCode: null,
  allowsOtherText: false,
});

/** Questions of every kind of text, each waiting for a language. */
const WAITING = [
  question('q_amount', 'money', {
    label: BN('পরিমাণ'),
    settings: { help: BN('টাকায় লিখুন'), placeholder: EN('e.g. 500') },
  }),
  question('q_kind', 'radio', {
    label: both('', ''),
    options: [option('a', BN('ক')), option('b', EN('B'))],
  }),
  question('q_costs', 'number_table', {
    label: both('খরচ', 'Costs'),
    settings: {
      table: {
        rows: [{ key: 'food', label: BN('খাবার') }],
        cols: [{ key: 'month', label: EN('Month') }],
      },
    },
  }),
  question('q_level', 'calculation', {
    label: both('স্তর', 'Level'),
    settings: { results: [{ code: 'poor', label: BN('দরিদ্র') }] },
    calculation: { expr: { result: 'poor' } },
  }),
];
/** The same questions with every text written in both languages. */
const WRITTEN = [
  question('q_amount', 'money', {
    label: both('পরিমাণ', 'Amount'),
    settings: { help: both('টাকায় লিখুন', 'In taka'), placeholder: both('যেমন 500', 'e.g. 500') },
  }),
  question('q_kind', 'radio', {
    label: both('ধরন', 'Kind'),
    options: [option('a', both('ক', 'A')), option('b', both('খ', 'B'))],
  }),
  question('q_costs', 'number_table', {
    label: both('খরচ', 'Costs'),
    settings: {
      table: {
        rows: [{ key: 'food', label: both('খাবার', 'Food') }],
        cols: [{ key: 'month', label: both('মাস', 'Month') }],
      },
    },
  }),
  question('q_level', 'calculation', {
    label: both('স্তর', 'Level'),
    settings: { results: [{ code: 'poor', label: both('দরিদ্র', 'Poor') }] },
    calculation: { expr: { result: 'poor' } },
  }),
];
const waitingSections = () => [
  section(IDENTITY, 'identity'),
  { ...section(WAITING, 'more'), title: BN('বাড়তি') },
];
const writtenSections = () => [
  section(IDENTITY, 'identity'),
  { ...section(WRITTEN, 'more'), title: both('বাড়তি', 'More') },
];

const missing = (path: string, params: Record<string, string>) => ({
  path,
  code: 'form.label_language',
  params,
});
/** What the publish of the waiting questions names, text by text and language by language. */
const MISSING = [
  missing('more', { section: 'more', text: 'title', language: 'en' }),
  missing('q_amount', { fieldKey: 'q_amount', text: 'label', language: 'en' }),
  missing('q_amount', { fieldKey: 'q_amount', text: 'help', language: 'en' }),
  missing('q_amount', { fieldKey: 'q_amount', text: 'placeholder', language: 'bn' }),
  missing('q_kind', { fieldKey: 'q_kind', text: 'label', language: 'bn' }),
  missing('q_kind', { fieldKey: 'q_kind', text: 'label', language: 'en' }),
  missing('q_kind', { fieldKey: 'q_kind', text: 'option', option: 'a', language: 'en' }),
  missing('q_kind', { fieldKey: 'q_kind', text: 'option', option: 'b', language: 'bn' }),
  missing('q_costs', { fieldKey: 'q_costs', text: 'table_row', row: 'food', language: 'en' }),
  missing('q_costs', { fieldKey: 'q_costs', text: 'table_col', col: 'month', language: 'bn' }),
  missing('q_level', { fieldKey: 'q_level', text: 'result', result: 'poor', language: 'en' }),
];
interface Detail {
  path: string;
  code: string;
  params?: Record<string, string>;
  message: string;
}
/** The details of a refusal without their rendered sentence. */
const named = (details: Detail[]) =>
  details.map(({ path, code, params }) => ({ path, code, params }));

describe('a project form whose texts wait for a language', () => {
  it('saves as a draft and is read back as written, a text of only spaces stored empty', async () => {
    const mt = await as(world.users.monitoring);
    const { versionId } = await blankForm(await draftProject());
    const sections = waitingSections();
    const saved = await save(mt, versionId, sections);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.sections).toEqual(sections);
    expect((await read(mt, versionId)).sections).toEqual(sections);
    const stored = await h.db.query<{ label_bn: string; label_en: string }>(
      `SELECT label_bn, label_en FROM form_fields WHERE form_version_id = $1 AND field_key = 'q_amount'`,
      [versionId],
    );
    expect(stored.rows).toEqual([{ label_bn: 'পরিমাণ', label_en: '' }]);

    const spaced = [
      section(IDENTITY, 'identity'),
      section([question('q_note', 'long_text', { label: both('মন্তব্য', '   ') })], 'more'),
    ];
    const trimmed = await save(mt, versionId, spaced);
    expect(trimmed.status, JSON.stringify(trimmed.body)).toBe(200);
    expect(trimmed.body.data.sections[1].fields[0].label).toEqual(BN('মন্তব্য'));
  });

  it('is refused at the publish with a detail for each missing text, and publishes once every text is written', async () => {
    const mt = await as(world.users.monitoring);
    const { formId, versionId } = await blankForm(await draftProject());
    expect((await save(mt, versionId, waitingSections())).status).toBe(200);
    const refused = await publish(mt, versionId);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('validation.failed');
    const details = refused.body.error.details as Detail[];
    expect(named(details)).toEqual(MISSING);
    expect(new Set(details.map((d) => d.message))).toEqual(
      new Set(['প্রতিটি লেখা বাংলা ও ইংরেজি দুই ভাষাতেই লিখুন।']),
    );
    // nothing was published, and the draft is as it was saved
    expect((await read(mt, versionId)).sections).toEqual(waitingSections());
    const versions = await h.db.query<{ status: string }>(
      'SELECT status FROM form_versions WHERE form_id = $1',
      [formId],
    );
    expect(versions.rows).toEqual([{ status: 'draft' }]);

    expect((await save(mt, versionId, writtenSections())).status).toBe(200);
    const published = await publish(mt, versionId);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body.data).toMatchObject({ status: 'published', versionNo: 1 });
    expect(published.body.data.sections).toEqual(writtenSections());
  });

  it('names a text of only spaces at the publish, and takes a help text empty in both languages as none', async () => {
    const mt = await as(world.users.monitoring);
    const { versionId } = await blankForm(await draftProject());
    const sections = [
      section(
        [
          ...IDENTITY,
          question('q_note', 'long_text', {
            label: both('মন্তব্য', '   '),
            settings: { help: both('', '') },
          }),
        ],
        'identity',
      ),
    ];
    expect((await save(mt, versionId, sections)).status).toBe(200);
    const refused = await publish(mt, versionId);
    expect(refused.status).toBe(422);
    expect(named(refused.body.error.details as Detail[])).toEqual([
      missing('q_note', { fieldKey: 'q_note', text: 'label', language: 'en' }),
    ]);
  });

  it('still refuses broken references, a cycle, a duplicate key, a text that is no pair and one over its length in a draft', async () => {
    const mt = await as(world.users.monitoring);
    const { versionId } = await blankForm(await draftProject());
    const before = await read(mt, versionId);
    const refusedWith = async (fields: unknown[], code: string | null, path: string) => {
      const res = await save(mt, versionId, [section(fields, 'more')], before.etag);
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(named(res.body.error.details as Detail[])).toEqual(
        expect.arrayContaining([expect.objectContaining(code ? { path, code } : { path })]),
      );
    };
    await refusedWith(
      [
        question('q_a', 'short_text', {
          label: BN('ক'),
          logic: { show_if: { field: 'q_gone', op: 'eq', value: 'x' } },
        }),
      ],
      'form.unknown_reference',
      'q_a',
    );
    await refusedWith(
      [
        question('q_a', 'calculation', {
          label: BN('ক'),
          calculation: { expr: { op: 'add', args: [{ field: 'q_a' }, 1] } },
        }),
      ],
      'form.calculation_cycle',
      'q_a',
    );
    await refusedWith(
      [
        question('q_a', 'short_text', { label: BN('ক') }),
        question('q_a', 'short_text', { label: BN('খ') }),
      ],
      'form.duplicate_key',
      'q_a',
    );
    await refusedWith(
      [question('q_a', 'short_text', { label: { bn: 'ক' } })],
      'form.label_language',
      'q_a',
    );
    await refusedWith(
      [question('q_a', 'short_text', { label: BN('ক'.repeat(501)) })],
      'form.label_language',
      'q_a',
    );
    expect((await read(mt, versionId)).sections).toEqual(before.sections);
  });

  it("is saved and published by the Monitoring Team only: the PM, another program's PM, an RPM and a volunteer are refused", async () => {
    const mt = await as(world.users.monitoring);
    const { versionId } = await blankForm(await draftProject());
    expect((await save(mt, versionId, waitingSections())).status).toBe(200);
    const { etag, sections } = await read(mt, versionId);
    const others = [
      await as(world.users.pm),
      await staff('program_manager'),
      await as(world.users.rpmDhaka),
      await as(world.users.general),
    ];
    for (const s of others) {
      expect((await save(s, versionId, writtenSections(), etag)).status).toBe(403);
      expect((await publish(s, versionId, etag)).status).toBe(403);
    }
    expect(await read(mt, versionId)).toEqual({ etag, sections });
  });
});

describe('a form whose only version is a draft with missing texts', () => {
  const PROBE = 'draft-probe-token-0123456789abcdef';
  /** The answers every reader outside the builder gives for the project's form. */
  async function answersOf(projectId: string, formId: string, versionId: string) {
    const pm = await as(world.users.pm);
    const volunteer = await as(world.users.general);
    const enable = await at(pm, 'patch', `/projects/${projectId}/public-link`).send({
      enabled: true,
      formId,
    });
    // a link that names the form all the same, as only a write past the service could leave it
    const token = `${PROBE}-${projectId.slice(0, 8)}`;
    await insert(h.db, 'project_components', {
      id: randomUUID(),
      project_id: projectId,
      component_key: 'public_link',
      enabled: true,
      settings: JSON.stringify({ enabled: true, token, form_ids: [formId] }),
    });
    const opened = await api().get(`/api/v1/public/forms/${token}`);
    const sent = await api()
      .post(`/api/v1/public/forms/${token}/applications`)
      .send({ clientUuid: randomUUID(), answers: [] });
    const screen = await at(volunteer, 'get', `/projects/${projectId}/application-form`);
    const created = await at(volunteer, 'post', `/projects/${projectId}/applications`).send({
      clientUuid: randomUUID(),
      projectId,
      formVersionId: versionId,
      answers: [],
    });
    const columns = await at(
      await as(world.users.head),
      'get',
      `/exports/columns?list=applications&projectId=${projectId}`,
    );
    expect(columns.status, JSON.stringify(columns.body)).toBe(200);
    const questions = await h.container.exportQuestions.catalogue(
      projectId,
      new Set(['application.official_section', 'beneficiary.nid']),
    );
    const outcome = (res: { status: number; body: { error?: { code: string } } }) => ({
      status: res.status,
      code: res.body.error?.code,
    });
    return {
      enable: outcome(enable),
      opened: outcome(opened),
      sent: outcome(sent),
      screen: outcome(screen),
      created: outcome(created),
      columns: (columns.body.data.columns as { id: string; group: string }[]).map((c) => c.id),
      questions,
    };
  }

  it('is offered to no applicant, no public link and no export, exactly as a form with nothing published', async () => {
    const mt = await as(world.users.monitoring);
    // two projects the volunteer works on, each with one form that has only a draft: the first
    // waits for its English texts, the second is written in both languages
    const waiting = await save(mt, world.a1.formVersion, waitingSections());
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200);
    const written = await save(mt, world.a2.formVersion, writtenSections());
    expect(written.status, JSON.stringify(written.body)).toBe(200);
    // the state an application needs, set directly: activation is proven by the lifecycle tests
    await h.db.query(`UPDATE projects SET status = 'active' WHERE id = ANY($1::uuid[])`, [
      [world.a1.id, world.a2.id],
    ]);

    const ofWaiting = await answersOf(world.a1.id, world.a1.form, world.a1.formVersion);
    expect(ofWaiting).toMatchObject({
      enable: { status: 422, code: 'public.form_unpublished' },
      opened: { status: 404, code: 'public.link_closed' },
      sent: { status: 404, code: 'public.link_closed' },
      screen: { status: 422, code: 'application.form_not_published' },
      created: { status: 422, code: 'application.form_not_published' },
      questions: [],
    });
    expect(ofWaiting.columns).toContain('app_no');
    expect(ofWaiting.columns.join(' ')).not.toContain('q_amount');
    expect(ofWaiting).toEqual(await answersOf(world.a2.id, world.a2.form, world.a2.formVersion));
    const applications = await h.db.query(
      'SELECT id FROM applications WHERE project_id = ANY($1::uuid[])',
      [[world.a1.id, world.a2.id]],
    );
    expect(applications.rows).toEqual([]);
  });
});

describe('a ready form and the question library', () => {
  async function readyForm(kind: 'beneficiary_application' | 'other', source: unknown) {
    return at(await as(world.users.monitoring), 'post', '/ready-forms').send({
      key: `ready_${next().toLowerCase()}`,
      title: { bn: 'তৈরি ফর্ম', en: 'Ready form' },
      kind,
      source,
    });
  }

  it('save a draft with missing texts, give nothing of it to a copy, a placement or a PM, and publish by the same rule', async () => {
    const mt = await as(world.users.monitoring);
    const made = await readyForm('beneficiary_application', { kind: 'blank' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const formId = made.body.data.id as string;
    const versionId = made.body.data.draftVersionId as string;
    const saved = await save(mt, versionId, waitingSections());
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.sections).toEqual(waitingSections());

    // a draft is no source of a copy, of a placement or of the PM's read
    const copy = await readyForm('beneficiary_application', { kind: 'copy', formId });
    expect([copy.status, copy.body.error.code]).toEqual([409, 'form.nothing_published']);
    const pm = await as(world.users.pm);
    const placed = await at(pm, 'post', `/projects/${await draftProject()}/forms/place`).send({
      readyFormId: formId,
    });
    expect([placed.status, placed.body.error.code]).toEqual([422, 'form.nothing_published']);
    expect((await at(pm, 'get', `/ready-forms/${formId}/published`)).status).toBe(404);

    const refused = await publish(mt, versionId);
    expect(refused.status).toBe(422);
    expect(named(refused.body.error.details as Detail[])).toEqual(MISSING);
    expect((await save(mt, versionId, writtenSections())).status).toBe(200);
    const published = await publish(mt, versionId);
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    // the published version, complete, is what a copy and a placement take
    const copied = await readyForm('beneficiary_application', { kind: 'copy', formId });
    expect(copied.status, JSON.stringify(copied.body)).toBe(201);
    expect((await read(mt, copied.body.data.draftVersionId as string)).sections).toEqual(
      writtenSections(),
    );
    const project = await draftProject();
    const onProject = await at(pm, 'post', `/projects/${project}/forms/place`).send({
      readyFormId: formId,
    });
    expect(onProject.status, JSON.stringify(onProject.body)).toBe(201);
    expect((await read(mt, onProject.body.data.publishedVersionId as string)).sections).toEqual(
      writtenSections(),
    );
  });

  it('keep the library empty while its draft waits for texts, and fill it at the publish', async () => {
    const mt = await as(world.users.monitoring);
    const waiting = [{ ...section(WAITING, 'more'), title: BN('বাড়তি') }];
    const saved = await save(mt, LIBRARY_DRAFT, waiting);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.sections).toEqual(waiting);
    const empty = await at(mt, 'get', '/form-library');
    expect(empty.body.data).toMatchObject({
      libraryFormId: LIBRARY_FORM,
      sections: [],
      fields: [],
    });

    const refused = await publish(mt, LIBRARY_DRAFT);
    expect(refused.status).toBe(422);
    expect(named(refused.body.error.details as Detail[])).toEqual(MISSING);
    expect((await at(mt, 'get', '/form-library')).body.data.sections).toEqual([]);

    const written = [{ ...section(WRITTEN, 'more'), title: both('বাড়তি', 'More') }];
    expect((await save(mt, LIBRARY_DRAFT, written)).status).toBe(200);
    const published = await publish(mt, LIBRARY_DRAFT);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const library = await at(mt, 'get', '/form-library');
    expect(library.body.data.sections).toEqual([
      expect.objectContaining({ key: 'more', title: both('বাড়তি', 'More') }),
    ]);
    expect(
      (library.body.data.fields as { key: string; label: unknown }[]).map((f) => [f.key, f.label]),
    ).toEqual(WRITTEN.map((q) => [q.fieldKey, q.label]));
  });
});
