import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExportRunner } from '../../src/jobs/export-run';
import { exportDownload } from '../../src/exports/download';
import { filterHeading } from '../../src/exports/heading';
import { ExportSweep } from '../../src/jobs/export-sweep';
import { ExportsService } from '../../src/exports/service';
import type { BatchCursor, ExportRows, FrozenList } from '../../src/exports/rows';
import type { StorageDriver } from '../../src/storage/types';
import { accessWorld } from './support/access-fixtures';
import { principalOf } from './support/applications';
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

// The export API and its job: a person asks with the columns they may export, follows the job,
// and finds a file of exactly the frozen rows; every refusal comes before any work starts.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  for (let i = 0; i < 3; i += 1) {
    const person = await f.beneficiary(h.db, world.dhaka);
    await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: person });
  }
});
afterAll(async () => h.close());

/** The text of a stored export file. */
async function contentOf(fileId: string): Promise<Buffer> {
  const file = await h.db.query<{ bucket: string; object_key: string }>(
    'SELECT bucket, object_key FROM files WHERE id = $1',
    [fileId],
  );
  const body = await h.container.storage.get('exports', file.rows[0]!.object_key);
  const chunks: Buffer[] = [];
  for await (const chunk of body as Readable) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const runner = () => h.container.exportRunner;

describe('the export columns', () => {
  it('offer a person only the columns they may export', async () => {
    const rpm = await at(
      await as(world.users.rpmDhaka),
      'get',
      '/exports/columns?list=beneficiaries',
    );
    expect(rpm.status, JSON.stringify(rpm.body)).toBe(200);
    const ids = (rpm.body.data.columns as { id: string }[]).map((c) => c.id);
    expect(ids).toContain('name');
    expect(ids).toContain('nid');
    expect(rpm.body.data.columns[0]).toMatchObject({
      id: 'name',
      label: { bn: 'নাম', en: 'Name' },
      group: 'list',
      onScreen: true,
      kind: 'text',
    });
    const executive = await at(
      await as(world.users.executive),
      'get',
      '/exports/columns?list=beneficiaries',
    );
    expect((executive.body.data.columns as { id: string }[]).map((c) => c.id)).not.toContain('nid');
  });

  it('give a project’s form questions for its application list, and refuse a project out of reach', async () => {
    const rpm = await at(
      await as(world.users.rpmDhaka),
      'get',
      `/exports/columns?list=applications&projectId=${world.a1.id}`,
    );
    expect(rpm.status, JSON.stringify(rpm.body)).toBe(200);
    expect((rpm.body.data.columns as { id: string }[]).map((c) => c.id)).toContain('app_no');
    const outsider = await at(
      await as(world.users.outsider),
      'get',
      `/exports/columns?list=applications&projectId=${world.a1.id}`,
    );
    expect(outsider.status).toBe(404);
    const missing = await at(
      await as(world.users.rpmDhaka),
      'get',
      '/exports/columns?list=applications',
    );
    expect(missing.status).toBe(422);
  });
});

describe('an export', () => {
  it('runs as a job into a CSV file of the frozen rows, and the person reads it back', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['nid', 'name'],
      filters: { divisionId: world.dhaka.division },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(202);
    const job = made.body.data as { id: string; status: string; rowsTotal: number };
    expect(job).toMatchObject({
      status: 'queued',
      rowsTotal: 3,
      kind: 'beneficiaries',
      format: 'csv',
    });
    await runner().run(job.id, 0);
    const done = await at(s, 'get', `/exports/${job.id}`);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({
      status: 'done',
      rowCount: 3,
      rowsDone: 3,
      sensitive: true,
    });
    const text = (await contentOf(done.body.data.fileId))
      .subarray(3)
      .toString('utf8')
      .split('\r\n');
    // the columns in the file's fixed order: the list's own first, then the details
    expect(text[0]).toBe('নাম,NID নম্বর');
    expect(text.length).toBe(5);
    const listed = await at(s, 'get', '/exports');
    expect((listed.body.data as { id: string }[]).map((j) => j.id)).toContain(job.id);
  });

  it('writes the request with its filters, columns and row count to the audit log', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'xlsx',
      columns: ['name'],
      filters: {},
    });
    expect(made.status).toBe(202);
    const rows = await h.db.query<{ new: Record<string, unknown> }>(
      `SELECT new FROM audit_log WHERE action = 'export.requested' AND entity_id = $1`,
      [made.body.data.id],
    );
    expect(rows.rows[0]?.new).toMatchObject({
      kind: 'beneficiaries',
      format: 'xlsx',
      columns: ['name'],
      filters: {},
      sensitive: false,
    });
    expect(typeof rows.rows[0]?.new.rowCount).toBe('number');
  });

  it('is refused to a volunteer, for a column the person may not export, and for an unknown column', async () => {
    const volunteer = await at(await as(world.users.general), 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    expect(volunteer.status).toBe(403);
    const executive = await at(await as(world.users.executive), 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'nid'],
      filters: {},
    });
    expect(executive.status).toBe(403);
    const unknown = await at(await as(world.users.rpmDhaka), 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'nope'],
      filters: {},
    });
    expect(unknown.status).toBe(422);
    const outsider = await at(await as(world.users.outsider), 'post', '/exports').send({
      kind: 'applications',
      format: 'csv',
      columns: ['app_no'],
      filters: {},
      projectId: world.a1.id,
    });
    expect(outsider.status).toBe(404);
    const jobs = await h.db.query('SELECT 1 FROM export_jobs WHERE requested_by = $1', [
      world.users.outsider,
    ]);
    expect(jobs.rowCount).toBe(0);
  });

  it('is the requester’s alone to follow', async () => {
    const mine = await at(await as(world.users.rpmDhaka), 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    const other = await as(world.users.head);
    expect((await at(other, 'get', `/exports/${mine.body.data.id}`)).status).toBe(404);
    const theirs = await at(other, 'get', '/exports');
    expect((theirs.body.data as { id: string }[]).map((j) => j.id)).not.toContain(
      mine.body.data.id,
    );
  });

  it('allows three waiting exports a person, not counting one stuck past its time', async () => {
    const official = await account(h.db, { role: 'regional_program_manager' });
    accounts.set(official.id, official);
    const s = await login(h, official);
    const ask = () =>
      at(s, 'post', '/exports').send({
        kind: 'beneficiaries',
        format: 'csv',
        columns: ['name'],
        filters: {},
      });
    for (let i = 0; i < 3; i += 1) expect((await ask()).status).toBe(202);
    const fourth = await ask();
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('export.running_limit');
    await h.db.query(
      `UPDATE export_jobs SET created_at = now() - interval '31 minutes'
        WHERE id = (SELECT id FROM export_jobs WHERE requested_by = $1 ORDER BY created_at LIMIT 1)`,
      [official.id],
    );
    expect((await ask()).status).toBe(202);
  });
});

