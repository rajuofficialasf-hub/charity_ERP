import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExportRunner } from '../../src/jobs/export-run';
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
      undefined,
      limits,
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
