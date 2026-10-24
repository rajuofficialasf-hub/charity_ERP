import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedFormTemplates } from '../../seed/sets/base/forms';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';

// The forms of a project: the library the builder picks from, the first draft from a template,
// blank or a copy, the versions, and the version read that keeps official-only sections from
// those who may not see them (plan docs/plans/2026-10-21-1135-feat-form-engine-plan.md).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

const CORE = [
  'nid_or_birth_reg',
  'name',
  'father_or_husband_name',
  'mobile',
  'gender',
  'address',
  'village',
];

interface SectionView {
  key: string;
  visibility: string;
  fields: {
    fieldKey: string;
    required: boolean;
    standardColumn: string | null;
    options?: { code: string; allowsOtherText: boolean }[];
  }[];
}
const fieldsOf = (sections: SectionView[]) => sections.flatMap((s) => s.fields);

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
  await seedFormTemplates(ctx);
  // a volunteer reaches only an active project
  await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [world.a1.id]);
});
afterAll(async () => h.close());

let n = 0;
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `F${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
async function staff(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return { id: a.id, session: await login(h, a) };
}
/** A draft project of the PM's program, made through the API, with no form yet. */
async function draft() {
  const res = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: code(),
    year: 2026,
    name: { bn: 'নমুনা', en: 'Sample' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}
async function createForm(projectId: string, source: unknown, key = 'default') {
  return at(await as(world.users.monitoring), 'post', `/projects/${projectId}/forms`).send({
    key,
    title: { bn: 'আবেদন', en: 'Application' },
    source,
  });
}
async function readVersion(s: Session, versionId: string) {
  return at(s, 'get', `/form-versions/${versionId}`);
}
/** Publishes a draft by SQL, as the publish route of the next unit will. */
async function publishBySql(versionId: string) {
  await h.db.query(
    `UPDATE form_versions SET status = 'published', published_at = now(), published_by = $2 WHERE id = $1`,
    [versionId, world.users.pm],
  );
}

describe('the form library', () => {
  // its content, built and published as the library form, is read in the ready-forms tests
  it('is refused to a PM, an RPM and a volunteer, and without a login', async () => {
    expect((await at(await as(world.users.pm), 'get', '/form-library')).status).toBe(403);
    expect((await at(await as(world.users.rpmDhaka), 'get', '/form-library')).status).toBe(403);
    expect((await at(await as(world.users.general), 'get', '/form-library')).status).toBe(403);
    expect((await api().get('/api/v1/form-library')).status).toBe(401);
  });
});

describe('creating a project form', () => {
  it('starts draft 1 from the distribution template, with the core required and the type options from the list', async () => {
    const project = await draft();
    const res = await createForm(project, { kind: 'template', templateKey: 'form_distribution' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      projectId: project,
      key: 'default',
      title: { bn: 'আবেদন', en: 'Application' },
      publishedVersionId: null,
    });
    const versionId = res.body.data.draftVersionId as string;
    const version = await readVersion(await as(world.users.pm), versionId);
    expect(version.status).toBe(200);
    expect(version.body.data).toMatchObject({
      formId: res.body.data.id,
      versionNo: 1,
      status: 'draft',
    });
    const sections: SectionView[] = version.body.data.sections;
    expect(sections.map((s) => s.key)).toEqual(['basic_info', 'family_income', 'address']);
    const fields = fieldsOf(sections);
    for (const key of CORE) {
      const field = fields.find((x) => x.fieldKey === key);
      expect(field, key).toBeDefined();
      expect(field!.required, key).toBe(true);
      expect(field!.standardColumn, key).not.toBeNull();
    }
    expect(fields.find((x) => x.fieldKey === 'age')?.required).toBe(false);
    const types = fields.find((x) => x.fieldKey === 'beneficiary_class')!.options!;
    expect(types.map((o) => o.code)).toEqual([
      'elderly',
      'widow',
      'orphan',
      'disabled',
      'ill',
      'labourer',
      'extreme_poor',
      'other',
    ]);
    expect(types.find((o) => o.code === 'other')?.allowsOtherText).toBe(true);
    // the project's component names its form
    const components = await at(await as(world.users.pm), 'get', `/projects/${project}/components`);
    const form = components.body.data.find(
      (c: { componentKey: string }) => c.componentKey === 'application_form',
    );
    expect(form.settings.form_ids).toEqual([res.body.data.id]);
    const list = await at(await as(world.users.pm), 'get', `/projects/${project}/forms`);
    expect(list.body.data).toEqual([
      expect.objectContaining({ id: res.body.data.id, draftVersionId: versionId }),
    ]);
  });

  it('starts from the self-reliance template with its official-only section first', async () => {
    const project = await draft();
    const res = await createForm(project, {
      kind: 'template',
      templateKey: 'form_self_reliance_construction',
    });
    expect(res.status).toBe(201);
    const version = await readVersion(await as(world.users.pm), res.body.data.draftVersionId);
    const sections: SectionView[] = version.body.data.sections;
    expect(sections[0]).toMatchObject({ key: 'official', visibility: 'official_only' });
    expect(sections.map((s) => s.key)).toContain('zakat_assessment');
    const earners = fieldsOf(sections).find((x) => x.fieldKey === 'earners');
    expect(earners).toBeDefined();
  });

  it('starts blank with one empty section and no question', async () => {
    const project = await draft();
    const res = await createForm(project, { kind: 'blank' });
    expect(res.status).toBe(201);
    const version = await readVersion(await as(world.users.pm), res.body.data.draftVersionId);
    expect(version.body.data.sections).toHaveLength(1);
    expect(fieldsOf(version.body.data.sections)).toEqual([]);
  });

  it('copies the published form of another project the caller reaches, and nothing of one it does not', async () => {
    const source = await draft();
    const made = await createForm(source, { kind: 'template', templateKey: 'form_distribution' });
    await publishBySql(made.body.data.draftVersionId);
    const target = await draft();
    const copy = await createForm(target, { kind: 'copy', formId: made.body.data.id });
    expect(copy.status).toBe(201);
    const version = await readVersion(await as(world.users.pm), copy.body.data.draftVersionId);
    expect(version.body.data.versionNo).toBe(1);
    expect(fieldsOf(version.body.data.sections).map((x) => x.fieldKey)).toEqual(
      fieldsOf(
        (await readVersion(await as(world.users.pm), made.body.data.draftVersionId)).body.data
          .sections,
      ).map((x) => x.fieldKey),
    );
    // a draft-only source has nothing published to copy
    const unpublished = await createForm(await draft(), {
      kind: 'copy',
      formId: made.body.data.id,
    });
    expect(unpublished.status).toBe(201);
    const draftOnly = await createForm(source, { kind: 'blank' }, 'second');
    expect(draftOnly.status).toBe(201);
    const noPublished = await createForm(await draft(), {
      kind: 'copy',
      formId: draftOnly.body.data.id,
    });
    expect(noPublished.status).toBe(409);
  });

  it('refuses a copy to a caller who does not see the official-only sections of the source', async () => {
    const source = await draft();
    const made = await createForm(source, {
      kind: 'template',
      templateKey: 'form_self_reliance_construction',
    });
    await publishBySql(made.body.data.draftVersionId);
    const target = await draft();
    // the panel takes the official-section class from the PM for a while
    const { rows } = await h.db.query<{ id: string }>(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
       VALUES (gen_random_uuid(), $1, 'application.view_official_section', 'revoke', 'GLOBAL', 'test', $2)
       RETURNING id`,
      [world.users.monitoring, world.users.head],
    );
    try {
      const refused = await createForm(target, { kind: 'copy', formId: made.body.data.id });
      expect(refused.status).toBe(403);
      expect(JSON.stringify(refused.body)).not.toContain('official_comment');
    } finally {
      await h.db.query('DELETE FROM user_permissions WHERE id = $1', [rows[0]!.id]);
    }
    const allowed = await createForm(target, { kind: 'copy', formId: made.body.data.id });
    expect(allowed.status).toBe(201);
  });

  it('refuses a second form with the same key, an unknown template and a bad body', async () => {
    const project = await draft();
    expect((await createForm(project, { kind: 'blank' })).status).toBe(201);
    expect((await createForm(project, { kind: 'blank' })).status).toBe(409);
    expect(
      (await createForm(project, { kind: 'template', templateKey: 'no_such_form' }, 'other'))
        .status,
    ).toBe(404);
    expect((await createForm(project, { kind: 'wrong' }, 'third')).status).toBe(422);
    expect((await createForm(project, { kind: 'blank' }, 'Bad Key')).status).toBe(422);
  });

  it("is refused to the PM, another program's PM, an RPM and a volunteer, like the versions list", async () => {
    const project = await draft();
    const made = await createForm(project, { kind: 'blank' });
    const formId = made.body.data.id as string;
    const otherPm = await staff('program_manager');
    const body = { key: 'x', title: { bn: 'ক', en: 'X' }, source: { kind: 'blank' } };
    expect(
      (await at(await as(world.users.pm), 'post', `/projects/${project}/forms`).send(body)).status,
    ).toBe(403);
    expect((await at(await as(world.users.pm), 'get', `/forms/${formId}/versions`)).status).toBe(
      403,
    );
    expect(
      (await at(otherPm.session, 'post', `/projects/${project}/forms`).send(body)).status,
    ).toBe(403);
    expect(
      (await at(await as(world.users.rpmDhaka), 'post', `/projects/${project}/forms`).send(body))
        .status,
    ).toBe(403);
    expect(
      (await at(await as(world.users.general), 'post', `/projects/${project}/forms`).send(body))
        .status,
    ).toBe(403);
    expect((await at(otherPm.session, 'get', `/forms/${formId}/versions`)).status).toBe(403);
    expect(
      (await at(await as(world.users.rpmDhaka), 'get', `/forms/${formId}/versions`)).status,
    ).toBe(403);
    expect(
      (await at(await as(world.users.general), 'get', `/forms/${formId}/versions`)).status,
    ).toBe(403);
    const versions = await at(await as(world.users.monitoring), 'get', `/forms/${formId}/versions`);
    expect(versions.status).toBe(200);
    expect(versions.body.data).toEqual([
      expect.objectContaining({ versionNo: 1, status: 'draft', publishedAt: null }),
    ]);
  });
});