describe('the limits of an export', () => {
  const small = () =>
    new ExportsService(
      h.container.prisma,
      h.container.audit,
      h.container.jobs,
      h.container.clock,
      h.container.exportRows,
      h.container.exportQuestions,
      h.container.exportRecords,
      { maxRows: 4, maxPdfRows: 2, maxRunning: 50 },
    );

  it('refuses more rows than a file may hold, and more than a PDF list may', async () => {
    const official = await account(h.db, { role: 'regional_program_manager' });
    const principal = await principalOf(h.db, official.id);
    for (let i = 0; i < 5; i += 1) await f.beneficiary(h.db, world.rangpur);
    await expect(
      small().request(
        principal,
        { kind: 'beneficiaries', format: 'csv', columns: ['name'], filters: {} },
        'bn',
      ),
    ).rejects.toMatchObject({ code: 'export.too_many_rows', status: 422 });
    await expect(
      small().request(
        principal,
        {
          kind: 'beneficiaries',
          format: 'pdf',
          columns: ['name'],
          filters: { divisionId: world.dhaka.division },
        },
        'bn',
      ),
    ).rejects.toMatchObject({ code: 'export.pdf_too_many_rows', status: 422 });
  });

  it('ends failed, with no file row and no object left, when the storage write fails on its last attempt', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    const removed: string[] = [];
    const failing: StorageDriver = {
      ...h.container.storage,
      name: h.container.storage.name,
      put: async (_bucket, _key, body) => {
        body.resume();
        throw new Error('disk full');
      },
      remove: async (_bucket, key) => {
        removed.push(key);
      },
    };
    const run = new ExportRunner(
      h.container.prisma,
      failing,
      h.container.clock,
      h.container.exportRows,
      h.container.exportQuestions,
      h.container.pdf,
    );
    await run.run(made.body.data.id, 2);
    const job = await at(s, 'get', `/exports/${made.body.data.id}`);
    expect(job.body.data).toMatchObject({
      status: 'failed',
      errorCode: 'export.failed',
      fileId: null,
    });
    expect(removed.length).toBeGreaterThan(0);
    const files = await h.db.query(
      `SELECT 1 FROM files WHERE kind = 'export' AND object_key LIKE $1`,
      [`%${made.body.data.id}%`],
    );
    expect(files.rowCount).toBe(0);
  });

  it('leaves an earlier attempt to be retried, and runs a finished job no second time', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    const failing: StorageDriver = {
      ...h.container.storage,
      name: h.container.storage.name,
      put: async (_bucket, _key, body) => {
        body.resume();
        throw new Error('network');
      },
    };
    const run = new ExportRunner(
      h.container.prisma,
      failing,
      h.container.clock,
      h.container.exportRows,
      h.container.exportQuestions,
      h.container.pdf,
    );
    await expect(run.run(made.body.data.id, 0)).rejects.toThrow();
    expect((await at(s, 'get', `/exports/${made.body.data.id}`)).body.data.status).toBe('running');
    await runner().run(made.body.data.id, 1);
    const done = await at(s, 'get', `/exports/${made.body.data.id}`);
    expect(done.body.data.status).toBe('done');
    await runner().run(made.body.data.id, 2);
    const files = await h.db.query(`SELECT 1 FROM files WHERE id = $1`, [done.body.data.fileId]);
    expect(files.rowCount).toBe(1);
    expect(randomUUID()).not.toBe(made.body.data.id);
  });
});

