import type { Logger } from 'pino';
import type { Tx } from '../core/prisma.service.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  type MatchKeysService,
  memberKeysWith,
  NAME_KEYS_QUEUE,
  NAME_KEYS_SINGLETON,
  profileKeysWith,
  queueNameKeys,
  type VariantList,
} from '../services/match-keys.js';

export { NAME_KEYS_QUEUE, NAME_KEYS_SINGLETON, queueNameKeys };

/**
 * Nightly at 02:30 Dhaka time on its own queue (jobs/queues.ts), before the duplicate pairs of
 * 02:45; also queued when the variants list changes and at the worker's start when keys are
 * missing.
 */
export const NAME_KEYS_CRON = '30 2 * * *';

/** Rows per transaction: a short lock on a few thousand rows, never on the whole table. */
const BATCH = 2000;
const BATCH_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };
/**
 * The check at the worker's start: with the indexes of the stale rows it answers at once, and even
 * a full scan of a table of millions takes seconds; after a minute on the server, and a little more
 * for the transaction around it, it gives up rather than hold the start.
 */
const STALE_CHECK_STATEMENT_TIMEOUT = '60s';
const STALE_CHECK_TRANSACTION = { maxWait: 10_000, timeout: 70_000 };
/** Below the smallest uuid, where the walk by id starts. */
const FIRST_ID = '00000000-0000-0000-0000-000000000000';

export interface NameKeysResult {
  version: number;
  profiles: number;
  members: number;
}

interface ProfileRow {
  id: string;
  name: string;
  father_or_husband_name: string;
  village: string;
}

interface MemberRow {
  id: string;
  name: string;
}

/**
 * The key job (docs/database/DATABASE_SCHEMA.md, "beneficiaries"): computes the name keys of every
 * profile and family member whose keys are missing or older than the variants list, walking by id
 * in batches of its own transactions. Idempotent: a row is written only while its keys are stale
 * and its name, father's or husband's name and village are still the ones the keys were computed
 * from, so a run never overwrites a newer write, and a second run writes nothing. Each batch locks
 * its rows in id order as it reads them, so it never takes them in an order that could deadlock
 * with another batch. One run at a time: the queue's policy and one singleton key at every place
 * that queues it. Its writes leave the rows' update stamps as they were (css.match_keys_only, see
 * the migration).
 */
export class NameKeysJob {
  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly keys: MatchKeysService,
    private readonly logger: Pick<Logger, 'info'>,
    private readonly batchSize = BATCH,
  ) {}

  async run(): Promise<NameKeysResult> {
    // the newest list a batch ran under: a change of the list during the run raises it
    let version = 0;
    let profiles = 0;
    let members = 0;
    for (let after = FIRST_ID; ;) {
      const step = await this.batch(async (tx, list) => {
        const rows = await tx.$queryRaw<ProfileRow[]>`
          SELECT id, name, father_or_husband_name, village FROM beneficiaries
          WHERE id > ${after}::uuid
            AND (match_keys_version IS NULL OR match_keys_version < ${list.version})
          ORDER BY id LIMIT ${this.batchSize} FOR UPDATE`;
        if (!rows.length) return { rows, written: 0 };
        const keys = rows.map((r) =>
          profileKeysWith(list, {
            name: r.name,
            fatherOrHusbandName: r.father_or_husband_name,
            village: r.village,
          }),
        );
        const written = await tx.$executeRaw`
          UPDATE beneficiaries AS b
          SET name_key = v.name_key, guardian_key = v.guardian_key, village_key = v.village_key,
              match_keys_version = ${list.version}
          FROM unnest(${rows.map((r) => r.id)}::uuid[], ${rows.map((r) => r.name)}::text[],
                      ${rows.map((r) => r.father_or_husband_name)}::text[],
                      ${rows.map((r) => r.village)}::text[],
                      ${keys.map((k) => k.nameKey)}::text[], ${keys.map((k) => k.guardianKey)}::text[],
                      ${keys.map((k) => k.villageKey)}::text[])
               AS v(id, name, father, village, name_key, guardian_key, village_key)
          WHERE b.id = v.id AND b.name = v.name AND b.father_or_husband_name = v.father
            AND b.village = v.village
            AND (b.match_keys_version IS NULL OR b.match_keys_version < ${list.version})`;
        return { rows, written };
      });
      version = Math.max(version, step.version);
      profiles += step.written;
      if (step.rows.length < this.batchSize) break;
      after = step.rows.at(-1)!.id;
    }
    for (let after = FIRST_ID; ;) {
      const step = await this.batch(async (tx, list) => {
        const rows = await tx.$queryRaw<MemberRow[]>`
          SELECT id, name FROM beneficiary_family_members
          WHERE id > ${after}::uuid
            AND (match_keys_version IS NULL OR match_keys_version < ${list.version})
          ORDER BY id LIMIT ${this.batchSize} FOR UPDATE`;
        if (!rows.length) return { rows, written: 0 };
        const keys = rows.map((r) => memberKeysWith(list, r.name));
        const written = await tx.$executeRaw`
          UPDATE beneficiary_family_members AS m
          SET name_key = v.name_key, match_keys_version = ${list.version}
          FROM unnest(${rows.map((r) => r.id)}::uuid[], ${rows.map((r) => r.name)}::text[],
                      ${keys.map((k) => k.nameKey)}::text[]) AS v(id, name, name_key)
          WHERE m.id = v.id AND m.name = v.name
            AND (m.match_keys_version IS NULL OR m.match_keys_version < ${list.version})`;
        return { rows, written };
      });
      version = Math.max(version, step.version);
      members += step.written;
      if (step.rows.length < this.batchSize) break;
      after = step.rows.at(-1)!.id;
    }
    if (profiles || members) this.logger.info({ version, profiles, members }, 'name keys computed');
    return { version, profiles, members };
  }

  /**
   * Whether any profile or family member has keys missing or older than the list. Throws when the
   * check takes longer than its time limit.
   */
  async hasStale(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('statement_timeout', ${STALE_CHECK_STATEMENT_TIMEOUT}, true)`;
      const { version } = await this.keys.list(tx);
      // each condition in a probe of its own: each is then a condition of the index on
      // match_keys_version, where an OR inside one probe reads the whole index
      const [row] = await tx.$queryRaw<{ stale: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM beneficiaries WHERE match_keys_version IS NULL)
            OR EXISTS (SELECT 1 FROM beneficiaries WHERE match_keys_version < ${version})
            OR EXISTS (SELECT 1 FROM beneficiary_family_members WHERE match_keys_version IS NULL)
            OR EXISTS (SELECT 1 FROM beneficiary_family_members
                        WHERE match_keys_version < ${version})
               AS stale`;
      return row!.stale;
    }, STALE_CHECK_TRANSACTION);
  }

  /** One batch in its own transaction, under the list current at its start. */
  private batch<T extends { written: number }>(
    work: (tx: Tx, list: VariantList) => Promise<T>,
  ): Promise<T & { version: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('css.match_keys_only', 'on', true)`;
      const list = await this.keys.list(tx);
      return { ...(await work(tx, list)), version: list.version };
    }, BATCH_TRANSACTION);
  }
}
