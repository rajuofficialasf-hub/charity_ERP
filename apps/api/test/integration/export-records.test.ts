import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExportRunner } from '../../src/jobs/export-run';
import { accessWorld } from './support/access-fixtures';
import { applicationRow } from './support/applications';
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

// A record printed whole: the beneficiary's 360° profile and one application, each as the person
// may read and export it at the moment they ask; the PDF never holds what their export may not.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

/** The pages the job handed to the browser, newest last. */
const pages: string[] = [];
let printer: ExportRunner;

let person: { id: string; name: string; nid: string };
let firstApp: string;
let projectNames: string[];

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  printer = new ExportRunner(
    h.container.prisma,
    h.container.storage,
    h.container.clock,
    h.container.exportRows,
    h.container.exportQuestions,
    {
      render: async (page) => {
        pages.push(page);
        return h.container.pdf.render(page);
      },
    },
    { events: h.container.exportEvents },
  );
  // a volunteer's question and an official-only remark on the first project's form
  await h.db.query(
    `WITH s AS (
       INSERT INTO form_sections (id, form_version_id, key, title_bn, title_en, sort_order, visibility)
       VALUES (gen_random_uuid(), $1, 'home', 'বাড়ি', 'Home', 1, 'volunteer') RETURNING id)
     INSERT INTO form_fields (id, form_version_id, form_section_id, field_key, type, label_bn, label_en, sort_order, required, settings)
     SELECT gen_random_uuid(), $1, s.id, 'home_note', 'short_text', 'বাড়ির বর্ণনা', 'About the home', 1, false, '{}' FROM s`,
    [world.a1.formVersion],
  );
  await h.db.query(
    `WITH s AS (
       INSERT INTO form_sections (id, form_version_id, key, title_bn, title_en, sort_order, visibility)
       VALUES (gen_random_uuid(), $1, 'official', 'অফিসিয়াল', 'Official', 9, 'official_only') RETURNING id)
     INSERT INTO form_fields (id, form_version_id, form_section_id, field_key, type, label_bn, label_en, sort_order, required, settings)
     SELECT gen_random_uuid(), $1, s.id, 'remark', 'short_text', 'অফিসের মন্তব্য', 'Office remark', 1, false, '{}' FROM s`,
    [world.a1.formVersion],
  );
  const id = await f.beneficiary(h.db, world.dhaka);
  const row = await h.db.query<{ name: string; nid: string }>(
    'SELECT name, nid FROM beneficiaries WHERE id = $1',
    [id],
  );
  person = { id, ...row.rows[0]! };
  firstApp = await applicationRow(h.db, {
    projectId: world.a1.id,
    versionId: world.a1.formVersion,
    loc: world.dhaka,
    status: 'submitted',
    beneficiaryId: person.id,
    answers: {
      home_note: { t: 'short_text', v: 'নদীর পাড়ে টিনের ঘর' },
      remark: { t: 'short_text', v: 'গোপন অফিস নোট' },
    },
    over: { app_no: 'WC-2026-00001', submitted_at: new Date() },
  });
  await applicationRow(h.db, {
    projectId: world.a2.id,
    versionId: world.a2.formVersion,
    loc: world.dhaka,
    status: 'submitted',
    beneficiaryId: person.id,
    over: { app_no: 'IF-2026-00002', submitted_at: new Date() },
  });
  await h.db.query(`UPDATE projects SET name_bn = $2 WHERE id = $1`, [
    world.a1.id,
    'শীতবস্ত্র 2026',
  ]);
  await h.db.query(`UPDATE projects SET name_bn = $2 WHERE id = $1`, [world.a2.id, 'ইফতার 2026']);
  projectNames = ['শীতবস্ত্র 2026', 'ইফতার 2026'];
});
afterAll(async () => h.close());

/** Asks for a record's PDF, runs its job and answers the job and the page it printed. */
async function printed(
  userId: string,
  path: string,
): Promise<{ job: Record<string, unknown>; page: string; s: Session }> {
  const s = await as(userId);
  const made = await at(s, 'post', path);
  expect(made.status, JSON.stringify(made.body)).toBe(202);
  const before = pages.length;
  await printer.run(made.body.data.id as string, 0);
  const job = (await at(s, 'get', `/exports/${made.body.data.id}`)).body.data as Record<
    string,
    unknown
  >;
  expect(job.status).toBe('done');
  expect(pages.length).toBe(before + 1);
  return { job, page: pages.at(-1)!, s };
}

describe('the 360° profile as a PDF', () => {
  it('prints the person with their applications across projects', async () => {
    const { job, page, s } = await printed(world.users.pm, `/beneficiaries/${person.id}/pdf`);
    expect(job).toMatchObject({ kind: 'beneficiary_profile', format: 'pdf', rowCount: 1 });
    expect(page).toContain(person.name);
    expect(page).toContain('WC-2026-00001');
    expect(page).toContain('IF-2026-00002');
    for (const name of projectNames) expect(page).toContain(name);
    const file = await at(s, 'get', `/files/${job.fileId as string}/content`).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(
      Buffer.from(file.body as Buffer)
        .subarray(0, 5)
        .toString('latin1'),
    ).toBe('%PDF-');
  });

  it('holds the NID only for a holder of the identity export, and audits that as sensitive', async () => {
    const withNid = await printed(world.users.rpmDhaka, `/beneficiaries/${person.id}/pdf`);
    expect(withNid.page).toContain(person.nid);
    expect(withNid.job.sensitive).toBe(true);
    const audit = await h.db.query<{ new: Record<string, unknown> }>(
      `SELECT new FROM audit_log WHERE action = 'export.requested' AND entity_id = $1`,
      [withNid.job.id],
    );
    expect(audit.rows[0]?.new).toMatchObject({
      kind: 'beneficiary_profile',
      format: 'pdf',
      recordId: person.id,
      sensitive: true,
      classes: ['beneficiary.nid'],
    });
    const without = await printed(world.users.executive, `/beneficiaries/${person.id}/pdf`);
    expect(without.page).toContain(person.name);
    expect(without.page).not.toContain(person.nid);
    expect(without.job.sensitive).toBe(false);
  });

  it('keeps no copy of the record on the job once it ends', async () => {
    const { job } = await printed(world.users.rpmDhaka, `/beneficiaries/${person.id}/pdf`);
    const stored = await h.db.query<{ access: { record: Record<string, unknown> } }>(
      'SELECT access FROM export_jobs WHERE id = $1',
      [job.id],
    );
    expect(stored.rows[0]!.access.record).toMatchObject({
      kind: 'beneficiary_profile',
      view: null,
      classes: ['beneficiary.nid'],
    });
  });
});

