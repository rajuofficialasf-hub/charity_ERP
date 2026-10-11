import { join } from 'node:path';
import type { Client } from 'pg';

export const REPO_ROOT = join(__dirname, '../../../..');

export async function inTransaction(db: Client, work: () => Promise<void>): Promise<void> {
  await db.query('BEGIN');
  try {
    await work();
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
