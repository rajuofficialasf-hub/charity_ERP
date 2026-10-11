import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { checkDestructiveDbAccess } from '../../../src/config/db-guard';

/**
 * Real PostgreSQL for integration tests (O-46 item 1): every test file works in its own database,
 * cloned from a migrated template. Only databases named css_erp_test* are ever created or dropped,
 * and the dev/test guard is checked before each of those operations.
 */
const DEFAULT_URL = 'postgresql://css:css_dev_only@127.0.0.1:5433/css_erp_test';
export const MIGRATIONS_DIR = join(__dirname, '../../../prisma/migrations');

export function baseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
}

export function urlFor(database: string): string {
  const url = new URL(baseUrl());
  url.pathname = '/' + database;
  return url.toString();
}

function assertTestDatabase(name: string): void {
  if (!/^css_erp_test_[a-z0-9_]+$/.test(name))
    throw new Error(`refusing to touch database "${name}"`);
  const guard = checkDestructiveDbAccess({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: urlFor(name),
  });
  if (!guard.allowed) throw new Error(`refusing to touch database "${name}": ${guard.reason}`);
}

/** A pg client whose connection errors (for example a forced drop) never crash the worker. */
export function newClient(connectionString: string): Client {
  const client = new Client({ connectionString });
  client.on('error', (error) => console.warn(`[test db] ${error.message}`));
  return client;
}

export function uniqueName(prefix: string): string {
  return `css_erp_test_${prefix}_${randomBytes(4).toString('hex')}`;
}

async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = newClient(baseUrl());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createDatabase(name: string, template?: string): Promise<void> {
  assertTestDatabase(name);
  if (template) assertTestDatabase(template);
  await withAdmin((c) =>
    c.query(`CREATE DATABASE "${name}"${template ? ` TEMPLATE "${template}"` : ''}`),
  );
}

export async function dropDatabase(name: string): Promise<void> {
  assertTestDatabase(name);
  await withAdmin((c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}

export function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Applies every migration.sql in order ("up") or every down.sql in reverse order ("down"). */
export async function runMigrations(database: string, direction: 'up' | 'down'): Promise<void> {
  const dirs = direction === 'up' ? migrationDirs() : migrationDirs().reverse();
  const client = newClient(urlFor(database));
  await client.connect();
  try {
    for (const dir of dirs) {
      const file = join(MIGRATIONS_DIR, dir, direction === 'up' ? 'migration.sql' : 'down.sql');
      await client.query(readFileSync(file, 'utf8'));
    }
  } finally {
    await client.end();
  }
}

/** A connected client on a fresh clone of the migrated template; drop() removes the clone. */
export async function cloneTemplate(
  template: string,
): Promise<{ client: Client; name: string; url: string; drop: () => Promise<void> }> {
  const name = uniqueName('f');
  await createDatabase(name, template);
  const client = newClient(urlFor(name));
  await client.connect();
  return {
    client,
    name,
    url: urlFor(name),
    drop: async () => {
      await client.end();
      await dropDatabase(name);
    },
  };
}
