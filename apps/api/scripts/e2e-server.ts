import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { checkDestructiveDbAccess } from '../src/config/db-guard';

// The API for Playwright (T1.7): recreates the css_erp_test_e2e database, migrates it, installs
// the job schema, loads the base and demo seed (docs/testing/DEMO_ACCOUNTS.md) and starts the built
// API on port 4100 with the dummy OTP. Development and test only: the database guard refuses
// anything but css_erp_test* and NODE_ENV=production. The values below are E2E-only placeholders.
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://css:css_dev_only@127.0.0.1:5433/css_erp_test_e2e';
const PORT = process.env.E2E_API_PORT ?? '4100';
const root = join(__dirname, '..');

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

async function recreate(url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1);
  if (!/^css_erp_test_[a-z0-9_]+$/.test(name)) throw new Error(`refusing database "${name}"`);
  const guard = checkDestructiveDbAccess({ NODE_ENV: process.env.NODE_ENV, DATABASE_URL: url });
  if (!guard.allowed) throw new Error(`refusing database "${name}": ${guard.reason}`);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  await recreate(DATABASE_URL);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL,
    PORT,
    LOG_LEVEL: 'warn',
    CURSOR_SECRET: 'e2e-only-cursor-secret-0123456789abcdef',
    JWT_SECRET: 'e2e-only-jwt-secret-0123456789abcdef0123',
    AUTH_CSRF_SECRET: 'e2e-only-csrf-secret-0123456789abcdef01',
    OTP_SECRET: 'e2e-only-otp-secret-0123456789abcdef0123',
    OTP_DUMMY_ENABLED: 'true',
    OTP_DUMMY_CODE: process.env.E2E_OTP_CODE ?? '123456',
    STORAGE_DRIVER: 'filesystem',
    STORAGE_FS_ROOT: mkdtempSync(join(tmpdir(), 'css-e2e-storage-')),
    JOBS_INLINE: 'false',
    // Every browser of the run shares one address; the limits are covered by the API tests (D-072).
    RATE_LIMITS_RELAXED: 'true',
  };
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], env);
  run('pnpm', ['run', 'jobs:install'], env);
  run('pnpm', ['run', 'db:seed', '--set', 'all'], env);
  const api = spawn(process.execPath, ['dist/server.js'], { cwd: root, env, stdio: 'inherit' });
  const stop = () => api.kill('SIGTERM');
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  api.on('exit', (code) => process.exit(code ?? 0));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
