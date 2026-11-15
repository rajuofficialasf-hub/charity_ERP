import type { Logger } from 'pino';
import type { PrismaClient } from '../generated/prisma/client.js';
import { helpCountsSql, withoutJit, writeHelpCounts } from '../services/help-history.js';

/** Nightly at 03:00 Dhaka time on its own queue (jobs/queues.ts), after the duplicate pairs. */
export const HELP_COUNTERS_CRON = '0 3 * * *';
export const HELP_COUNTERS_QUEUE = 'help-counters' as const;

/** Profiles counted per transaction; only the ones that differ are locked. */
const BATCH = 2000;
const BATCH_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };
/** Below the smallest uuid, where the walk by id starts. */
const FIRST_ID = '00000000-0000-0000-0000-000000000000';

export interface HelpCountersResult {
  /** The profiles counted. */
  checked: number;
  /** The profiles whose kept counters were wrong and are now right. */
  repaired: number;
}

/**
 * The nightly recount of the times each person was helped (docs/database/DATABASE_SCHEMA.md,
 * "beneficiaries"): the application moves and the merges keep the counters current in their own
 * transactions, and this walk by id, in batches of its own transactions, repairs whatever they
 * missed. It counts exactly as they do (`helpCountsSql` of services/help-history.ts), first without
 * a lock, and hands only the profiles whose counter differs to `writeHelpCounts`, which locks them
 * and counts again, so a move committed in between is never undone; it writes only a counter that
 * differs, and leaves the profiles' update stamps as they were, so a second run
 * writes nothing. A repair is logged, since it means some write path did not keep the count.
 */
export class HelpCountersJob {
  private readonly batchSize: number;

  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly logger: Pick<Logger, 'info' | 'warn'>,
    options: { batchSize?: number } = {},
  ) {
    this.batchSize = options.batchSize ?? BATCH;
  }

  async run(): Promise<HelpCountersResult> {
    let checked = 0;
    let repaired = 0;
    for (let after = FIRST_ID; ;) {
      const step = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM beneficiaries WHERE id > ${after}::uuid ORDER BY id LIMIT ${this.batchSize}`;
        const ids = rows.map((r) => r.id);
        // counted without a lock first: a lock writes to every row it takes, so only the few whose
        // counter differs are locked, and the writer counts them again under the lock
        const drifted = ids.length
          ? await withoutJit(
              tx,
              () => tx.$queryRaw<{ id: string }[]>`
                SELECT b.id FROM beneficiaries b JOIN (${helpCountsSql(ids)}) AS c ON c.id = b.id
                WHERE (b.help_count, b.max_helps_in_year)
                      IS DISTINCT FROM (c.help_count, c.max_helps_in_year)`,
            )
          : [];
        return {
          ids,
          written: await writeHelpCounts(
            tx,
            drifted.map((r) => r.id),
          ),
        };
      }, BATCH_TRANSACTION);
      checked += step.ids.length;
      repaired += step.written;
      if (step.ids.length < this.batchSize) break;
      after = step.ids.at(-1)!;
    }
    if (repaired) this.logger.warn({ checked, repaired }, 'help counters repaired');
    else this.logger.info({ checked }, 'help counters checked');
    return { checked, repaired };
  }
}
