// pnpm --filter @css/api perf:exports: measures the export job on the large data set of perf:seed
// (docs/testing/PERFORMANCE.md, section "Exports"). As the Department Head it asks for the Dhaka
// division's beneficiaries, more than the 100,000 rows a file holds, and runs the job with the
// real batches, writers and storage driver (the NAS driver on a temporary folder) until it
// stops at the limit: once as CSV and once as Excel. It prints the time, the rows written, the
// file's size and the peak memory of the process. Only the measurement database (checkPerfDbAccess).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Principal } from '../src/auth/principal';
import { loadEnv } from '../src/config/env';
import { createContainer } from '../src/container';
import { ExportsService } from '../src/exports/service';
import { ExportRunner } from '../src/jobs/export-run';
import type { JobRunner } from '../src/jobs/job-runner';
import { perfDatabase } from './perf-db';

/** The report goes to stdout (console.log is kept out of the code by the lint rules). */
const out = (line = '') => process.stdout.write(`${line}\n`);
const LIMIT = 100_000;
const MB = 1024 * 1024;

const { url } = perfDatabase('perf:exports');
const root = mkdtempSync(join(tmpdir(), 'css-perf-exports-'));
const env = loadEnv({
  ...process.env,
  DATABASE_URL: url,
  LOG_LEVEL: 'warn',
  STORAGE_DRIVER: 'nas',
  STORAGE_ROOT: root,
});
// the request's queue entry is not needed: the job is run here, in this process
const noQueue = { enqueue: async () => null } as unknown as JobRunner;
const c = createContainer(env, { overrides: { jobs: noQueue } });

async function headPrincipal(): Promise<Principal> {
  const user = await c.prisma.user.findUniqueOrThrow({
    where: { email: 'head@example.org' },
    select: {
      id: true,
      kind: true,
      state: true,
      permissionVersion: true,
      isSystemOwner: true,
      userRolesUser: {
        where: { revokedAt: null },
        select: { roleKey: true, role: { select: { globalScope: true } } },
      },
    },
  });
  return {
    userId: user.id,
    sessionId: 'perf',
    kind: user.kind,
    state: user.state,
    roles: user.userRolesUser.map((r) => r.roleKey).sort(),
    globalScope: user.userRolesUser.some((r) => r.role.globalScope),
    isSystemOwner: user.isSystemOwner,
    permissionVersion: user.permissionVersion,
  };
}

async function main(): Promise<void> {
  const principal = await headPrincipal();
  const division = await c.prisma.location.findFirstOrThrow({
    where: { level: 'division', nameEn: { contains: 'Dhaka' } },
    select: { id: true },
  });
  // the request may hold more rows than a file; the job stops at the file's limit
  const exports = new ExportsService(
    c.prisma,
    c.audit,
    noQueue,
    c.clock,
    c.exportRows,
    c.exportQuestions,
    c.exportRecords,
    { maxRows: 10_000_000, maxRunning: 100 },
  );
  const runner = new ExportRunner(
    c.prisma,
    c.storage,
    c.clock,
    c.exportRows,
    c.exportQuestions,
    c.pdf,
    { limits: { maxRows: LIMIT } },
  );
  out(`exports of the Dhaka division's beneficiaries, stopped at ${LIMIT} rows`);
  // the process's own memory before any job, so the job's share can be read off
  await c.exportRows.count(
    await c.exportRows.freeze(principal, { kind: 'beneficiaries', filters: {} }, 'bn'),
  );
  const baseline = process.memoryUsage().rss;
  out(`baseline RSS ${(baseline / MB).toFixed(0)} MB`);
  out('format | rows | seconds | file MB | peak RSS MB | above baseline MB');
  for (const format of ['csv', 'xlsx'] as const) {
    const job = await exports.request(
      principal,
      {
        kind: 'beneficiaries',
        format,
        columns: ['name', 'ben_no', 'father', 'area', 'status', 'mobile', 'village', 'nid'],
        filters: { divisionId: division.id },
      },
      'bn',
    );
    let peak = process.memoryUsage().rss;
    const sample = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 100);
    const start = performance.now();
    await runner.run(job.id, 0);
    const seconds = (performance.now() - start) / 1000;
    clearInterval(sample);
    const done = await c.prisma.exportJob.findUniqueOrThrow({
      where: { id: job.id },
      select: { status: true, rowCount: true, file: { select: { sizeBytes: true } } },
    });
    if (done.status !== 'done') throw new Error(`the ${format} job ended ${done.status}`);
    out(
      `${format} | ${done.rowCount} | ${seconds.toFixed(1)} | ${(Number(done.file!.sizeBytes) / MB).toFixed(1)} | ${(peak / MB).toFixed(0)} | ${((peak - baseline) / MB).toFixed(0)}`,
    );
  }
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await c.prisma.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });
