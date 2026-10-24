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
import { beneficiary, fakeMobile, fakeNid, locationTree } from './support/fixtures';

// The public application link: a PM switches it on with one form, anyone with the link reads the
// form and submits an entry that waits for verification, and nothing about anyone is revealed on
// the way (docs/plans/2026-10-21-1135-feat-form-engine-plan.md, "The public link").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let loc: Awaited<ReturnType<typeof locationTree>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  loc = await locationTree(h.db);
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  await seedFormTemplates(ctx);
});
afterAll(async () => h.close());

let n = 0;
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `P${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};

/** Rows added to a draft version by SQL before it is published. */
type DraftChange = (versionId: string) => Promise<void>;

/** A form of the project from the distribution template, changed while a draft, then published. */
async function publishedForm(projectId: string, key = 'default', change?: DraftChange) {
  const pm = await as(world.users.pm);
  const made = await at(pm, 'post', `/projects/${projectId}/forms`).send({
    key,
    title: { bn: 'আবেদন', en: 'Application' },
    source: { kind: 'template', templateKey: 'form_distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const versionId = made.body.data.draftVersionId as string;
  if (change) await change(versionId);
  const current = await at(pm, 'get', `/form-versions/${versionId}`);
  const published = await at(pm, 'post', `/form-versions/${versionId}/publish`).set(
    'If-Match',
    current.headers.etag as string,
  );
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return { formId: made.body.data.id as string, versionId };
}

/** An active project of the PM's program, open until the end of the century, with a published form. */
async function project(change?: DraftChange) {
  const pm = await as(world.users.pm);
  const res = await at(pm, 'post', '/projects').send({
    programId: world.a1.program,
    code: code(),
    year: 2026,
    name: { bn: 'শীতবস্ত্র', en: 'Winter' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = res.body.data.id as string;
  const form = await publishedForm(id, 'default', change);
  // the state the link needs, set directly: activation itself is proven by the lifecycle tests
  await setState(id, 'active', '2099-12-31');
  return { id, ...form };
}
const setState = (projectId: string, status: string, applyTo: string) =>
  h.db.query(`UPDATE projects SET status = $2, apply_to = $3 WHERE id = $1`, [
    projectId,
    status,
    applyTo,
  ]);

/** A file field in the first volunteer-visible section of a version (only a draft takes it). */
const withFileField: DraftChange = async (versionId) => {
  await h.db.query(
    `INSERT INTO form_fields (id, form_version_id, form_section_id, field_key, type, label_bn, label_en, sort_order, required, settings)
     SELECT gen_random_uuid(), $1, s.id, 'proof', 'file', 'প্রমাণ', 'Proof', 99, false, '{}'
     FROM form_sections s WHERE s.form_version_id = $1 AND s.visibility = 'volunteer' LIMIT 1`,
    [versionId],
  );
};
/** An official-only section with one remark field. */
const withOfficialSection: DraftChange = async (versionId) => {
  await h.db.query(
    `WITH s AS (
       INSERT INTO form_sections (id, form_version_id, key, title_bn, title_en, sort_order, visibility)
       VALUES (gen_random_uuid(), $1, 'official', 'অফিসিয়াল', 'Official', 9, 'official_only') RETURNING id)
     INSERT INTO form_fields (id, form_version_id, form_section_id, field_key, type, label_bn, label_en, sort_order, required, settings)
     SELECT gen_random_uuid(), $1, s.id, 'remark', 'short_text', 'মন্তব্য', 'Remark', 1, false, '{}' FROM s`,
    [versionId],
  );
};

async function configure(projectId: string, body: object, s?: Session) {
  return at(s ?? (await as(world.users.pm)), 'patch', `/projects/${projectId}/public-link`).send(
    body,
  );
}
async function enabled(projectId: string, formId: string) {
  const res = await configure(projectId, { enabled: true, formId });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const url = res.body.data.url as string;
  return { url, token: url.slice(url.lastIndexOf('/') + 1) };
}
const read = (token: string) => api().get(`/api/v1/public/forms/${token}`);
const submit = (token: string, body: object) =>
  api().post(`/api/v1/public/forms/${token}/applications`).send(body);

const answer = (fieldKey: string, value: unknown) => ({ fieldKey, value });
/** The mandatory answers of the distribution form, with a fresh identity and mobile. */
function answers(over: { nid?: string; mobile?: string } = {}) {
  return [
    answer('nid_or_birth_reg', { t: 'short_text', v: over.nid ?? fakeNid() }),
    answer('mobile', { t: 'phone', v: over.mobile ?? fakeMobile() }),
    answer('name', { t: 'short_text', v: 'নমুনা আবেদনকারী' }),
    answer('gender', { t: 'single_select', v: 'male' }),
    answer('father_or_husband_name', { t: 'short_text', v: 'নমুনা পিতা' }),
    answer('address', {
      t: 'bd_address',
      division_id: loc.division,
      district_id: loc.district,
      upazila_id: loc.upazila,
      union_id: loc.union,
    }),
    answer('village', { t: 'short_text', v: 'নমুনা গ্রাম' }),
  ];
}
/** The keys the distribution template gives its identity questions. */
const IDENTITY_KEYS = [
  'nid_or_birth_reg',
  'mobile',
  'name',
  'gender',
  'father_or_husband_name',
  'address',
  'village',
];
const submission = (over: { nid?: string; mobile?: string } = {}) => ({
  clientUuid: randomUUID(),
  answers: answers(over),
});
async function auditRows(entityId: string, action: string) {
  const res = await h.db.query(
    'SELECT new, actor_user_id FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
    [entityId, action],
  );
  return res.rows as { new: Record<string, unknown> | null; actor_user_id: string | null }[];
}
async function flagsOf(applicationId: string) {
  const res = await h.db.query('SELECT flags, status FROM applications WHERE id = $1', [
    applicationId,
  ]);
  return res.rows[0] as { flags: string[]; status: string };
}
async function linkSettings(projectId: string) {
  const res = await h.db.query(
    `SELECT settings FROM project_components WHERE project_id = $1 AND component_key = 'public_link'`,
    [projectId],
  );
  return res.rows.map((r) => r.settings as unknown);
}
const detail = (path: string, code: string) => expect.objectContaining({ path, code });

describe('configuring the link', () => {
  it('gives a URL with a fresh token on every enable, and no token while off', async () => {
    const p = await project();
    const first = await enabled(p.id, p.formId);
    expect(first.token).toHaveLength(43);
    expect(first.url).toBe(`http://127.0.0.1:3000/apply/${first.token}`);
    const off = await configure(p.id, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({ enabled: false, formId: null, url: null });
    expect(JSON.stringify(await linkSettings(p.id))).not.toContain('token');
    const second = await enabled(p.id, p.formId);
    expect(second.token).toHaveLength(43);
    expect(second.token).not.toBe(first.token);
    expect((await read(first.token)).status).toBe(404);
    expect((await read(second.token)).status).toBe(200);
  });

  it('refuses the PM of another program and a volunteer, leaving no audit row and no token', async () => {
    const p = await project();
    const otherPm = await account(h.db, { role: 'program_manager' });
    accounts.set(otherPm.id, otherPm);
    const byOtherPm = await configure(
      p.id,
      { enabled: true, formId: p.formId },
      await as(otherPm.id),
    );
    expect(byOtherPm.status).toBe(404);
    const byVolunteer = await configure(
      p.id,
      { enabled: true, formId: p.formId },
      await as(world.users.general),
    );
    expect([403, 404]).toContain(byVolunteer.status);
    expect(await auditRows(p.id, 'form.public_link_change')).toEqual([]);
    expect(JSON.stringify(await linkSettings(p.id))).not.toContain('token');
  });

  it("refuses another project's form, a missing form id, two form ids, an unpublished form and a form with a file field", async () => {
    const p = await project();
    const other = await project();
    const foreign = await configure(p.id, { enabled: true, formId: other.formId });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('form.not_of_project');
    const missing = await configure(p.id, { enabled: true });
    expect(missing.status).toBe(422);
    expect(missing.body.error.details).toEqual([detail('formId', 'validation.required')]);
    const two = await configure(p.id, { enabled: true, formId: p.formId, formIds: [p.formId] });
    expect(two.status).toBe(422);
    const draftOnly = await at(await as(world.users.pm), 'post', `/projects/${p.id}/forms`).send({
      key: 'second',
      title: { bn: 'দ্বিতীয়', en: 'Second' },
      source: { kind: 'blank' },
    });
    expect(draftOnly.status).toBe(201);
    const unpublished = await configure(p.id, { enabled: true, formId: draftOnly.body.data.id });
    expect(unpublished.status).toBe(422);
    expect(unpublished.body.error.code).toBe('public.form_unpublished');
    const withFile = await publishedForm(p.id, 'with_file', withFileField);
    const refused = await configure(p.id, { enabled: true, formId: withFile.formId });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('public.form_has_files');
    expect(JSON.stringify(await linkSettings(p.id))).not.toContain('token');
  });

  it('keeps the token out of the audit row and out of the setup read of an RPM', async () => {
    // the fixture project the RPM of Dhaka is placed on
    const form = await publishedForm(world.a1.id, 'public');
    await setState(world.a1.id, 'active', '2099-12-31');
    const { token } = await enabled(world.a1.id, form.formId);
    const rows = await auditRows(world.a1.id, 'form.public_link_change');
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.new)).not.toContain(token);
    expect(rows[0]!.new).toEqual({ enabled: true, formKey: 'public' });
    const components = `/projects/${world.a1.id}/components`;
    const pmRead = await at(await as(world.users.pm), 'get', components);
    expect(pmRead.status).toBe(200);
    const rpmRead = await at(await as(world.users.rpmDhaka), 'get', components);
    expect(rpmRead.status, JSON.stringify(rpmRead.body)).toBe(200);
    const linkOf = (body: { data: { componentKey: string; settings: unknown }[] }) =>
      body.data.find((c) => c.componentKey === 'public_link')?.settings;
    expect(JSON.stringify(linkOf(pmRead.body))).toContain(token);
    expect(linkOf(rpmRead.body)).toEqual({ enabled: true, form_ids: [form.formId] });
  });

  it('is only switched off by the generic component route, which drops the token and audits none', async () => {
    const p = await project();
    const { token } = await enabled(p.id, p.formId);
    // an active project keeps its photo rule, which the generic route checks on every write
    await h.db.query(
      `UPDATE project_components SET settings = '{"rule": "group"}' WHERE project_id = $1 AND component_key = 'distribution'`,
      [p.id],
    );
    const pm = await as(world.users.pm);
    const components = `/projects/${p.id}/components`;
    const generic = async (body: object) => {
      const rows = (await at(pm, 'get', components)).body.data as {
        componentKey: string;
        etag: string;
      }[];
      const etag = rows.find((c) => c.componentKey === 'public_link')!.etag;
      return at(pm, 'patch', `${components}/public_link`).set('If-Match', etag).send(body);
    };
    const repointed = await generic({ settings: { enabled: true, form_ids: [p.formId] } });
    expect(repointed.status).toBe(422);
    expect(repointed.body.error.code).toBe('public.configure_through_link');
    expect((await read(token)).status).toBe(200);
    const off = await generic({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.settings).toEqual({ enabled: false });
    expect((await read(token)).status).toBe(404);
    const rows = await h.db.query(
      `SELECT old, new FROM audit_log WHERE entity_id = $1 AND action = 'project.component_change'`,
      [p.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });

  it('refuses to publish a draft with a file field while the form is on the link', async () => {
    const p = await project();
    await enabled(p.id, p.formId);
    const pm = await as(world.users.pm);
    const next = await at(pm, 'post', `/forms/${p.formId}/versions`);
    expect(next.status, JSON.stringify(next.body)).toBe(201);
    const draftId = next.body.data.id as string;
    await withFileField(draftId);
    const current = await at(pm, 'get', `/form-versions/${draftId}`);
    const published = await at(pm, 'post', `/form-versions/${draftId}/publish`).set(
      'If-Match',
      current.headers.etag as string,
    );
    expect(published.status).toBe(422);
    expect(published.body.error.code).toBe('public.form_has_files');
  });
});

describe('reading the form', () => {
  it('answers the same 404 for a disabled link, a draft, a closed and an expired project, and a retired form', async () => {
    const off = await project();
    const { token: offToken } = await enabled(off.id, off.formId);
    await configure(off.id, { enabled: false });
    const draft = await project();
    const { token: draftToken } = await enabled(draft.id, draft.formId);
    await setState(draft.id, 'draft', '2099-12-31');
    const closed = await project();
    const { token: closedToken } = await enabled(closed.id, closed.formId);
    await setState(closed.id, 'closed', '2099-12-31');
    const past = await project();
    const { token: pastToken } = await enabled(past.id, past.formId);
    await setState(past.id, 'active', '2026-01-01');
    const early = await project();
    const { token: earlyToken } = await enabled(early.id, early.formId);
    await h.db.query(`UPDATE projects SET apply_from = '2099-01-01' WHERE id = $1`, [early.id]);
    const retired = await project();
    const { token: retiredToken } = await enabled(retired.id, retired.formId);
    await h.db.query(`UPDATE form_versions SET status = 'retired' WHERE id = $1`, [
      retired.versionId,
    ]);
    const codes = await Promise.all(
      [
        offToken,
        draftToken,
        closedToken,
        pastToken,
        earlyToken,
        retiredToken,
        'no-such-token-at-all',
      ].map(async (token) => {
        const res = await read(token);
        expect(res.status, token).toBe(404);
        return res.body.error.code as string;
      }),
    );
    expect(new Set(codes)).toEqual(new Set(['public.link_closed']));
  });

  it("shows the project's name and closing date with the volunteer-visible form, and no id of anything else", async () => {
    const p = await project(withOfficialSection);
    const { token } = await enabled(p.id, p.formId);
    const res = await read(token);
    expect(res.status).toBe(200);
    expect(res.body.data.project).toEqual({
      name: { bn: 'শীতবস্ত্র', en: 'Winter' },
      applyTo: '2099-12-31',
    });
    const sections = res.body.data.form.sections as { key: string; visibility: string }[];
    expect(sections.map((s) => s.key)).toEqual(['basic_info', 'family_income', 'address']);
    expect(sections.every((s) => s.visibility === 'volunteer')).toBe(true);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(p.id);
    expect(text).not.toContain(world.a1.program);
    expect(new Set(text.match(UUID) ?? [])).toEqual(new Set([p.formId, p.versionId]));
  });
});

describe('submitting', () => {
  it('stores a valid entry as needs_verification with the public flag, and replays by client id', async () => {
    const p = await project();
    const { token } = await enabled(p.id, p.formId);
    const body = submission();
    const res = await submit(token, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.stringMatching(UUID),
      status: 'needs_verification',
      stage: null,
    });
    const id = res.body.data.id as string;
    expect(JSON.stringify(res.body).match(UUID)).toEqual([id]);
    const row = await h.db.query(
      `SELECT status, flags, region_location_id, district_id, union_id, beneficiary_id, owner_volunteer_id,
              created_by_user_id, client_uuid, submitted_at
       FROM applications WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]).toMatchObject({
      status: 'needs_verification',
      flags: ['public_entry'],
      region_location_id: loc.division,
      district_id: loc.district,
      union_id: loc.union,
      beneficiary_id: null,
      owner_volunteer_id: null,
      created_by_user_id: null,
      client_uuid: body.clientUuid,
    });
    expect(row.rows[0].submitted_at).not.toBeNull();
    const stored = await h.db.query(
      `SELECT f.field_key FROM application_answers a JOIN form_fields f ON f.id = a.field_id
       WHERE a.application_id = $1 ORDER BY f.field_key`,
      [id],
    );
    expect(stored.rows.map((r) => r.field_key)).toEqual([
      'address',
      'father_or_husband_name',
      'gender',
      'mobile',
      'name',
      'nid_or_birth_reg',
      'village',
    ]);
    const audit = await auditRows(id, 'application.public_submitted');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_user_id).toBeNull();
    const replay = await submit(token, body);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.data).toEqual(res.body.data);
    expect(await auditRows(id, 'application.public_submitted')).toHaveLength(1);
  });

  it('keeps an entry on the version it was sent on once the next version is published', async () => {
    const p = await project();
    const { token } = await enabled(p.id, p.formId);
    const sent = await submit(token, submission());
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const id = sent.body.data.id as string;
    // the PM changes the form: the next draft with a new section title, then published
    const pm = await as(world.users.pm);
    const next = await at(pm, 'post', `/forms/${p.formId}/versions`);
    expect(next.status, JSON.stringify(next.body)).toBe(201);
    const v2 = next.body.data.id as string;
    const draft = await at(pm, 'get', `/form-versions/${v2}`);
    const sections = (draft.body.data.sections as { title: { bn: string; en: string } }[]).map(
      (s, i) => (i === 0 ? { ...s, title: { bn: 'পরিচয়', en: 'Identity' } } : s),
    );
    const saved = await at(pm, 'patch', `/form-versions/${v2}`)
      .set('If-Match', draft.headers.etag as string)
      .send({ sections });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const published = await at(pm, 'post', `/form-versions/${v2}/publish`).set(
      'If-Match',
      saved.headers.etag as string,
    );
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const row = await h.db.query('SELECT form_version_id FROM applications WHERE id = $1', [id]);
    expect(row.rows[0]).toEqual({ form_version_id: p.versionId });
    // the same link now opens the new version
    const opened = await read(token);
    expect(opened.status).toBe(200);
    expect(opened.body.data.form).toMatchObject({ id: v2, versionNo: 2 });
    expect(opened.body.data.form.sections[0].title).toEqual({ bn: 'পরিচয়', en: 'Identity' });
  });

  it('answers a known, a blocked and a repeated identity exactly like a fresh one, and flags the row', async () => {
    const p = await project();
    const { token } = await enabled(p.id, p.formId);
    const known = await beneficiary(h.db, loc);
    const blocked = await beneficiary(h.db, loc, { is_blocked: true });
    const nidOf = async (id: string) =>
      (await h.db.query('SELECT nid FROM beneficiaries WHERE id = $1', [id])).rows[0].nid as string;
    const fresh = await submit(token, submission());
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(201);
    const shape = { ...fresh.body.data, id: expect.any(String) };
    const cases: [string, { nid: string }, string[]][] = [
      ['known', { nid: await nidOf(known) }, ['public_entry', 'existing_identity']],
      [
        'blocked',
        { nid: await nidOf(blocked) },
        ['public_entry', 'existing_identity', 'identity_blocked'],
      ],
      [
        'repeated',
        { nid: await nidOf(known) },
        ['public_entry', 'existing_identity', 'identity_repeated'],
      ],
    ];
    for (const [name, over, flags] of cases) {
      const res = await submit(token, submission(over));
      expect(res.status, name).toBe(201);
      expect(res.body.data, name).toEqual(shape);
      expect(Object.keys(res.body), name).toEqual(Object.keys(fresh.body));
      expect(await flagsOf(res.body.data.id), name).toEqual({
        status: 'needs_verification',
        flags,
      });
    }
    const mobile = fakeMobile();
    expect((await submit(token, submission({ mobile }))).status).toBe(201);
    const again = await submit(token, submission({ mobile }));
    expect(again.status).toBe(201);
    expect((await flagsOf(again.body.data.id)).flags).toEqual([
      'public_entry',
      'identity_repeated',
    ]);
  });

  it('reads the identity by the questions marks under other keys: the known flag, the repeat and the address', async () => {
    // the builder writes the identity questions under keys of its own
    const renamed: DraftChange = async (versionId) => {
      await h.db.query(
        `UPDATE form_fields SET field_key = 'q_' || field_key
          WHERE form_version_id = $1 AND field_key = ANY($2::text[])`,
        [versionId, IDENTITY_KEYS],
      );
    };
    const p = await project(renamed);
    const { token } = await enabled(p.id, p.formId);
    const rekeyed = (over: { nid?: string; mobile?: string } = {}) => ({
      clientUuid: randomUUID(),
      answers: answers(over).map((a) =>
        IDENTITY_KEYS.includes(a.fieldKey) ? { ...a, fieldKey: `q_${a.fieldKey}` } : a,
      ),
    });
    const known = await beneficiary(h.db, loc);
    const nid = (await h.db.query('SELECT nid FROM beneficiaries WHERE id = $1', [known])).rows[0]
      .nid as string;
    const first = await submit(token, rekeyed({ nid }));
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect((await flagsOf(first.body.data.id)).flags).toEqual([
      'public_entry',
      'existing_identity',
    ]);
    const { rows } = await h.db.query(
      'SELECT district_id, union_id FROM applications WHERE id = $1',
      [first.body.data.id],
    );
    expect(rows[0]).toEqual({ district_id: loc.district, union_id: loc.union });
    const mobile = fakeMobile();
    expect((await submit(token, rekeyed({ mobile }))).status).toBe(201);
    const again = await submit(token, rekeyed({ mobile }));
    expect((await flagsOf(again.body.data.id)).flags).toEqual([
      'public_entry',
      'identity_repeated',
    ]);
  });

  it('names the field of an official-only answer, a missing core field and a broken address chain', async () => {
    const p = await project(withOfficialSection);
    const { token } = await enabled(p.id, p.formId);
    const official = await submit(token, {
      clientUuid: randomUUID(),
      answers: [...answers(), answer('remark', { t: 'short_text', v: 'x' })],
    });
    expect(official.status).toBe(422);
    // the public sees the volunteer-visible definition only, so an official field is unknown to it
    expect(official.body.error.details).toEqual([detail('remark', 'form.unknown_field')]);
    const missing = await submit(token, {
      clientUuid: randomUUID(),
      answers: answers().filter((a) => a.fieldKey !== 'name'),
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error.details).toEqual([detail('name', 'validation.required')]);
    const elsewhere = await locationTree(h.db);
    const broken = await submit(token, {
      clientUuid: randomUUID(),
      answers: answers().map((a) =>
        a.fieldKey === 'address'
          ? answer('address', { ...(a.value as object), union_id: elsewhere.union })
          : a,
      ),
    });
    expect(broken.status).toBe(422);
    expect(broken.body.error.details).toEqual([detail('address', 'validation.address_incomplete')]);
    const rows = await h.db.query(`SELECT 1 FROM applications WHERE project_id = $1`, [p.id]);
    expect(rows.rows).toEqual([]);
  });

  it('refuses a client id already used on another project as a validation error', async () => {
    const first = await project();
    const second = await project();
    const body = submission();
    expect((await submit((await enabled(first.id, first.formId)).token, body)).status).toBe(201);
    const clash = await submit((await enabled(second.id, second.formId)).token, {
      ...body,
      answers: answers(),
    });
    expect(clash.status).toBe(422);
    expect(clash.body.error.details).toEqual([detail('clientUuid', 'validation.failed')]);
  });

  it('answers the closed-link 404 to a valid submission once the project has closed', async () => {
    const p = await project();
    const { token } = await enabled(p.id, p.formId);
    await setState(p.id, 'closed', '2099-12-31');
    const res = await submit(token, submission());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('public.link_closed');
  });
});

describe('the public-form rate class', () => {
  let real: AuthHarness;
  beforeAll(async () => {
    real = await authHarness({ realRateLimits: true });
  });
  afterAll(async () => real.close());

  it('allows 20 reads and 20 submits an hour from one address, then answers 429 with Retry-After', async () => {
    const path = `/api/v1/public/forms/${'x'.repeat(43)}`;
    const calls = {
      read: () => request(real.server()).get(path),
      submit: () =>
        request(real.server())
          .post(`${path}/applications`)
          .send({ clientUuid: randomUUID(), answers: [] }),
    };
    for (const [name, call] of Object.entries(calls)) {
      const statuses: number[] = [];
      let retryAfter = 0;
      for (let i = 0; i < 21; i += 1) {
        const res = await call();
        statuses.push(res.status);
        if (res.status === 429) retryAfter = Number(res.headers['retry-after']);
      }
      expect(
        statuses.slice(0, 20).every((s) => s === 404),
        name,
      ).toBe(true);
      expect(statuses[20], name).toBe(429);
      expect(retryAfter, name).toBeGreaterThan(0);
    }
  });
});
