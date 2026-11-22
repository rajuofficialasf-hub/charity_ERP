import { createHash } from 'node:crypto';
import type { Principal } from '../auth/principal.js';
import type { Tx } from '../core/prisma.service.js';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error.js';
import type { IdempotencyService } from '../idempotency/idempotency.service.js';

/**
 * The parts shared by the volunteer's and the official's change of several details of the own
 * profile at once (docs/BUSINESS_RULES.md, the profile's edit requests): every detail is checked as
 * its own request is, a refusal names the detail and never its value, and the request is known
 * again by a hash of its body, so the body itself is never stored.
 */

/**
 * Checks every detail before anything is written, and answers one refusal that names each detail
 * that failed (422), so the person sees all of them at once.
 */
export async function checkEach<T extends { field: string }, V>(
  items: readonly T[],
  check: (item: T) => Promise<V>,
): Promise<V[]> {
  const values: V[] = [];
  const details: ApiErrorDetail[] = [];
  for (const item of items) {
    try {
      values.push(await check(item));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 422) throw error;
      const codes = error.details?.length ? error.details.map((d) => d.code) : [error.code];
      for (const code of codes) details.push({ path: item.field, code });
    }
  }
  if (details.length) throw new ApiError('validation.failed', 422, undefined, details);
  return values;
}

/** The refusal of one detail inside the batch, named by its detail (its value never). */
export function namedRefusal(field: string, error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  return new ApiError(error.code, error.status, error.params, [{ path: field, code: error.code }]);
}

/** The request as a hash, kept with its key: a repeat is known without keeping any value. */
export function batchHash(userId: string, body: unknown): string {
  return createHash('sha256')
    .update(`${userId}\n${JSON.stringify(body)}`)
    .digest('hex');
}

/**
 * A batch of up to twenty requests, each with several queries and the approvers' notice, takes
 * longer than an interactive transaction's default of five seconds on a loaded database.
 */
const BATCH_TRANSACTION = { maxWait: 5_000, timeout: 30_000 };

/** The steps one owner's batch takes inside its transaction. */
export interface BatchSteps<R extends { field: string }> {
  /** Locks the person's rows the requests belong to. */
  lock: (tx: Tx) => Promise<void>;
  /** Checks one request's value, as its own request is checked. */
  check: (tx: Tx, request: R) => Promise<unknown>;
  /** Writes one request with its checked value. */
  write: (tx: Tx, request: R, value: unknown) => Promise<{ id: string }>;
}

/**
 * Runs a batch once per Idempotency-Key: a repeat answers the ids the first run made before any
 * check runs, so a change the first run started (a contact since verified) cannot refuse it.
 * Otherwise the person is locked, every request checked (each refusal named by its detail), and
 * every request written; one refusal rolls back all of them and the key alike.
 */
export async function runEditBatch<R extends { field: string }>(
  idempotency: IdempotencyService,
  key: string | undefined,
  principal: Principal,
  requests: readonly R[],
  steps: BatchSteps<R>,
): Promise<{ replay: boolean; ids: string[] }> {
  const outcome = await idempotency.runWithKey<{ id: string }>(
    key,
    { userId: principal.userId, deviceSessionId: principal.sessionId },
    requests.length,
    async (tx) => {
      await steps.lock(tx);
      const values = await checkEach(requests, (r) => steps.check(tx, r));
      const made: { id: string }[] = [];
      for (const [i, request] of requests.entries()) {
        try {
          const row = await steps.write(tx, request, values[i]);
          made.push({ id: row.id });
        } catch (error) {
          throw namedRefusal(request.field, error);
        }
      }
      return made;
    },
    { requestHash: batchHash(principal.userId, { requests }), ...BATCH_TRANSACTION },
  );
  return { replay: outcome.replay, ids: outcome.results.map((r) => r.id) };
}

/** The rows in the order of their ids (a replay answers them as the first request did). */
export function inOrder<R extends { id: string }>(ids: readonly string[], rows: readonly R[]): R[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
