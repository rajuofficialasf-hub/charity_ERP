import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedFormTemplates } from '../../seed/sets/base/forms.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { publishedForm } from './support/forms.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';

// Master templates and copies of a project: a new project takes exactly the copied parts of its
// source as an independent snapshot (templates and copies).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'put' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
const RULES = {
  volunteer_duties: text('দায়িত্ব'),
  implementation_process: text('প্রক্রিয়া'),
  daee_duties: text('দায়ীর দায়িত্ব'),
  misconduct: text('অনিয়ম'),
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
  await seedFormTemplates(ctx);
});
afterAll(async () => h.close());

let n = 0;
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `T${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
const create = (s: Session, source: Record<string, unknown>, programId = world.a1.program) =>
  at(s, 'post', '/projects').send({
    programId,
    code: code(),
    year: 2027,
    name: { bn: 'নতুন', en: 'New' },
    source,
  });
const componentsOf = async (s: Session, id: string) =>
  (
    (await at(s, 'get', `/projects/${id}/components`)).body.data as {
      componentKey: string;
      enabled: boolean;
      settings: Record<string, unknown>;
      etag: string;
    }[]
  ).sort((a, b) => a.componentKey.localeCompare(b.componentKey));
const patchComponent = async (
  s: Session,
  id: string,
  key: string,
  body: Record<string, unknown>,
) => {
  const row = (await componentsOf(s, id)).find((c) => c.componentKey === key)!;
  const res = await at(s, 'patch', `/projects/${id}/components/${key}`)
    .set('If-Match', row.etag)
    .send(body);
  expect(res.status).toBe(200);
};
const count = async (sql: string, id: string) =>
  ((await h.db.query<{ n: number }>(sql, [id])).rows[0]!.n as number) ?? 0;

/** A draft with every setup part filled in: what a copy takes and what it leaves. */
async function fullSource() {
  const pm = await as(world.users.pm);
  const created = await create(pm, { kind: 'workflow', workflowKey: 'distribution' });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  const basics = await at(pm, 'patch', `/projects/${id}`)
    .set('If-Match', String(created.headers.etag))
    .send({
      applyFrom: '2027-01-01',
      applyTo: '2027-02-01',
      perVolunteerLimit: 40,
      costPerBeneficiary: '500.00',
      targetBeneficiaries: 10,
    });
  expect(basics.status).toBe(200);
  expect(
    (
      await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
        fundSources: [{ source: 'zakat', amount: '5000.00' }],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await at(pm, 'post', `/projects/${id}/areas`).send({
        locationId: world.dhaka.division,
        rpmUserId: world.users.rpmDhaka,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await at(pm, 'post', `/projects/${id}/staff`).send({
        userId: world.users.executive,
        roleKey: 'project_executive',
        areaLocationId: world.dhaka.division,
      })
    ).status,
  ).toBe(201);
  await patchComponent(pm, id, 'distribution', { settings: { rule: 'individual' } });
  await patchComponent(pm, id, 'issue_log', {
    enabled: true,
    settings: { issue_types: [{ code: 'roof', label: text('ছাদ') }] },
  });
  await patchComponent(pm, id, 'dawah', { enabled: true });
  expect(
    (
      await at(pm, 'put', `/projects/${id}/syllabus`).send({
        topics: [{ title: text('তাওহীদ') }, { title: text('সালাত') }],
      })
    ).status,
  ).toBe(200);
  expect((await at(pm, 'put', `/projects/${id}/rules`).send(RULES)).status).toBe(200);
  await publishedForm(h, await as(world.users.monitoring), id);
  return id;
}
/** The field keys of a project's first form, in its first version. */
async function formFieldKeys(s: Session, projectId: string) {
  const forms = await at(s, 'get', `/projects/${projectId}/forms`);
  expect(forms.status).toBe(200);
  const form = forms.body.data[0] as
    | { id: string; key: string; draftVersionId: string | null; publishedVersionId: string | null }
    | undefined;
  if (!form) return null;
  const versionId = form.draftVersionId ?? form.publishedVersionId;
  const version = await at(s, 'get', `/form-versions/${versionId}`);
  expect(version.status).toBe(200);
  return {
    form,
    versionNo: version.body.data.versionNo as number,
    status: version.body.data.status as string,
    keys: (version.body.data.sections as { fields: { fieldKey: string }[] }[]).flatMap((x) =>
      x.fields.map((f) => f.fieldKey),
    ),
  };
}
/** A component as a copy takes it: the form ids are the project's own, so they are left out. */
const COPIED_COMPONENT_VIEW = (c: {
  componentKey: string;
  enabled: boolean;
  settings: unknown;
}) => {
  const { form_ids: _formIds, ...settings } =
    c.settings && typeof c.settings === 'object' ? (c.settings as Record<string, unknown>) : {};
  return { componentKey: c.componentKey, enabled: c.enabled, settings };
};

describe('a copy of a previous project', () => {
  it('takes the components, settings, syllabus and rules, and none of the rest', async () => {
    const pm = await as(world.users.pm);
    const source = await fullSource();
    const res = await create(pm, { kind: 'copy', projectId: source });
    expect(res.status).toBe(201);
    const copy = res.body.data;
    // never copied: budget amounts, dates and the limit
    expect(copy).toMatchObject({
      status: 'draft',
      applyFrom: null,
      applyTo: null,
      perVolunteerLimit: null,
      costPerBeneficiary: null,
      targetBeneficiaries: null,
      dawahEnabled: true,
    });
    // copied: every component with its settings
    expect((await componentsOf(pm, copy.id)).map(COPIED_COMPONENT_VIEW)).toEqual(
      (await componentsOf(pm, source)).map(COPIED_COMPONENT_VIEW),
    );
    const syllabus = await at(pm, 'get', `/projects/${copy.id}/syllabus`);
    expect(syllabus.body.data.map((t: { title: unknown }) => t.title)).toEqual([
      text('তাওহীদ'),
      text('সালাত'),
    ]);
    expect((await at(pm, 'get', `/projects/${copy.id}/rules`)).body.data).toEqual({
      version: 1,
      rules: RULES,
    });
    // copied: the published form, as draft 1 of the copy's own form, named on its component
    const copied = await formFieldKeys(pm, copy.id);
    const original = await formFieldKeys(pm, source);
    expect(copied).toMatchObject({ versionNo: 1, status: 'draft', keys: original!.keys });
    expect(copied!.form.id).not.toBe(original!.form.id);
    const components = await componentsOf(pm, copy.id);
    const named = components.find((c) => c.componentKey === 'application_form')!.settings as {
      form_ids: string[];
    };
    expect(named.form_ids).toEqual([copied!.form.id]);
    expect(
      await count('SELECT count(*)::int AS n FROM applications WHERE project_id = $1', copy.id),
    ).toBe(0);
    // never copied: fund sources, areas, staff access, assignments, logs
    for (const table of ['fund_sources', 'project_areas', 'project_staff', 'project_volunteers'])
      expect(
        await count(`SELECT count(*)::int AS n FROM ${table} WHERE project_id = $1`, copy.id),
        table,
      ).toBe(0);
    const { rows } = await h.db.query(
      'SELECT copied_from_project_id, source_template_id FROM projects WHERE id = $1',
      [copy.id],
    );
    expect(rows[0]).toEqual({ copied_from_project_id: source, source_template_id: null });
    const audit = await h.db.query<{ new: { source: unknown } }>(
      `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'project.create'`,
      [copy.id],
    );
    expect(audit.rows[0]!.new.source).toEqual({ kind: 'copy', projectId: source });
  });

  it('is an independent snapshot both ways', async () => {
    const pm = await as(world.users.pm);
    const source = await fullSource();
    const copy = (await create(pm, { kind: 'copy', projectId: source })).body.data.id as string;
    await patchComponent(pm, source, 'distribution', { settings: { rule: 'group' } });
    expect(
      (await componentsOf(pm, copy)).find((c) => c.componentKey === 'distribution')!.settings,
    ).toEqual({ rule: 'individual' });
    await patchComponent(pm, copy, 'issue_log', { enabled: false });
    expect(
      (await componentsOf(pm, source)).find((c) => c.componentKey === 'issue_log')!.enabled,
    ).toBe(true);
  });

  it('asks of an application what its source asks, in a copy and through a template, whatever the workflow starts with', async () => {
    const pm = await as(world.users.pm);
    const asked = (settings: Record<string, unknown>) =>
      Object.fromEntries(
        ['identity_document', 'mobile', 'repeat_person', 'repeat_family'].map((key) => [
          key,
          settings[key],
        ]),
      );
    const formOf = async (id: string) =>
      (await componentsOf(pm, id)).find((c) => c.componentKey === 'application_form')!.settings;
    /** The rules the audit of a project's creation says it started with. */
    const startedWith = async (id: string) => {
      const { rows } = await h.db.query<{ new: { identityRules: unknown } }>(
        `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'project.create'`,
        [id],
      );
      expect(rows).toHaveLength(1);
      return rows[0]!.new.identityRules;
    };
    const sourceOf = async (workflowKey: string, change: Record<string, unknown>) => {
      const id = (await create(pm, { kind: 'workflow', workflowKey })).body.data.id as string;
      await patchComponent(pm, id, 'application_form', {
        settings: { ...(await formOf(id)), ...change },
      });
      return id;
    };
    // a construction project that asks less than its workflow starts with
    const loose = await sourceOf('construction', {
      identity_document: 'optional',
      mobile: 'optional',
    });
    // a distribution project that asks more than its workflow starts with
    const strict = await sourceOf('distribution', {
      identity_document: 'required',
      mobile: 'required',
      repeat_person: 'hold',
      repeat_family: 'hold',
    });
    const HELD = { repeatPerson: 'hold', repeatFamily: 'hold' };
    for (const [source, expected, rules] of [
      [
        loose,
        { identity_document: 'optional', mobile: 'optional' },
        { document: 'optional', mobile: 'optional', ...HELD },
      ],
      [
        strict,
        {
          identity_document: 'required',
          mobile: 'required',
          repeat_person: 'hold',
          repeat_family: 'hold',
        },
        { document: 'required', mobile: 'required', ...HELD },
      ],
    ] as const) {
      const copy = await create(pm, { kind: 'copy', projectId: source });
      expect(copy.status).toBe(201);
      expect(asked(await formOf(copy.body.data.id as string))).toEqual(asked(expected));
      // the creation is audited with the rules the source gave, not the workflow's starting ones
      expect(await startedWith(copy.body.data.id as string)).toEqual(rules);
      const saved = await at(pm, 'post', `/projects/${source}/save-as-template`).send({
        name: text(`যা চাওয়া হবে ${source.slice(-6)}`),
      });
      expect(saved.status).toBe(200);
      const made = await create(pm, { kind: 'template', templateId: saved.body.data.id });
      expect(made.status).toBe(201);
      expect(asked(await formOf(made.body.data.id as string))).toEqual(asked(expected));
      expect(await startedWith(made.body.data.id as string)).toEqual(rules);
    }
  });

  it('is refused for a project outside the caller reach', async () => {
    const other = await account(h.db, { role: 'program_manager' });
    accounts.set(other.id, other);
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
      other.id,
      world.b1.program,
    ]);
    const source = await fullSource();
    const res = await create(
      await as(other.id),
      { kind: 'copy', projectId: source },
      world.b1.program,
    );
    expect(res.status).toBe(404);
  });
});

describe('master templates', () => {
  it('saves a project as a template that starts new projects, and replaces it from a project', async () => {
    const pm = await as(world.users.pm);
    const source = await fullSource();
    const saved = await at(pm, 'post', `/projects/${source}/save-as-template`).send({
      name: text('শীতবস্ত্র টেমপ্লেট'),
      description: 'প্রতি বছরের শীতবস্ত্র',
    });
    expect(saved.status).toBe(200);
    const template = saved.body.data;
    expect(template).toMatchObject({
      name: text('শীতবস্ত্র টেমপ্লেট'),
      workflowKey: 'distribution',
      active: true,
      version: 1,
    });
    const list = await at(pm, 'get', '/templates');
    expect(list.body.data.map((t: { id: string }) => t.id)).toContain(template.id);

    const fromTemplate = await create(pm, { kind: 'template', templateId: template.id });
    expect(fromTemplate.status).toBe(201);
    const made = fromTemplate.body.data.id as string;
    // the template carries the source's published form; the new project gets it as draft 1
    expect(await formFieldKeys(pm, made)).toMatchObject({
      versionNo: 1,
      status: 'draft',
      keys: (await formFieldKeys(pm, source))!.keys,
    });
    expect((await componentsOf(pm, made)).map(COPIED_COMPONENT_VIEW)).toEqual(
      (await componentsOf(pm, source)).map(COPIED_COMPONENT_VIEW),
    );
    expect((await at(pm, 'get', `/projects/${made}/rules`)).body.data.rules).toEqual(RULES);
    expect(
      (await h.db.query('SELECT source_template_id FROM projects WHERE id = $1', [made])).rows[0]
        .source_template_id,
    ).toBe(template.id);

    // a later change of the template leaves the project made from it as it was
    await patchComponent(pm, source, 'distribution', { settings: { rule: 'group' } });
    const replaced = await at(pm, 'post', `/projects/${source}/save-as-template`).send({
      templateId: template.id,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.version).toBe(2);
    expect(replaced.body.data.name).toEqual(text('শীতবস্ত্র টেমপ্লেট'));
    expect(
      (await componentsOf(pm, made)).find((c) => c.componentKey === 'distribution')!.settings,
    ).toEqual({ rule: 'individual' });
    const again = (await create(pm, { kind: 'template', templateId: template.id })).body.data.id;
    expect(
      (await componentsOf(pm, again)).find((c) => c.componentKey === 'distribution')!.settings,
    ).toEqual({ rule: 'group' });
    const actions = await h.db.query(
      `SELECT action, old FROM audit_log WHERE entity_id = $1 ORDER BY created_at`,
      [template.id],
    );
    expect(actions.rows.map((r) => r.action)).toEqual(['template.create', 'template.update']);
    // the replaced contents are kept in the audit entry of the replacement
    const replacedOld = actions.rows[1].old as {
      version: number;
      definition: { components: { componentKey: string; settings: unknown }[] };
    };
    expect(replacedOld.version).toBe(1);
    expect(
      replacedOld.definition.components.find((c) => c.componentKey === 'distribution')!.settings,
    ).toEqual({ rule: 'individual' });
  });

  it('are shared by everyone who creates projects: another program renames and uses them', async () => {
    const pm = await as(world.users.pm);
    const template = (
      await at(pm, 'post', `/projects/${await fullSource()}/save-as-template`).send({
        name: text('সাধারণ টেমপ্লেট'),
      })
    ).body.data;
    const other = await account(h.db, { role: 'program_manager' });
    accounts.set(other.id, other);
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
      other.id,
      world.b1.program,
    ]);
    const s = await as(other.id);
    expect((await at(s, 'get', '/templates')).body.data.map((t: { id: string }) => t.id)).toContain(
      template.id,
    );
    const renamed = await at(s, 'patch', `/templates/${template.id}`).send({
      name: text('নতুন নাম'),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toEqual(text('নতুন নাম'));
    expect(
      (await create(s, { kind: 'template', templateId: template.id }, world.b1.program)).status,
    ).toBe(201);
  });

  it('a deactivated template stays in the library but starts nothing', async () => {
    const pm = await as(world.users.pm);
    const template = (
      await at(pm, 'post', `/projects/${await fullSource()}/save-as-template`).send({
        name: text('পুরোনো'),
      })
    ).body.data;
    const off = await at(pm, 'patch', `/templates/${template.id}`).send({ active: false });
    expect(off.body.data.active).toBe(false);
    const refused = await create(pm, { kind: 'template', templateId: template.id });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('template.inactive');
    const active = await at(pm, 'get', '/templates');
    expect(active.body.data.map((t: { id: string }) => t.id)).not.toContain(template.id);
    const all = await at(pm, 'get', '/templates').query({ include: 'inactive' });
    expect(all.body.data.map((t: { id: string }) => t.id)).toContain(template.id);
    expect((await at(pm, 'get', `/templates/${template.id}`)).status).toBe(200);
  });

  it('never lists, uses or changes a form template of the form library', async () => {
    const pm = await as(world.users.pm);
    const id = '0190a4c4-0000-7000-8000-00000000f001';
    await h.db.query(
      `INSERT INTO project_templates (id, key, version, name_bn, name_en, project_type, definition)
       VALUES ($1, 'form_test', 1, 'ফর্ম', 'Form', 'distribution', $2)`,
      [id, JSON.stringify({ kind: 'form_template', form: { sections: [] } })],
    );
    const listed = await at(pm, 'get', '/templates').query({ include: 'inactive' });
    expect(listed.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
    expect((await at(pm, 'get', `/templates/${id}`)).status).toBe(404);
    expect((await create(pm, { kind: 'template', templateId: id })).status).toBe(404);
    expect((await at(pm, 'patch', `/templates/${id}`).send({ active: false })).status).toBe(404);
    expect(
      (
        await at(pm, 'post', `/projects/${await fullSource()}/save-as-template`).send({
          templateId: id,
        })
      ).status,
    ).toBe(404);
  });

  it('takes unfinished rules and no syllabus as they are', async () => {
    const pm = await as(world.users.pm);
    const created = await create(pm, { kind: 'workflow', workflowKey: 'distribution' });
    const draft = created.body.data.id as string;
    // one part in Bangla only: a draft may keep its rules unfinished
    await h.db.query(`UPDATE projects SET rules = $1, rules_version = 0 WHERE id = $2`, [
      JSON.stringify({ misconduct: { bn: 'অনিয়ম', en: '' } }),
      draft,
    ]);
    const copy = (await create(pm, { kind: 'copy', projectId: draft })).body.data.id as string;
    expect((await at(pm, 'get', `/projects/${copy}/rules`)).body.data).toEqual({
      version: 1,
      rules: { misconduct: { bn: 'অনিয়ম', en: '' } },
    });
    expect((await at(pm, 'get', `/projects/${copy}/syllabus`)).body.data).toEqual([]);
    // nothing written: no rules version at all
    const blank = (await create(pm, { kind: 'workflow', workflowKey: 'distribution' })).body.data
      .id as string;
    const empty = (await create(pm, { kind: 'copy', projectId: blank })).body.data.id as string;
    expect((await at(pm, 'get', `/projects/${empty}/rules`)).body.data).toEqual({
      version: 0,
      rules: {},
    });
  });

  it('refuses a volunteer, an unknown template and a project outside reach', async () => {
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', '/templates')).status).toBe(403);
    const template = (
      await at(
        await as(world.users.pm),
        'post',
        `/projects/${await fullSource()}/save-as-template`,
      ).send({
        name: text('পরীক্ষার টেমপ্লেট'),
      })
    ).body.data;
    expect((await at(volunteer, 'get', `/templates/${template.id}`)).status).toBe(403);
    expect(
      (await at(volunteer, 'patch', `/templates/${template.id}`).send({ active: false })).status,
    ).toBe(403);
    expect(
      (
        await at(volunteer, 'post', `/projects/${world.a1.id}/save-as-template`).send({
          name: text('স্বেচ্ছাসেবকের'),
        })
      ).status,
    ).toBe(403);
    // an RPM creates no projects and manages no templates
    const rpm = await as(world.users.rpmDhaka);
    expect((await at(rpm, 'get', '/templates')).status).toBe(403);
    expect(
      (await at(rpm, 'patch', `/templates/${template.id}`).send({ active: false })).status,
    ).toBe(403);
    const pm = await as(world.users.pm);
    expect(
      (await create(pm, { kind: 'template', templateId: '0190a4c4-0000-7000-8000-000000000999' }))
        .status,
    ).toBe(404);
    expect(
      (
        await at(pm, 'post', `/projects/${world.b1.id}/save-as-template`).send({
          name: text('অন্যের'),
        })
      ).status,
    ).toBe(404);
  });
});
