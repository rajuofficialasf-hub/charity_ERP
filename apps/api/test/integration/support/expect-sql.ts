import type { Client } from 'pg';
import { expect } from 'vitest';

/** Expects a statement to fail with the given SQLSTATE (and optionally a message fragment). */
export async function expectSqlError(
  work: Promise<unknown>,
  sqlstate: string,
  message?: string | RegExp,
): Promise<void> {
  let error: (Error & { code?: string }) | undefined;
  try {
    await work;
  } catch (e) {
    error = e as Error & { code?: string };
  }
  expect(error, `expected SQLSTATE ${sqlstate}`).toBeDefined();
  expect(error?.code).toBe(sqlstate);
  if (message) expect(error?.message).toMatch(message);
}

/** Runs statements in one transaction; deferred constraint triggers fire at COMMIT. */
export async function inTransaction(db: Client, work: () => Promise<unknown>): Promise<void> {
  await db.query('BEGIN');
  try {
    await work();
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

export const SQLSTATE = {
  uniqueViolation: '23505',
  checkViolation: '23514',
  foreignKeyViolation: '23503',
  notNullViolation: '23502',
  insufficientPrivilege: '42501',
  restrictViolation: '23001',
} as const;
