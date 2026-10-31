import { uuidv7 } from '@css/shared';
import type { Response } from 'express';
import { type PrismaService, type Tx } from '../core/prisma.service';
import { BATCH_IN_PROGRESS } from '@css/shared/sync';
import { ApiError } from '../i18n/api-error';
import { Prisma } from '../generated/prisma/client';
import { isUniqueViolation } from '../core/db-errors';

const KEY = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Idempotency per API_STANDARDS 9 and O-57, without a generic key table:
 * - clientUuid: the record's own unique column; a repeat returns the existing record with 200 and
 *   `Idempotent-Replay: true`;
 * - header: the `Idempotency-Key` of sync and bulk endpoints is stored with the per-record results
 *   in `sync_batches`; a repeat returns the stored results unchanged, even under concurrency.
 */
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Marks a response as a replay of an earlier create (clientUuid mode). */
  markReplay(res: Response): void {
    res.status(200).setHeader('Idempotent-Replay', 'true');
  }

  /**
   * Looks up an existing record for a clientUuid create. Returns it when the request is a replay,
   * after marking the response; null when the create must run.
   */
  async replayByClientUuid<T>(res: Response, lookup: () => Promise<T | null>): Promise<T | null> {
    const existing = await lookup();
    if (existing !== null) this.markReplay(res);
    return existing;
  }

  /**
   * Runs a sync or bulk batch once per Idempotency-Key (header mode). The batch's writes and the
   * stored results commit together; a repeated key returns the stored results and `replay: true`.
   * A key belongs to the caller who used it first and to the request it carried (its hash): a
   * repeat by someone else or with another request is refused, never answered from the store.
   * A batch that runs long may take its own transaction limits.
   */
  async runWithKey<T extends Prisma.InputJsonValue>(
    key: string | undefined,
    owner: { userId: string; deviceSessionId: string },
    recordCount: number,
    run: (tx: Tx) => Promise<T[]>,
    options: { requestHash?: string; maxWait?: number; timeout?: number } = {},
  ): Promise<{ replay: boolean; results: T[] }> {
    assertKey(key);
    const replayOf = (stored: { userId: string; requestHash: string | null; results: unknown }) => {
      const sameRequest = (stored.requestHash ?? null) === (options.requestHash ?? null);
      if (stored.userId !== owner.userId || !sameRequest)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'Idempotency-Key', code: 'validation.failed' },
        ]);
      return { replay: true, results: stored.results as T[] };
    };
    const stored = await this.prisma.syncBatche.findUnique({ where: { idempotencyKey: key } });
    if (stored) return replayOf(stored);
    try {
      const results = await this.prisma.$transaction(
        async (tx) => {
          const out = await run(tx);
          await tx.syncBatche.create({
            data: {
              id: uuidv7(),
              idempotencyKey: key,
              userId: owner.userId,
              deviceSessionId: owner.deviceSessionId,
              recordCount,
              results: out as Prisma.InputJsonValue,
              requestHash: options.requestHash ?? null,
            },
          });
          return out;
        },
        { maxWait: options.maxWait, timeout: options.timeout },
      );
      return { replay: false, results };
    } catch (error) {
      // A concurrent request with the same key committed first: return its results instead.
      const winner = await this.prisma.syncBatche.findUnique({ where: { idempotencyKey: key } });
      if (winner) return replayOf(winner);
      throw error;
    }
  }

  /**
   * Claims an Idempotency-Key before a batch whose records each run in their own transaction (the
   * offline sync): the row is written with no results yet, and `storeResults` fills it when every
   * record is done. A repeat with results answers them; a repeat while they are still null is told
   * to come back shortly; a key of another caller or another request is refused as above.
   */
  async reserveKey(
    key: string | undefined,
    owner: { userId: string; deviceSessionId: string },
    recordCount: number,
    requestHash: string,
  ): Promise<{ replay: true; results: unknown } | { replay: false; batchId: string }> {
    assertKey(key);
    const stored = await this.prisma.syncBatche.findUnique({ where: { idempotencyKey: key } });
    if (stored) return this.storedBatch(stored, owner.userId, requestHash);
    try {
      const row = await this.prisma.syncBatche.create({
        data: {
          id: uuidv7(),
          idempotencyKey: key,
          userId: owner.userId,
          deviceSessionId: owner.deviceSessionId,
          recordCount,
          results: Prisma.JsonNull,
          requestHash,
        },
        select: { id: true },
      });
      return { replay: false, batchId: row.id };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // the same key arrived twice at once: the first one holds it
      const winner = await this.prisma.syncBatche.findUniqueOrThrow({
        where: { idempotencyKey: key },
      });
      return this.storedBatch(winner, owner.userId, requestHash);
    }
  }

  /** The results of a reserved batch, once every record has its own. */
  async storeResults(tx: Tx, batchId: string, results: readonly object[]): Promise<void> {
    await tx.syncBatche.update({
      where: { id: batchId },
      data: { results: results as unknown as Prisma.InputJsonValue },
    });
  }

  private storedBatch(
    stored: { userId: string; requestHash: string | null; results: unknown },
    userId: string,
    requestHash: string,
  ): { replay: true; results: unknown } {
    if (stored.userId !== userId || stored.requestHash !== requestHash)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'Idempotency-Key', code: 'validation.failed' },
      ]);
    if (stored.results === null)
      throw new ApiError(BATCH_IN_PROGRESS, 409, undefined, undefined, BATCH_RETRY_SECONDS);
    return { replay: true, results: stored.results };
  }
}

/** How soon a phone asks again for a batch the server is still working on. */
const BATCH_RETRY_SECONDS = 5;

function assertKey(key: string | undefined): asserts key is string {
  if (!key || !KEY.test(key))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'Idempotency-Key', code: 'validation.required' },
    ]);
}
