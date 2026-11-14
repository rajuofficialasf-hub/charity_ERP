import { matchKey, type NameVariants, nameVariantsOf, placeKey } from '@css/shared/beneficiaries';
import type { Tx } from '../core/prisma.service.js';
import type { JobRunner } from '../jobs/job-runner.js';

/** The queue of the key job (jobs/name-keys.ts); here so a writer can queue it without the job. */
export const NAME_KEYS_QUEUE = 'name-keys' as const;

/**
 * The one singleton key of every key job, at each place that queues it: with the queue's policy
 * (jobs/queues.ts) it keeps one run waiting and one running at most.
 */
export const NAME_KEYS_SINGLETON = 'name-keys';

/** Queues the key job, in the caller's transaction when one is given. */
export function queueNameKeys(jobs: Pick<JobRunner, 'enqueue'>, tx?: Tx): Promise<string | null> {
  return jobs.enqueue(
    NAME_KEYS_QUEUE,
    {},
    { ...(tx ? { tx } : {}), singletonKey: NAME_KEYS_SINGLETON },
  );
}

/** The variants list in key form and the version it has. */
export interface VariantList {
  version: number;
  variants: NameVariants;
}

/** What a profile's keys are made from. */
export interface ProfileKeySource {
  name: string;
  fatherOrHusbandName: string;
  village: string;
}

/** The stored keys of a profile, as Prisma writes them; an empty key is stored as null. */
export interface ProfileKeys {
  nameKey: string | null;
  guardianKey: string | null;
  villageKey: string | null;
  matchKeysVersion: number;
}

/** The stored key of a family member. */
export interface MemberKeys {
  nameKey: string | null;
  matchKeysVersion: number;
}

const stored = (key: string) => (key === '' ? null : key);

/** The keys of a profile under a given list. */
export function profileKeysWith(list: VariantList, source: ProfileKeySource): ProfileKeys {
  return {
    nameKey: stored(matchKey(source.name, list.variants)),
    guardianKey: stored(matchKey(source.fatherOrHusbandName, list.variants)),
    villageKey: stored(placeKey(source.village, list.variants)),
    matchKeysVersion: list.version,
  };
}

/** The key of a family member under a given list. */
export function memberKeysWith(list: VariantList, name: string): MemberKeys {
  return { nameKey: stored(matchKey(name, list.variants)), matchKeysVersion: list.version };
}

/**
 * The stored name keys (docs/database/DATABASE_SCHEMA.md, "beneficiaries"): every write of a
 * name, a father's or husband's name or a village stores its keys through this service in the
 * same transaction, with the version of the variants list they were computed with; the key job
 * repairs what a write left behind and recomputes after a change of the list. The list is read
 * once per version: each call reads only the one version row and keeps the list it read last.
 * A write that read the version just before the list changed stores the older version, so the
 * job queued by the change, or the nightly one, computes that row again.
 */
export class MatchKeysService {
  private cached: VariantList | undefined;

  /** The current list, read again only when its version has changed. */
  async list(db: Tx): Promise<VariantList> {
    const row = await db.nameVariantsVersion.findUnique({
      where: { id: 1 },
      select: { version: true },
    });
    // the migration writes the row; a database without it has never had a list
    const version = row?.version ?? 1;
    if (this.cached?.version === version) return this.cached;
    // the spellings that belong to a group that is switched on
    const rows = await db.nameVariant.findMany({
      where: { active: true, group: { active: true } },
      select: { variant: true, group: { select: { canonical: true } } },
      orderBy: { variant: 'asc' },
    });
    this.cached = {
      version,
      variants: nameVariantsOf(
        rows.map((r) => ({ variant: r.variant, canonical: r.group.canonical })),
      ),
    };
    return this.cached;
  }

  /** The keys of a profile with the given name, father's or husband's name and village. */
  async ofProfile(db: Tx, source: ProfileKeySource): Promise<ProfileKeys> {
    return profileKeysWith(await this.list(db), source);
  }

  /** The key of a family member's name. */
  async ofMember(db: Tx, name: string): Promise<MemberKeys> {
    return memberKeysWith(await this.list(db), name);
  }

  /**
   * Brings the keys of the given profiles to the current list in the caller's transaction; a
   * profile whose stored keys are already those is not written.
   */
  async refreshProfiles(db: Tx, ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    const list = await this.list(db);
    const rows = await db.beneficiary.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        name: true,
        fatherOrHusbandName: true,
        village: true,
        nameKey: true,
        guardianKey: true,
        villageKey: true,
        matchKeysVersion: true,
      },
    });
    for (const row of rows) {
      const keys = profileKeysWith(list, row);
      if (
        keys.nameKey === row.nameKey &&
        keys.guardianKey === row.guardianKey &&
        keys.villageKey === row.villageKey &&
        keys.matchKeysVersion === row.matchKeysVersion
      )
        continue;
      await db.beneficiary.update({ where: { id: row.id }, data: keys, select: { id: true } });
    }
  }
}

/**
 * Raises the version of the variants list and queues the key job, in the transaction that changes
 * the list, so every stored key is computed again once the change commits. Returns the new
 * version.
 */
export async function raiseVariantsVersion(
  tx: Tx,
  jobs: Pick<JobRunner, 'enqueue'>,
  actorId: string | null,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ version: number }[]>`
    INSERT INTO name_variants_version (id, version, updated_by) VALUES (1, 2, ${actorId}::uuid)
    ON CONFLICT (id) DO UPDATE
      SET version = name_variants_version.version + 1, updated_by = EXCLUDED.updated_by
    RETURNING version`;
  await queueNameKeys(jobs, tx);
  return row!.version;
}