describe('reading a version', () => {
  async function selfRelianceOn(projectId: string) {
    const made = await createForm(projectId, {
      kind: 'template',
      templateKey: 'form_self_reliance_construction',
    });
    expect(made.status).toBe(201);
    return made.body.data.draftVersionId as string;
  }

  it('gives an official every section and keeps the official-only one from a role without that class', async () => {
    // the world's project A1 already holds an empty draft; the template goes onto a fresh form of it
    const versionId = await selfRelianceOn(world.a1.id).catch(() => null);
    const target = versionId ?? (await selfRelianceOn(await draft()));
    const pm = await readVersion(await as(world.users.pm), target);
    expect(pm.status).toBe(200);
    expect(pm.headers.etag).toMatch(/^"[0-9a-z]+"$/);
    const keys = (pm.body.data.sections as SectionView[]).map((s) => s.key);
    expect(keys).toContain('official');
    const finance = await readVersion((await staff('finance_team')).session, target);
    expect(finance.status).toBe(200);
    expect((finance.body.data.sections as SectionView[]).map((s) => s.key)).not.toContain(
      'official',
    );
    expect(JSON.stringify(finance.body)).not.toContain('official_comment');
  });

  it('gives an assigned volunteer the volunteer-visible sections only, and an unassigned one nothing', async () => {
    const versionId = world.a1.formVersion;
    await h.db.query(
      `INSERT INTO form_sections (id, form_version_id, key, title_bn, title_en, sort_order, visibility)
       VALUES (gen_random_uuid(), $1, 'official', 'অফিসিয়াল', 'Official', 1, 'official_only'),
              (gen_random_uuid(), $1, 'basic_info', 'মূল তথ্য', 'Basic information', 2, 'volunteer')`,
      [versionId],
    );
    const volunteer = await readVersion(await as(world.users.general), versionId);
    expect(volunteer.status).toBe(200);
    expect((volunteer.body.data.sections as SectionView[]).map((s) => s.key)).toEqual([
      'basic_info',
    ]);
    // a volunteer on no project holds the permission nowhere; an official of another program
    // reaches other projects, so the version is simply not found
    expect((await readVersion(await as(world.users.team), versionId)).status).toBe(403);
    expect((await readVersion(await as(world.users.outsider), versionId)).status).toBe(404);
  });

  it('answers 404 for an unknown version and 422 for a bad id', async () => {
    const pm = await as(world.users.monitoring);
    expect((await readVersion(pm, '01900000-0000-7000-8000-00000000dead')).status).toBe(404);
    expect((await readVersion(pm, 'not-a-uuid')).status).toBe(422);
    expect((await at(pm, 'get', '/forms/not-a-uuid/versions')).status).toBe(422);
  });
});

