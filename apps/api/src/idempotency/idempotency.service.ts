import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import { uuidv7 } from '@css/shared';
import type { Response } from 'express';
import { PrismaService, type Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { Prisma } from '../generated/prisma/client';

export const IDEMPOTENCY = 'css:idempotency';

/** Declares how an endpoint is idempotent, the same value as its OpenAPI `x-idempotency`. */
export const Idempotency = (mode: 'none' | 'clientUuid' | 'header') =>
  SetMetadata(IDEMPOTENCY, mode);

const KEY = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Idempotency per API_STANDARDS 9 and O-57, without a generic key table:
 * - clientUuid: the record's own unique column; a repeat returns the existing record with 200 and
 *   `Idempotent-Replay: true`;
 * - header: the `Idempotency-Key` of sync and bulk endpoints is stored with the per-record results
 *   in `sync_batches`; a repeat returns the stored results unchanged, even under concurrency.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
   */
  async runWithKey<T extends Prisma.InputJsonValue>(
    key: string | undefined,
    owner: { userId: string; deviceSessionId: string },
    recordCount: number,
    run: (tx: Tx) => Promise<T[]>,
  ): Promise<{ replay: boolean; results: T[] }> {
    if (!key || !KEY.test(key))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'Idempotency-Key', code: 'validation.required' },
      ]);
    const stored = await this.prisma.syncBatche.findUnique({ where: { idempotencyKey: key } });
    if (stored) return { replay: true, results: stored.results as T[] };
    try {
      const results = await this.prisma.$transaction(async (tx) => {
        const out = await run(tx);
        await tx.syncBatche.create({
          data: {
            id: uuidv7(),
            idempotencyKey: key,
            userId: owner.userId,
            deviceSessionId: owner.deviceSessionId,
            recordCount,
            results: out as Prisma.InputJsonValue,
          },
        });
        return out;
      });
      return { replay: false, results };
    } catch (error) {
      // A concurrent request with the same key committed first: return its results instead.
      const winner = await this.prisma.syncBatche.findUnique({ where: { idempotencyKey: key } });
      if (winner) return { replay: true, results: winner.results as T[] };
      throw error;
    }
  }
}