describe('the rows of an export job', () => {
  /** A job of the given request, made through the API by the region's RPM. */
  async function job(body: Record<string, unknown>): Promise<{ s: Session; id: string }> {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send(body);
    expect(made.status, JSON.stringify(made.body)).toBe(202);
    return { s, id: made.body.data.id as string };
  }
  const runnerWith = (rows: ExportRows, limits: { maxRows?: number; batchRows?: number }) =>
    new ExportRunner(
      h.container.prisma,
      h.container.storage,
      h.container.clock,
      rows,
      h.container.exportQuestions,
      h.container.pdf,
      { limits },
    );

  it('writes the progress after each batch and stops at the row limit even when rows were added later', async () => {
    const { s, id } = await job({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: { divisionId: world.dhaka.division },
    });
    // rows added after the count: the job still writes no more than its limit
    await f.beneficiary(h.db, world.dhaka);
    const progress: number[] = [];
    const real = h.container.exportRows;
    const watched = {
      batch: async (frozen: FrozenList, after: BatchCursor | null, size: number) => {
        const row = await h.db.query<{ rows_done: number }>(
          'SELECT rows_done FROM export_jobs WHERE id = $1',
          [id],
        );
        progress.push(row.rows[0]!.rows_done);
        return real.batch(frozen, after, size);
      },
    } as unknown as ExportRows;
    await runnerWith(watched, { maxRows: 3, batchRows: 1 }).run(id, 0);
    expect(progress).toEqual([0, 1, 2]);
    const done = (await at(s, 'get', `/exports/${id}`)).body.data;
    expect(done).toMatchObject({ status: 'done', rowCount: 3, rowsDone: 3 });
    const lines = (await contentOf(done.fileId)).toString('utf8').trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
  });

  it('writes a row that the score order brings round twice only once', async () => {
    const { s, id } = await job({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    const row = (name: string) => ({ id: randomUUID(), cells: { name }, classes: [] });
    const first = row('প্রথম');
    const second = row('দ্বিতীয়');
    const batches = [
      { rows: [first], next: { id: first.id } },
      { rows: [first, second], next: null },
    ];
    const repeating = { batch: async () => batches.shift()! } as unknown as ExportRows;
    await runnerWith(repeating, {}).run(id, 0);
    const done = (await at(s, 'get', `/exports/${id}`)).body.data;
    expect(done).toMatchObject({ status: 'done', rowCount: 2 });
    const lines = (await contentOf(done.fileId))
      .subarray(3)
      .toString('utf8')
      .trimEnd()
      .split('\r\n');
    expect(lines).toEqual(['নাম', 'প্রথম', 'দ্বিতীয়']);
  });

  it('holds the header row when no row matches', async () => {
    const { s, id } = await job({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'ben_no'],
      filters: { q: 'কোনোনামনেই' },
    });
    await runner().run(id, 0);
    const done = (await at(s, 'get', `/exports/${id}`)).body.data;
    expect(done).toMatchObject({ status: 'done', rowCount: 0 });
    const file = await h.db.query<{ size_bytes: string; virus_scan: string; source: string }>(
      'SELECT size_bytes, virus_scan, source FROM files WHERE id = $1',
      [done.fileId],
    );
    expect(Number(file.rows[0]!.size_bytes)).toBeGreaterThan(0);
    expect(file.rows[0]).toMatchObject({ virus_scan: 'clean', source: 'system' });
    expect((await contentOf(done.fileId)).subarray(3).toString('utf8')).toBe('নাম,BEN নম্বর\r\n');
  });

  it('prints a list as a PDF table and an application list as a workbook', async () => {
    const pdf = await job({
      kind: 'beneficiaries',
      format: 'pdf',
      columns: ['name', 'ben_no'],
      filters: { divisionId: world.dhaka.division },
    });
    await runner().run(pdf.id, 0);
    const printed = (await at(pdf.s, 'get', `/exports/${pdf.id}`)).body.data;
    expect(printed.status).toBe('done');
    expect((await contentOf(printed.fileId)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const book = await job({
      kind: 'applications',
      format: 'xlsx',
      columns: ['status', 'app_no'],
      filters: {},
      projectId: world.a1.id,
    });
    await runner().run(book.id, 0);
    const written = (await at(book.s, 'get', `/exports/${book.id}`)).body.data;
    expect(written).toMatchObject({ status: 'done', rowCount: 3, columns: ['app_no', 'status'] });
    // a workbook is a zip
    expect((await contentOf(written.fileId)).subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

describe('what an export keeps to itself', () => {
  it('writes the rows and columns frozen at the request, though the person lost the permission since', async () => {
    const official = await account(h.db, { role: 'regional_program_manager' });
    accounts.set(official.id, official);
    // the region the official holds: Dhaka, through an area of a project
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), world.a2.id, world.dhaka.division, official.id],
    );
    const s = await login(h, official);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'nid'],
      filters: { divisionId: world.dhaka.division },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(202);
    // every role taken away before the job runs
    await h.db.query('DELETE FROM user_roles WHERE user_id = $1', [official.id]);
    await runner().run(made.body.data.id, 0);
    const done = (await at(s, 'get', `/exports/${made.body.data.id}`)).body.data;
    expect(done.status).toBe('done');
    const lines = (await contentOf(done.fileId))
      .subarray(3)
      .toString('utf8')
      .trimEnd()
      .split('\r\n');
    expect(lines[0]).toBe('নাম,NID নম্বর');
    const nids = await h.db.query<{ nid: string }>(
      `SELECT nid FROM beneficiaries WHERE division_id = $1 AND nid IS NOT NULL`,
      [world.dhaka.division],
    );
    expect(
      lines
        .slice(1)
        .map((l) => l.split(',')[1])
        .sort(),
    ).toEqual(nids.rows.map((n) => n.nid).sort());
  });

  it('keeps one file when two attempts of a job run at once', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    await Promise.all([runner().run(made.body.data.id, 0), runner().run(made.body.data.id, 1)]);
    const done = (await at(s, 'get', `/exports/${made.body.data.id}`)).body.data;
    expect(done.status).toBe('done');
    const files = await h.db.query<{ id: string }>(
      `SELECT id FROM files WHERE kind = 'export' AND object_key LIKE $1`,
      [`%${made.body.data.id}%`],
    );
    expect(files.rows.map((r) => r.id)).toEqual([done.fileId]);
    expect((await contentOf(done.fileId)).length).toBeGreaterThan(3);
  });

  it('fails at once, without retries, a job whose stored export cannot be read', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    await h.db.query(`UPDATE export_jobs SET access = '{"list":{}}' WHERE id = $1`, [
      made.body.data.id,
    ]);
    await runner().run(made.body.data.id, 0);
    expect((await at(s, 'get', `/exports/${made.body.data.id}`)).body.data).toMatchObject({
      status: 'failed',
      errorCode: 'export.failed',
    });
  });

  it('prints every filter in the PDF heading, and a project by name only where it reached rows', async () => {
    const project = await h.db.query<{ name_bn: string }>(
      'SELECT name_bn FROM projects WHERE id = $1',
      [world.b1.id],
    );
    const heading = (
      rowCount: number,
      projectId: string | null,
      filters: Record<string, unknown>,
    ) =>
      filterHeading(h.container.prisma, {
        list: 'beneficiaries',
        filters,
        projectId,
        rowCount,
        locale: 'bn',
      });
    const outside = await heading(0, null, { projectId: world.b1.id, year: 2026, blocked: 'true' });
    expect(outside).not.toContain(project.rows[0]!.name_bn);
    expect(outside).toContain('বছর: 2026');
    expect(outside).toContain('ব্লক করা: হ্যাঁ');
    expect(await heading(2, null, { projectId: world.b1.id })).toContain(project.rows[0]!.name_bn);
    expect(await heading(0, world.b1.id, {})).toContain(project.rows[0]!.name_bn);
  });
});

describe('the download of an export', () => {
  /** A fresh RPM of Dhaka, so a change to their account touches no other test. */
  async function official(): Promise<{ id: string; s: Session }> {
    const a = await account(h.db, { role: 'regional_program_manager' });
    accounts.set(a.id, a);
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), world.a2.id, world.dhaka.division, a.id],
    );
    return { id: a.id, s: await login(h, a) };
  }
  /** A finished export of the Dhaka beneficiaries with the given columns. */
  async function finished(s: Session, columns: string[]): Promise<{ id: string; fileId: string }> {
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns,
      filters: { divisionId: world.dhaka.division },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(202);
    await runner().run(made.body.data.id, 0);
    const done = (await at(s, 'get', `/exports/${made.body.data.id}`)).body.data;
    expect(done.status).toBe('done');
    return { id: done.id, fileId: done.fileId };
  }
  const audits = async (action: string, fileId: string) =>
    (
      await h.db.query('SELECT 1 FROM audit_log WHERE action = $1 AND entity_id = $2', [
        action,
        fileId,
      ])
    ).rowCount;

  it('streams the file to its requester alone, as an attachment named by the list and the day', async () => {
    const me = await official();
    const job = await finished(me.s, ['name']);
    const got = await at(me.s, 'get', `/files/${job.fileId}/content`);
    expect(got.status).toBe(200);
    expect(got.headers['content-disposition']).toMatch(
      /^attachment; filename="beneficiaries-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    // the text after the byte-order mark
    expect(got.text.slice(1).split('\r\n')[0]).toBe('নাম');
    // a plain file's download leaves no trace of its own
    expect(await audits('file.download_sensitive', job.fileId)).toBe(0);
    // the Department Head holds every permission, and still reads only their own exports
    expect(
      (await at(await as(world.users.head), 'get', `/files/${job.fileId}/content`)).status,
    ).toBe(404);
  });

  it('audits each download of a file with protected fields, and refuses it once the permission is gone', async () => {
    const me = await official();
    const job = await finished(me.s, ['name', 'nid']);
    expect((await at(me.s, 'get', `/files/${job.fileId}/content`)).status).toBe(200);
    expect(await audits('file.download_sensitive', job.fileId)).toBe(1);
    // an executive keeps the list's export but not the identity numbers'
    await h.db.query(`UPDATE user_roles SET role_key = 'project_executive' WHERE user_id = $1`, [
      me.id,
    ]);
    const again = await at(me.s, 'get', `/files/${job.fileId}/content`);
    expect(again.status).toBe(404);
    const principal = await principalOf(h.db, me.id);
    await expect(
      exportDownload(h.container.prisma, h.container.access, principal, job.fileId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('has no thumbnail, and answers 404 without a trace when its object is missing', async () => {
    const me = await official();
    const job = await finished(me.s, ['name', 'nid']);
    expect((await at(me.s, 'get', `/files/${job.fileId}/content?variant=small`)).status).toBe(404);
    const file = await h.db.query<{ object_key: string }>(
      'SELECT object_key FROM files WHERE id = $1',
      [job.fileId],
    );
    await h.container.storage.remove('exports', file.rows[0]!.object_key);
    expect((await at(me.s, 'get', `/files/${job.fileId}/content`)).status).toBe(404);
    expect(await audits('file.download_sensitive', job.fileId)).toBe(0);
  });

  it('is refused to a requester whose account is no longer active', async () => {
    const me = await official();
    const job = await finished(me.s, ['name']);
    await h.db.query(`UPDATE users SET state = 'blocked' WHERE id = $1`, [me.id]);
    const principal = await principalOf(h.db, me.id);
    await expect(
      exportDownload(h.container.prisma, h.container.access, principal, job.fileId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('tells the requester, in their inbox, that the file is ready or that it failed', async () => {
    const me = await official();
    const job = await finished(me.s, ['name']);
    const notices = await h.db.query<{ template_key: string; params: Record<string, unknown> }>(
      `SELECT template_key, params FROM notifications WHERE user_id = $1 AND template_key LIKE 'export%'`,
      [me.id],
    );
    expect(notices.rows).toHaveLength(1);
    expect(notices.rows[0]).toMatchObject({
      template_key: 'export_ready',
      params: { jobId: job.id },
    });
    const inbox = await at(me.s, 'get', '/notifications');
    expect(JSON.stringify(inbox.body)).toContain('/account/exports');
  });
});

describe('the daily export sweep', () => {
  const sweepAt = (days: number) =>
    new ExportSweep(
      h.container.prisma,
      h.container.storage,
      { now: () => new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
      h.container.logger,
      h.container.exportEvents,
    );

  it('fails a job stuck past its time, tells its requester, and changes nothing more when run again', async () => {
    const official = await account(h.db, { role: 'regional_program_manager' });
    accounts.set(official.id, official);
    const s = await login(h, official);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    await h.db.query(
      `UPDATE export_jobs SET status = 'running', created_at = now() - interval '31 minutes' WHERE id = $1`,
      [made.body.data.id],
    );
    expect((await sweepAt(0).run()).timedOut).toBeGreaterThanOrEqual(1);
    expect((await at(s, 'get', `/exports/${made.body.data.id}`)).body.data).toMatchObject({
      status: 'failed',
      errorCode: 'export.timed_out',
    });
    const notices = await h.db.query(
      'SELECT 1 FROM notifications WHERE user_id = $1 AND template_key = $2',
      [official.id, 'export_failed'],
    );
    expect(notices.rowCount).toBe(1);
    expect(await sweepAt(0).run()).toMatchObject({ timedOut: 0 });
  });

  it('deletes a file past its keep time, keeps the job, and answers its requester 410 and anyone else 404', async () => {
    const s = await as(world.users.rpmDhaka);
    const made = await at(s, 'post', '/exports').send({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    await runner().run(made.body.data.id, 0);
    const done = (await at(s, 'get', `/exports/${made.body.data.id}`)).body.data;
    const file = await h.db.query<{ object_key: string }>(
      'SELECT object_key FROM files WHERE id = $1',
      [done.fileId],
    );
    expect((await sweepAt(31).run()).expired).toBeGreaterThanOrEqual(1);
    expect(await h.container.storage.stat('exports', file.rows[0]!.object_key)).toBeNull();
    expect((await at(s, 'get', `/exports/${done.id}`)).body.data.status).toBe('done');
    const gone = await at(s, 'get', `/files/${done.fileId}/content`);
    expect(gone.status).toBe(410);
    expect(gone.body.error.code).toBe('export.expired');
    expect(
      (await at(await as(world.users.head), 'get', `/files/${done.fileId}/content`)).status,
    ).toBe(404);
    expect(await sweepAt(31).run()).toMatchObject({ expired: 0 });
  });

  it('carries on past a file whose object cannot be removed, and leaves that file for the next day', async () => {
    const s = await as(world.users.rpmDhaka);
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const made = await at(s, 'post', '/exports').send({
        kind: 'beneficiaries',
        format: 'csv',
        columns: ['name'],
        filters: {},
      });
      await runner().run(made.body.data.id, 0);
      ids.push((await at(s, 'get', `/exports/${made.body.data.id}`)).body.data.fileId as string);
    }
    const keys = await h.db.query<{ id: string; object_key: string }>(
      'SELECT id, object_key FROM files WHERE id = ANY($1)',
      [ids],
    );
    const stuckKey = keys.rows.find((k) => k.id === ids[0])!.object_key;
    const storage: StorageDriver = {
      ...h.container.storage,
      name: h.container.storage.name,
      remove: async (bucket, key) => {
        if (key === stuckKey) throw new Error('access denied');
        return h.container.storage.remove(bucket, key);
      },
    };
    const sweep = new ExportSweep(
      h.container.prisma,
      storage,
      { now: () => new Date(Date.now() + 31 * 24 * 60 * 60 * 1000) },
      h.container.logger,
    );
    expect((await sweep.run()).expired).toBeGreaterThanOrEqual(1);
    const left = await h.db.query<{ id: string; deleted_at: Date | null }>(
      'SELECT id, deleted_at FROM files WHERE id = ANY($1)',
      [ids],
    );
    const byId = new Map(left.rows.map((row) => [row.id, row.deleted_at]));
    expect(byId.get(ids[0]!)).toBeNull();
    expect(byId.get(ids[1]!)).not.toBeNull();
  });
});
