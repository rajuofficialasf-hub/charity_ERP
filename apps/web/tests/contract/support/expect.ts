// The contract check of one response, and the record of which calls the run reached, for the
// coverage check (scripts/contract-coverage.mjs) that compares them with the app's own calls.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { z } from 'zod';
import { normalizedCall } from './calls';

const RECORD_DIR = join(__dirname, '../../../test-results/contract');

/** Notes a call the run made, as METHOD and path with its ids replaced by a mark. */
export function record(method: string, path: string, status: number): void {
  mkdirSync(RECORD_DIR, { recursive: true });
  appendFileSync(
    join(RECORD_DIR, `calls-${process.pid}.jsonl`),
    `${JSON.stringify({ call: normalizedCall(method, path), status })}\n`,
  );
}

/**
 * The response's `data` parsed with the web app's schema: a field the app reads that the API
 * leaves out or sends in another shape fails the run, naming the path inside the response.
 */
export function expectContract<T>(
  response: { status: number; body: unknown },
  status: number,
  schema: z.ZodType<T>,
): T {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  const data = (response.body as { data?: unknown } | null)?.data;
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    expect.fail(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'),
    );
  return parsed.data;
}