describe('drafts, publishing and the field map', () => {
  type Sections = Record<string, unknown>[];
  const update = (s: Session, versionId: string, etag: string, sections: unknown) =>
    at(s, 'patch', `/form-versions/${versionId}`).set('If-Match', etag).send({ sections });
  const publish = (s: Session, versionId: string, etag: string) =>
    at(s, 'post', `/form-versions/${versionId}/publish`).set('If-Match', etag);
  const nextDraft = (s: Session, formId: string) => at(s, 'post', `/forms/${formId}/versions`);
  const fieldMap = (s: Session, formId: string) => at(s, 'get', `/forms/${formId}/fields`);
  async function current(s: Session, versionId: string) {
    const res = await readVersion(s, versionId);
    expect(res.status).toBe(200);
    return { etag: res.headers.etag as string, sections: res.body.data.sections as Sections };
  }
  const withField = (
    sections: Sections,
    sectionKey: string,
    change: (fields: Record<string, unknown>[]) => Record<string, unknown>[],
  ) =>
    sections.map((s) =>
      s.key === sectionKey ? { ...s, fields: change(s.fields as Record<string, unknown>[]) } : s,
    );
  const customSection = (fields: Record<string, unknown>[]) => ({
    key: 'project_questions',
    librarySectionKey: 'project_questions',
    title: { bn: 'প্রকল্পের প্রশ্ন', en: 'Project questions' },
    visibility: 'volunteer',
    condition: null,
    fields,
  });
  const textField = (fieldKey: string, extra: Record<string, unknown> = {}) => ({
    fieldKey,
    libraryFieldKey: null,
    type: 'short_text',
    label: { bn: 'প্রশ্ন', en: 'Question' },
    required: false,
    standardColumn: null,
    settings: {},
    options: [],
    ...extra,
  });
  async function distributionDraft() {
    const project = await draft();
    const made = await createForm(project, { kind: 'template', templateKey: 'form_distribution' });
    expect(made.status).toBe(201);
    return {
      project,
      formId: made.body.data.id as string,
      versionId: made.body.data.draftVersionId as string,
    };
  }
  async function auditRows(entityId: string, action: string) {
    const { rows } = await h.db.query(
      'SELECT new FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
      [entityId, action],
    );
    return rows;
  }

  it('keeps a draft without its identity questions, refuses the publish naming the role, and refuses broken logic in a draft', async () => {
    const pm = await as(world.users.monitoring);
    const { versionId } = await distributionDraft();
    const { etag, sections } = await current(pm, versionId);
    const refused = async (body: unknown, code: string, path: string) => {
      const res = await update(pm, versionId, etagNow, body);
      expect(res.status).toBe(422);
      const details = res.body.error.details as { path: string; code: string }[];
      expect(
        details.some((d) => d.path.startsWith(path) && d.code === code),
        JSON.stringify(details),
      ).toBe(true);
    };
    // a draft may lose an identity question; the publish names the missing role
    const loose = withField(sections, 'basic_info', (fields) =>
      fields
        .filter((x) => x.fieldKey !== 'name')
        .map((x) => (x.fieldKey === 'mobile' ? { ...x, required: false } : x)),
    );
    const saved = await update(pm, versionId, etag, loose);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const publishRefused = await at(pm, 'post', `/form-versions/${versionId}/publish`).set(
      'If-Match',
      saved.headers.etag as string,
    );
    expect(publishRefused.status).toBe(422);
    expect(publishRefused.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name', code: 'form.core_field_missing' }),
        expect.objectContaining({ path: 'mobile', code: 'form.core_field_optional' }),
      ]),
    );
    // the draft goes back to its first shape for the logic cases
    const restored = await update(pm, versionId, saved.headers.etag as string, sections);
    expect(restored.status).toBe(200);
    const etagNow = restored.headers.etag as string;
    await refused(
      [
        ...sections,
        customSection([
          textField('house_type', {
            logic: { show_if: { field: 'no_such_field', op: 'eq', value: 'x' } },
          }),
        ]),
      ],
      'form.unknown_reference',
      'house_type',
    );
    await refused(
      [
        ...sections,
        customSection([
          textField('loop', {
            type: 'calculation',
            calculation: { expr: { op: 'add', args: [{ field: 'loop' }, 1] } },
          }),
        ]),
      ],
      'form.calculation_cycle',
      'loop',
    );
    // nothing changed
    expect((await current(pm, versionId)).sections).toEqual(sections);
  });

  it('saves a valid draft, reads it back unchanged, and refuses a stale version', async () => {
    const pm = await as(world.users.monitoring);
    const { versionId } = await distributionDraft();
    const { etag, sections } = await current(pm, versionId);
    const next = [...sections, customSection([textField('house_type')])];
    const saved = await update(pm, versionId, etag, next);
    expect(saved.status).toBe(200);
    expect(saved.body.data.sections).toEqual(next);
    const again = await current(pm, versionId);
    expect(again.sections).toEqual(next);
    expect(again.etag).not.toBe(etag);
    expect((await update(pm, versionId, etag, next)).status).toBe(412);
    expect((await update(pm, versionId, '"nope"', next)).status).toBe(412);
    expect((await auditRows(versionId, 'form.draft_changed')).length).toBe(1);
  });

  it('keeps a calculated question without its rule in a draft, and refuses to publish it naming the question', async () => {
    const pm = await as(world.users.monitoring);
    const { versionId } = await distributionDraft();
    const { etag, sections } = await current(pm, versionId);
    const saved = await update(pm, versionId, etag, [
      ...sections,
      customSection([textField('total', { type: 'calculation' })]),
    ]);
    expect(saved.status).toBe(200);
    const refused = await publish(pm, versionId, saved.headers.etag as string);
    expect(refused.status).toBe(422);
    expect(refused.body.error.details).toEqual([
      expect.objectContaining({ path: 'total', code: 'form.calculation_missing' }),
    ]);
  });

  it('publishes a draft, retires the previous version, and starts the next draft as a copy', async () => {
    const pm = await as(world.users.monitoring);
    const { project, formId, versionId } = await distributionDraft();
    const first = await publish(pm, versionId, (await current(pm, versionId)).etag);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ versionNo: 1, status: 'published' });
    expect(first.body.data.publishedAt).toEqual(expect.any(String));
    // a published version takes no edit, and cannot be published twice
    const published = await current(pm, versionId);
    expect((await update(pm, versionId, published.etag, published.sections)).status).toBe(409);
    expect((await publish(pm, versionId, published.etag)).status).toBe(409);
    // the next draft copies the published version; only one draft is open at a time
    const second = await nextDraft(pm, formId);
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ versionNo: 2, status: 'draft' });
    expect(second.body.data.sections).toEqual(published.sections);
    expect((await nextDraft(pm, formId)).status).toBe(409);
    const v2 = second.body.data.id as string;
    const { etag, sections } = await current(pm, v2);
    const grown = [...sections, customSection([textField('house_type')])];
    expect((await update(pm, v2, etag, grown)).status).toBe(200);
    const done = await publish(pm, v2, (await current(pm, v2)).etag);
    expect(done.status).toBe(200);
    const versions = await at(pm, 'get', `/forms/${formId}/versions`);
    expect(
      versions.body.data.map((v: { versionNo: number; status: string }) => [v.versionNo, v.status]),
    ).toEqual([
      [1, 'retired'],
      [2, 'published'],
    ]);
    // the list names who published each version and who changed it last; the read never does
    const pmName = (
      await h.db.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [
        world.users.monitoring,
      ])
    ).rows[0]!.display_name;
    const named = { id: world.users.monitoring, name: pmName };
    for (const v of versions.body.data)
      expect(v).toMatchObject({
        publishedBy: named,
        updatedBy: named,
        updatedAt: expect.any(String),
      });
    const read = await at(pm, 'get', `/form-versions/${v2}`);
    expect(read.body.data).not.toHaveProperty('publishedBy');
    expect(read.body.data).not.toHaveProperty('updatedBy');
    const forms = await at(pm, 'get', `/projects/${project}/forms`);
    expect(forms.body.data[0]).toMatchObject({ publishedVersionId: v2, draftVersionId: null });
    expect((await auditRows(versionId, 'form.publish')).length).toBe(1);
    expect((await auditRows(formId, 'form.version_created')).length).toBe(1);
    // the field map shows the field added in version 2 as present there only
    const map = await fieldMap(pm, formId);
    expect(map.status).toBe(200);
    const rows = map.body.data as {
      fieldKey: string;
      versions: number[];
      standardColumn: string | null;
    }[];
    expect(rows.find((r) => r.fieldKey === 'house_type')).toMatchObject({
      versions: [2],
      standardColumn: null,
    });
    expect(rows.find((r) => r.fieldKey === 'name')).toMatchObject({
      versions: [1, 2],
      standardColumn: 'name',
    });
  });

  it("refuses the update, the publish, the next draft and the field map to the PM, another program's PM, an RPM and a volunteer", async () => {
    const pm = await as(world.users.monitoring);
    const { formId, versionId } = await distributionDraft();
    const { etag, sections } = await current(pm, versionId);
    const others: [Session, number][] = [
      [await as(world.users.pm), 403],
      [(await staff('program_manager')).session, 403],
      [await as(world.users.rpmDhaka), 403],
      [await as(world.users.general), 403],
    ];
    for (const [s, status] of others) {
      expect((await update(s, versionId, etag, sections)).status).toBe(status);
      expect((await publish(s, versionId, etag)).status).toBe(status);
      expect((await nextDraft(s, formId)).status).toBe(status);
      expect((await fieldMap(s, formId)).status).toBe(status);
    }
    expect((await current(pm, versionId)).sections).toEqual(sections);
  });
});