describe('a record job the sweep ends', () => {
  it('keeps no copy of the record once the sweep fails it', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', `/beneficiaries/${person.id}/pdf`);
    expect(made.status).toBe(202);
    await h.db.query(
      `UPDATE export_jobs SET created_at = now() - interval '31 minutes' WHERE id = $1`,
      [made.body.data.id],
    );
    await h.container.exportSweep.run();
    const stored = await h.db.query<{
      status: string;
      access: { record: Record<string, unknown> };
    }>('SELECT status, access FROM export_jobs WHERE id = $1', [made.body.data.id]);
    expect(stored.rows[0]).toMatchObject({
      status: 'failed',
      access: { record: { kind: 'beneficiary_profile', view: null, classes: ['beneficiary.nid'] } },
    });
  });
});

describe('one application as a PDF', () => {
  it('prints its number, project and answers by section, the official section with the forms export', async () => {
    const { job, page } = await printed(world.users.rpmDhaka, `/applications/${firstApp}/pdf`);
    expect(job).toMatchObject({ kind: 'application', sensitive: true });
    expect(page).toContain('WC-2026-00001');
    expect(page).toContain(projectNames[0]);
    expect(page).toContain('নদীর পাড়ে টিনের ঘর');
    expect(page).toContain('গোপন অফিস নোট');
  });

  it('leaves the official section out for a holder of the list export alone', async () => {
    const { job, page } = await printed(world.users.executive, `/applications/${firstApp}/pdf`);
    expect(page).toContain('নদীর পাড়ে টিনের ঘর');
    expect(page).not.toContain('গোপন অফিস নোট');
    expect(page).not.toContain('অফিসের মন্তব্য');
    expect(job.sensitive).toBe(false);
  });
});

describe('who may print a record', () => {
  it('refuses a person without the export permission of the record', async () => {
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'post', `/applications/${firstApp}/pdf`)).status).toBe(403);
    expect((await at(volunteer, 'post', `/beneficiaries/${person.id}/pdf`)).status).toBe(403);
  });

  it('answers 404 to an official outside the region, for both records, and starts no job', async () => {
    const outside = await as(world.users.rpmRangpur);
    expect((await at(outside, 'post', `/beneficiaries/${person.id}/pdf`)).status).toBe(404);
    expect((await at(outside, 'post', `/applications/${firstApp}/pdf`)).status).toBe(404);
    expect((await at(outside, 'post', `/applications/${randomUUID()}/pdf`)).status).toBe(404);
    const jobs = await h.db.query('SELECT 1 FROM export_jobs WHERE requested_by = $1', [
      world.users.rpmRangpur,
    ]);
    expect(jobs.rowCount).toBe(0);
  });
});

describe('the download of a record PDF', () => {
  /** A fresh RPM of Dhaka, so a change to their account touches no other test. */
  async function official(): Promise<string> {
    const a = await account(h.db, { role: 'regional_program_manager' });
    accounts.set(a.id, a);
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), world.a2.id, world.dhaka.division, a.id],
    );
    return a.id;
  }
  const downloads = async (fileId: string) =>
    (
      await h.db.query(
        `SELECT 1 FROM audit_log WHERE action = 'file.download_sensitive' AND entity_id = $1`,
        [fileId],
      )
    ).rowCount;

  it('audits each download of a profile holding the NID, refuses everyone else, and the requester who lost a permission', async () => {
    const me = await official();
    const { job, s } = await printed(me, `/beneficiaries/${person.id}/pdf`);
    const fileId = job.fileId as string;
    expect(job.sensitive).toBe(true);
    expect((await at(s, 'get', `/files/${fileId}/content`)).status).toBe(200);
    expect(await downloads(fileId)).toBe(1);
    expect((await at(await as(world.users.head), 'get', `/files/${fileId}/content`)).status).toBe(
      404,
    );
    // an executive keeps the journey report but not the identity numbers' export
    await h.db.query(`UPDATE user_roles SET role_key = 'project_executive' WHERE user_id = $1`, [
      me,
    ]);
    expect((await at(s, 'get', `/files/${fileId}/content`)).status).toBe(404);
    // without any role the journey report is gone too
    await h.db.query('DELETE FROM user_roles WHERE user_id = $1', [me]);
    expect((await at(s, 'get', `/files/${fileId}/content`)).status).toBe(404);
    expect(await downloads(fileId)).toBe(1);
  });

  it('downloads a record PDF without protected fields with no trace of its own', async () => {
    const { job, s } = await printed(world.users.executive, `/applications/${firstApp}/pdf`);
    expect(job.sensitive).toBe(false);
    expect((await at(s, 'get', `/files/${job.fileId as string}/content`)).status).toBe(200);
    expect(await downloads(job.fileId as string)).toBe(0);
  });
});
