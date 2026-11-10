import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
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
import { insert } from './support/fixtures';
import { IDENTITY, question, section } from './support/forms';

// The ready forms the Monitoring Team builds outside the projects, the one question library, the
// placement of a ready form on a project by its PM, and the take of a newer version.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
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
  await seedWorkflows(new SeedContext(h.container.prisma));
  await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [world.a1.id]);
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
    code: `R${next()}`,
    year: 2026,
    name: { bn: 'নমুনা', en: 'Sample' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

async function etagOf(s: Session, versionId: string) {
  const res = await at(s, 'get', `/form-versions/${versionId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.headers.etag as string;
}
async function save(s: Session, versionId: string, sections: unknown[]) {
  return at(s, 'patch', `/form-versions/${versionId}`)
    .set('If-Match', await etagOf(s, versionId))
    .send({ sections });
}
async function publish(s: Session, versionId: string) {
  return at(s, 'post', `/form-versions/${versionId}/publish`).set(
    'If-Match',
    await etagOf(s, versionId),
  );
}
async function createReady(
  kind: 'beneficiary_application' | 'other',
  source: unknown = { kind: 'blank' },
) {
  const res = await at(await as(world.users.monitoring), 'post', '/ready-forms').send({
    key: `ready_${next().toLowerCase()}`,
    title: { bn: 'তৈরি ফর্ম', en: 'Ready form' },
    kind,
    source,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; key: string; draftVersionId: string; kind: string };
}
/** A ready form with a published first version: the identity questions and one more. */
async function publishedReady(
  kind: 'beneficiary_application' | 'other' = 'beneficiary_application',
) {
  const mt = await as(world.users.monitoring);
  const made = await createReady(kind);
  const saved = await save(mt, made.draftVersionId, [
    section([
      ...(kind === 'beneficiary_application' ? IDENTITY : []),
      question('q_note', 'long_text'),
    ]),
  ]);
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const published = await publish(mt, made.draftVersionId);
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return { ...made, versionId: made.draftVersionId };
}
async function place(s: Session, projectId: string, readyFormId: string) {
  return at(s, 'post', `/projects/${projectId}/forms/place`).send({ readyFormId });
}
async function auditRows(entityId: string, action: string) {
  const { rows } = await h.db.query<{ new: unknown }>(
    'SELECT new FROM audit_log WHERE entity_id = $1 AND action = $2',
    [entityId, action],
  );
  return rows;
}

describe('building a ready form', () => {
  it('starts an application form with one empty section, keeps a draft without identity, and publishes it once marked', async () => {
    const mt = await as(world.users.monitoring);
    const made = await createReady('beneficiary_application');
    expect(made).toMatchObject({ kind: 'beneficiary_application' });
    const first = await at(mt, 'get', `/form-versions/${made.draftVersionId}`);
    expect(first.body.data.sections).toEqual([
      expect.objectContaining({ key: 'section_1', fields: [] }),
    ]);
    expect(await auditRows(made.id, 'form.ready_create')).toHaveLength(1);

    const loose = await save(mt, made.draftVersionId, [section([question('q_note', 'long_text')])]);
    expect(loose.status, JSON.stringify(loose.body)).toBe(200);
    const refused = await publish(mt, made.draftVersionId);
    expect(refused.status).toBe(422);
    // the refusal names each missing identity role
    expect(refused.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'mobile', code: 'form.core_field_missing' }),
        expect.objectContaining({ path: 'nid_or_birth_reg', code: 'form.core_field_missing' }),
      ]),
    );

    expect((await save(mt, made.draftVersionId, [section(IDENTITY)])).status).toBe(200);
    const published = await publish(mt, made.draftVersionId);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body.data).toMatchObject({ status: 'published', versionNo: 1 });
    expect(await auditRows(made.draftVersionId, 'form.publish')).toHaveLength(1);
  });

  it('publishes a form of another kind with no identity questions, and copies a ready form', async () => {
    const other = await publishedReady('other');
    const copy = await createReady('other', { kind: 'copy', formId: other.id });
    const read = await at(
      await as(world.users.monitoring),
      'get',
      `/form-versions/${copy.draftVersionId}`,
    );
    expect(read.body.data.sections[0].fields.map((f: { fieldKey: string }) => f.fieldKey)).toEqual([
      'q_note',
    ]);
  });

  it('refuses a key twice and a copy of the library or of a project form', async () => {
    const mt = await as(world.users.monitoring);
    const made = await createReady('other');
    const again = await at(mt, 'post', '/ready-forms').send({
      key: made.key,
      title: { bn: 'আবার', en: 'Again' },
      kind: 'other',
      source: { kind: 'blank' },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('form.key_taken');
    for (const formId of [LIBRARY_FORM, world.a1.form]) {
      const res = await at(mt, 'post', '/ready-forms').send({
        key: `copy_${next().toLowerCase()}`,
        title: { bn: 'কপি', en: 'Copy' },
        kind: 'other',
        source: { kind: 'copy', formId },
      });
      expect(res.status, formId).toBe(404);
    }
  });

  it('is built by the two global roles only', async () => {
    const body = {
      key: 'not_mine',
      title: { bn: 'না', en: 'No' },
      kind: 'other',
      source: { kind: 'blank' },
    };
    for (const user of [world.users.pm, world.users.rpmDhaka, world.users.general])
      expect((await at(await as(user), 'post', '/ready-forms').send(body)).status, user).toBe(403);
    const made = await createReady('other');
    // the Department Head builds too
    expect(
      (await save(await as(world.users.head), made.draftVersionId, [section([])])).status,
    ).toBe(200);
  });

  it('keeps a ready form and the library from everyone else by id', async () => {
    const made = await createReady('other');
    for (const user of [world.users.pm, world.users.rpmDhaka, world.users.general]) {
      const s = await as(user);
      for (const versionId of [made.draftVersionId, LIBRARY_DRAFT])
        expect((await at(s, 'get', `/form-versions/${versionId}`)).status, user).toBe(404);
      for (const formId of [made.id, LIBRARY_FORM])
        expect((await at(s, 'get', `/forms/${formId}/versions`)).status, user).toBe(403);
      expect(
        (
          await at(s, 'patch', `/form-versions/${made.draftVersionId}`)
            .set('If-Match', '"x"')
            .send({ sections: [] })
        ).status,
        user,
      ).toBe(403);
      // nor can they set the points of the score, which belong to the form's builders
      expect(
        (
          await at(s, 'patch', `/form-versions/${made.draftVersionId}`)
            .set('If-Match', '"x"')
            .send({ sections: [], scoring: { not_previously_assisted: 20 } })
        ).status,
        user,
      ).toBe(403);
    }
    const stored = await h.db.query<{ scoring: unknown }>(
      'SELECT scoring FROM form_versions WHERE id = $1',
      [made.draftVersionId],
    );
    expect(stored.rows[0]!.scoring).toBeNull();
  });
});

describe('the list of ready forms', () => {
  it('shows the builders every ready form and a PM the published ones, never the library', async () => {
    const published = await publishedReady();
    const draftOnly = await createReady('other');
    const all = await at(await as(world.users.monitoring), 'get', '/ready-forms');
    expect(all.status).toBe(200);
    const ids = (all.body.data as { id: string }[]).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([published.id, draftOnly.id]));
    expect(ids).not.toContain(LIBRARY_FORM);

    const pm = await at(await as(world.users.pm), 'get', '/ready-forms');
    expect(pm.status).toBe(200);
    const pmIds = (pm.body.data as { id: string }[]).map((f) => f.id);
    expect(pmIds).toContain(published.id);
    expect(pmIds).not.toContain(draftOnly.id);
    expect(pmIds).not.toContain(LIBRARY_FORM);
    expect(pm.body.data.find((f: { id: string }) => f.id === published.id)).toMatchObject({
      kind: 'beneficiary_application',
      publishedVersionNo: 1,
      draftVersionId: null,
    });

    for (const user of [world.users.rpmDhaka, world.users.general])
      expect((await at(await as(user), 'get', '/ready-forms')).status, user).toBe(403);
  });

  it('shows a PM the published version of a ready form, and nothing of a draft-only form or the library', async () => {
    const published = await publishedReady();
    const pm = await as(world.users.pm);
    const read = await at(pm, 'get', `/ready-forms/${published.id}/published`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data).toMatchObject({ id: published.versionId, status: 'published' });
    const draftOnly = await createReady('other');
    for (const formId of [draftOnly.id, LIBRARY_FORM, world.a1.form])
      expect((await at(pm, 'get', `/ready-forms/${formId}/published`)).status, formId).toBe(404);
  });
});

describe('placing a ready form on a project', () => {
  it('gives the project a published copy that names its source, which the PM cannot change', async () => {
    const ready = await publishedReady();
    const project = await draftProject();
    const pm = await as(world.users.pm);
    const placed = await place(pm, project, ready.id);
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body.data).toMatchObject({
      projectId: project,
      key: ready.key,
      kind: 'beneficiary_application',
      sourceFormId: ready.id,
      sourceVersionNo: 1,
      newerVersionNo: null,
      draftVersionId: null,
    });
    const formId = placed.body.data.id as string;
    const versionId = placed.body.data.publishedVersionId as string;
    const read = await at(pm, 'get', `/form-versions/${versionId}`);
    expect(
      read.body.data.sections[0].fields.map((f: { fieldKey: string }) => f.fieldKey),
    ).toContain('q_mobile');
    expect(await auditRows(formId, 'form.place')).toHaveLength(1);

    expect((await at(pm, 'post', `/forms/${formId}/versions`)).status).toBe(403);
    expect(
      (
        await at(pm, 'patch', `/form-versions/${versionId}`)
          .set('If-Match', '"x"')
          .send({ sections: [] })
      ).status,
    ).toBe(403);
    // a builder changes a placed copy only by the take of a newer version
    const builderDraft = await at(
      await as(world.users.monitoring),
      'post',
      `/forms/${formId}/versions`,
    );
    expect(builderDraft.status).toBe(409);
    expect(builderDraft.body.error.code).toBe('form.placed_copy');
    // a key the PM gives that the project already uses is refused
    const again = await at(pm, 'post', `/projects/${project}/forms/place`).send({
      readyFormId: ready.id,
      key: ready.key,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('form.key_taken');
  });

  it('refuses a ready form with nothing published, the library and another project form', async () => {
    const project = await draftProject();
    const pm = await as(world.users.pm);
    const draftOnly = await createReady('other');
    const unpublished = await place(pm, project, draftOnly.id);
    expect(unpublished.status).toBe(422);
    expect(unpublished.body.error.code).toBe('form.nothing_published');
    for (const formId of [LIBRARY_FORM, world.a1.form, randomUUID()])
      expect((await place(pm, project, formId)).status, formId).toBe(404);
  });

  it('refuses another program, an RPM and a volunteer', async () => {
    const ready = await publishedReady();
    expect((await place(await as(world.users.pm), world.b1.id, ready.id)).status).toBe(404);
    for (const user of [world.users.rpmDhaka, world.users.general])
      expect((await place(await as(user), world.a1.id, ready.id)).status, user).toBe(403);
  });
});

describe('taking a newer version', () => {
  it('reports the newer version, takes it as the next version, and leaves applications on theirs', async () => {
    const mt = await as(world.users.monitoring);
    const pm = await as(world.users.pm);
    const ready = await publishedReady();
    const project = await draftProject();
    const placed = (await place(pm, project, ready.id)).body.data as {
      id: string;
      publishedVersionId: string;
    };
    const application = await insert(h.db, 'applications', {
      id: randomUUID(),
      project_id: project,
      form_version_id: placed.publishedVersionId,
      region_location_id: world.dhaka.division,
      district_id: world.dhaka.district,
      union_id: world.dhaka.union,
      status: 'needs_verification',
    });

    // nothing newer yet
    const early = await at(pm, 'post', `/forms/${placed.id}/take-version`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('form.no_newer_version');

    const second = await at(mt, 'post', `/forms/${ready.id}/versions`);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(
      (
        await save(mt, second.body.data.id, [
          section([...IDENTITY, question('q_extra', 'short_text')]),
        ])
      ).status,
    ).toBe(200);
    expect((await publish(mt, second.body.data.id)).status).toBe(200);

    const listed = await at(pm, 'get', `/projects/${project}/forms`);
    expect(listed.body.data.find((f: { id: string }) => f.id === placed.id)).toMatchObject({
      sourceVersionNo: 1,
      newerVersionNo: 2,
    });

    const taken = await at(pm, 'post', `/forms/${placed.id}/take-version`);
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    expect(taken.body.data).toMatchObject({ sourceVersionNo: 2, newerVersionNo: null });
    expect(taken.body.data.publishedVersionId).not.toBe(placed.publishedVersionId);
    const versions = await h.db.query<{ version_no: number; status: string }>(
      'SELECT version_no, status FROM form_versions WHERE form_id = $1 ORDER BY version_no',
      [placed.id],
    );
    expect(versions.rows).toEqual([
      { version_no: 1, status: 'retired' },
      { version_no: 2, status: 'published' },
    ]);
    const kept = await h.db.query('SELECT form_version_id FROM applications WHERE id = $1', [
      application,
    ]);
    expect(kept.rows[0].form_version_id).toBe(placed.publishedVersionId);
    expect(await auditRows(placed.id, 'form.take_version')).toHaveLength(1);

    // another program's PM reaches nothing; an RPM and a volunteer hold no placement
    const otherPm = await staff('program_manager');
    expect((await at(otherPm, 'post', `/forms/${placed.id}/take-version`)).status).toBe(404);
    for (const user of [world.users.rpmDhaka, world.users.general])
      expect(
        (await at(await as(user), 'post', `/forms/${placed.id}/take-version`)).status,
        user,
      ).toBe(403);
    // a project form that was not placed has nothing to take
    expect((await at(mt, 'post', `/forms/${world.a1.form}/take-version`)).status).toBe(404);
  });
});

describe('the public link of a placed form', () => {
  it('opens an application form, and refuses a form of another kind', async () => {
    const pm = await as(world.users.pm);
    const project = await draftProject();
    const other = (await place(pm, project, (await publishedReady('other')).id)).body.data
      .id as string;
    const refused = await at(pm, 'patch', `/projects/${project}/public-link`).send({
      enabled: true,
      formId: other,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('public.form_not_application');
    const application = (await place(pm, project, (await publishedReady()).id)).body.data
      .id as string;
    const opened = await at(pm, 'patch', `/projects/${project}/public-link`).send({
      enabled: true,
      formId: application,
    });
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    expect(opened.body.data.url).toEqual(expect.any(String));
    // the audit names the form, never the token
    const rows = await h.db.query<{ new: unknown }>(
      'SELECT new FROM audit_log WHERE entity_id = ANY($1::uuid[])',
      [[project, other, application]],
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    const token = (opened.body.data.url as string).split('/').pop()!;
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });
});

describe('the question library', () => {
  it('starts empty, is built and published like a form, and is never listed among the ready forms', async () => {
    const mt = await as(world.users.monitoring);
    const empty = await at(mt, 'get', '/form-library');
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({
      libraryFormId: LIBRARY_FORM,
      sections: [],
      fields: [],
      templates: [],
    });

    const members = [
      question('member_name', 'short_text', { settings: { repeat: { group: 'members' } } }),
      question('member_age', 'number', { settings: { repeat: { group: 'members' } } }),
    ];
    const saved = await save(mt, LIBRARY_DRAFT, [
      section(
        [question('q_income', 'number'), question('members', 'repeat_group'), ...members],
        'family',
      ),
    ]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // the library carries no identity questions and still publishes
    const published = await publish(mt, LIBRARY_DRAFT);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(await auditRows(LIBRARY_DRAFT, 'form.publish')).toHaveLength(1);

    const library = await at(mt, 'get', '/form-library');
    expect(library.body.data.sections).toEqual([
      expect.objectContaining({
        key: 'family',
        fieldKeys: ['q_income', 'members'],
        defaultVisibility: 'volunteer',
      }),
    ]);
    const group = (
      library.body.data.fields as { key: string; formFields: { fieldKey: string }[] }[]
    ).find((f) => f.key === 'members')!;
    expect(group.formFields.map((f) => f.fieldKey)).toEqual([
      'members',
      'member_name',
      'member_age',
    ]);
    expect(library.body.data.fields.map((f: { key: string }) => f.key)).toEqual([
      'q_income',
      'members',
    ]);

    const listed = await at(mt, 'get', '/ready-forms');
    expect((listed.body.data as { id: string }[]).map((f) => f.id)).not.toContain(LIBRARY_FORM);
  });
});

describe('a project that takes no more changes', () => {
  it('refuses the placement and the take, and writes nothing', async () => {
    const pm = await as(world.users.pm);
    const ready = await publishedReady('other');
    const project = await draftProject();
    const placed = (await place(pm, project, ready.id)).body.data.id as string;
    await h.db.query(`UPDATE projects SET status = 'closing' WHERE id = $1`, [project]);
    const second = await publishedReady('other');
    const refusedPlace = await place(pm, project, second.id);
    expect(refusedPlace.status).toBe(409);
    expect(refusedPlace.body.error.code).toBe('project.read_only');
    const forms = await h.db.query('SELECT id FROM forms WHERE project_id = $1', [project]);
    expect(forms.rows.map((r: { id: string }) => r.id)).toEqual([placed]);

    const mt = await as(world.users.monitoring);
    const next = await at(mt, 'post', `/forms/${ready.id}/versions`);
    expect(
      (await save(mt, next.body.data.id, [section([question('q_more', 'long_text')])])).status,
    ).toBe(200);
    expect((await publish(mt, next.body.data.id)).status).toBe(200);
    const refusedTake = await at(pm, 'post', `/forms/${placed}/take-version`);
    expect(refusedTake.status).toBe(409);
    expect(refusedTake.body.error.code).toBe('project.read_only');
    expect(await auditRows(placed, 'form.take_version')).toHaveLength(0);
  });
});

describe('the kind of a copied form', () => {
  it('stays with a copy of a placed form of another kind', async () => {
    const pm = await as(world.users.pm);
    const project = await draftProject();
    const placed = (await place(pm, project, (await publishedReady('other')).id)).body.data
      .id as string;
    const copy = await at(
      await as(world.users.monitoring),
      'post',
      `/projects/${project}/forms`,
    ).send({
      key: 'copied_other',
      title: { bn: 'কপি', en: 'Copy' },
      source: { kind: 'copy', formId: placed },
    });
    expect(copy.status, JSON.stringify(copy.body)).toBe(201);
    expect(copy.body.data).toMatchObject({ kind: 'other', sourceFormId: null });
  });
});

describe('the published read of a ready form', () => {
  it('gives a PM, who sees official sections on the projects, the official-only part too', async () => {
    const mt = await as(world.users.monitoring);
    const made = await createReady('other');
    const official = {
      ...section([question('q_office', 'long_text')], 'office'),
      visibility: 'official_only',
    };
    expect(
      (await save(mt, made.draftVersionId, [section([question('q_open', 'long_text')]), official]))
        .status,
    ).toBe(200);
    expect((await publish(mt, made.draftVersionId)).status).toBe(200);
    const read = await at(await as(world.users.pm), 'get', `/ready-forms/${made.id}/published`);
    expect(read.status).toBe(200);
    expect(read.body.data.sections.map((s: { key: string }) => s.key)).toEqual([
      'section_1',
      'office',
    ]);
    expect(read.body.data).toMatchObject({ formId: made.id, versionNo: 1, status: 'published' });
  });
});

describe('placing a ready form twice and copying into another kind', () => {
  it('gives the second placement on one project a free key of its own', async () => {
    const pm = await as(world.users.pm);
    const ready = await publishedReady('other');
    const project = await draftProject();
    const first = await place(pm, project, ready.id);
    const second = await place(pm, project, ready.id);
    expect(first.status).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.data.key).toBe(`${ready.key}_2`);
  });

  it('drops the identity marks when an application form is copied as a form of the kind other', async () => {
    const source = await publishedReady('beneficiary_application');
    const copy = await createReady('other', { kind: 'copy', formId: source.id });
    const read = await at(
      await as(world.users.monitoring),
      'get',
      `/form-versions/${copy.draftVersionId}`,
    );
    const fields = read.body.data.sections.flatMap(
      (s: { fields: { fieldKey: string; standardColumn: string | null }[] }) => s.fields,
    );
    expect(fields.map((f: { fieldKey: string }) => f.fieldKey)).toContain('q_mobile');
    expect(fields.every((f: { standardColumn: string | null }) => f.standardColumn === null)).toBe(
      true,
    );
  });
});