describe('a builder who does not see the official-only sections', () => {
  const update = (s: Session, versionId: string, etag: string, sections: unknown) =>
    at(s, 'patch', `/form-versions/${versionId}`).set('If-Match', etag).send({ sections });
  const keysOf = (sections: { key: string }[]) => sections.map((s) => s.key);

  it('cannot save a draft, and gets the volunteer-visible part back from the publish, the next draft and the field map', async () => {
    const pm = await as(world.users.monitoring);
    const project = await draft();
    const made = await createForm(project, {
      kind: 'template',
      templateKey: 'form_self_reliance_construction',
    });
    expect(made.status).toBe(201);
    const versionId = made.body.data.draftVersionId as string;
    const formId = made.body.data.id as string;
    const full = await readVersion(pm, versionId);
    expect(keysOf(full.body.data.sections)).toContain('official');
    // the panel takes the official-section class from the PM for a while
    const { rows } = await h.db.query<{ id: string }>(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
       VALUES (gen_random_uuid(), $1, 'application.view_official_section', 'revoke', 'GLOBAL', 'test', $2)
       RETURNING id`,
      [world.users.monitoring, world.users.head],
    );
    try {
      const partial = await readVersion(pm, versionId);
      expect(partial.status).toBe(200);
      expect(keysOf(partial.body.data.sections)).not.toContain('official');
      const refused = await update(
        pm,
        versionId,
        partial.headers.etag as string,
        partial.body.data.sections,
      );
      expect(refused.status).toBe(403);
      const map = await at(pm, 'get', `/forms/${formId}/fields`);
      expect(map.status).toBe(200);
      expect(map.body.data.map((r: { fieldKey: string }) => r.fieldKey)).not.toContain(
        'official_comment',
      );
      const published = await at(pm, 'post', `/form-versions/${versionId}/publish`).set(
        'If-Match',
        partial.headers.etag as string,
      );
      expect(published.status).toBe(200);
      expect(keysOf(published.body.data.sections)).not.toContain('official');
      const next = await at(pm, 'post', `/forms/${formId}/versions`);
      expect(next.status).toBe(201);
      expect(keysOf(next.body.data.sections)).not.toContain('official');
    } finally {
      await h.db.query('DELETE FROM user_permissions WHERE id = $1', [rows[0]!.id]);
    }
    // the official-only section survived the publish and the copy
    const again = await readVersion(pm, versionId);
    expect(keysOf(again.body.data.sections)).toContain('official');
    const versions = await at(pm, 'get', `/forms/${formId}/versions`);
    expect(keysOf(versions.body.data[1].sections)).toContain('official');
  });
});

describe('a form outside every project', () => {
  it('is read by its builders, and is not reached by a PM through the project routes', async () => {
    const builder = await as(world.users.monitoring);
    const pm = await as(world.users.pm);
    const formId = randomUUID();
    const versionId = randomUUID();
    await h.db.query(
      `INSERT INTO forms (id, project_id, key, title_bn, title_en) VALUES ($1, NULL, $2, 'তৈরি', 'Ready')`,
      [formId, `outside_${formId.slice(0, 8)}`],
    );
    await h.db.query(`INSERT INTO form_versions (id, form_id, version_no) VALUES ($1, $2, 1)`, [
      versionId,
      formId,
    ]);
    for (const path of [
      `/forms/${formId}/versions`,
      `/forms/${formId}/fields`,
      `/form-versions/${versionId}`,
    ])
      expect((await at(builder, 'get', path)).status, path).toBe(200);
    expect((await at(pm, 'get', `/form-versions/${versionId}`)).status).toBe(404);
  });
});
