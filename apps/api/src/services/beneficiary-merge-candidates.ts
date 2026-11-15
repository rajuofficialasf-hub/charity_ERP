import { uuidv7 } from '@css/shared';
import { type DismissalRequest, formatBenNo } from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service.js';
import {
  beneficiaryReachedByAll,
  beneficiaryScopeSql,
  beneficiaryWhere,
  type Scope,
} from '../access/scope.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import { boundedRead } from '../core/bounded-read.js';
import { decodeCursor, encodeCursor, type PageQuery } from '../core/pagination.js';
import { isUniqueViolation } from '../core/db-errors.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';

/** Why two profiles look like one person, in the order the suggestions name the rules. */
export const DUPLICATE_RULES = [
  'name_dob_union',
  'name_father_mobile',
  'name_father_village',
  'same_mobile',
] as const;
export type DuplicateRule = (typeof DUPLICATE_RULES)[number];

/**
 * How sure a suggested pair is (docs/DECISION_LOG.md, the decision on comparing names): `probable`
 * where several facts agree (a rule that compares a name, or two rules together), `check` where
 * one weaker fact alone stands (a shared mobile). The strong level, the same identity or BEN
 * number, never belongs to a stored pair: two live profiles cannot hold one number (the unique
 * indexes), so it is the number lookup's and the verification's. Probable first.
 */
export const PAIR_LEVELS = ['probable', 'check'] as const;
export type PairLevel = (typeof PAIR_LEVELS)[number];

/** The rules that alone make a pair only one for an official to check. */
const WEAK_RULES: readonly DuplicateRule[] = ['same_mobile'];

/** The level a set of rules gives, as the database's check of the stored column computes it. */
export function pairLevel(rules: readonly DuplicateRule[]): PairLevel {
  return rules.every((r) => WEAK_RULES.includes(r)) ? 'check' : 'probable';
}

/** The level of the rules array `rules` in SQL, the same as `pairLevel`. */
const levelOf = (rules: Prisma.Sql) =>
  Prisma.sql`CASE WHEN ${rules} <@ ARRAY[${Prisma.join(WEAK_RULES)}]::text[] THEN 'check' ELSE 'probable' END`;

type PairRow = {
  low: string;
  high: string;
  rules: DuplicateRule[];
  level: PairLevel;
  low_ben_no: number;
  low_name: string;
  high_ben_no: number;
  high_name: string;
};

/** The position a page of suggestions continues after: the level and the last pair of the page. */
const pairCursor = z.tuple([z.enum(PAIR_LEVELS), z.uuid(), z.uuid()]);

/** The filters of the suggestions list. */
export interface PairFilter {
  /** Only the pairs of this level. */
  level?: PairLevel | undefined;
  /** Only the pairs this profile is one of. */
  beneficiaryId?: string | undefined;
}

/** At most this many open pairs of one person are named at review. */
const OPEN_PAIRS_SHOWN = 10;

/** An open probable pair of a person, as the review reads it. */
export interface OpenPair {
  beneficiaryId: string;
  benNo: string;
  name: string;
  matchedOn: DuplicateRule[];
  /** Whether every scope the caller gave reaches the other profile. */
  named: boolean;
}

/** The open probable pairs shown for a person, and how many there are in all. */
export interface OpenPairs {
  rows: OpenPair[];
  total: number;
}

/**
 * Whether the profile has an open probable pair (active, not marked as two people) with another
 * live profile that has an application in the project: the same person probably appears there a
 * second time, under another profile. The pairs are the ones the review shows (`probablePairsOf`).
 */
export async function openPairInProject(
  db: Tx,
  projectId: string,
  beneficiaryId: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ found: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM beneficiary_merge_candidates c
      JOIN beneficiaries x
        ON x.id = CASE WHEN c.low_id = ${beneficiaryId}::uuid THEN c.high_id ELSE c.low_id END
        AND x.merged_into_id IS NULL
      JOIN applications a
        ON a.beneficiary_id = x.id AND a.project_id = ${projectId}::uuid AND a.status <> 'deleted'
      WHERE (c.low_id = ${beneficiaryId}::uuid OR c.high_id = ${beneficiaryId}::uuid)
        AND c.active AND c.level = 'probable'
        AND NOT EXISTS (
          SELECT 1 FROM beneficiary_merge_dismissals d
          WHERE d.low_id = c.low_id AND d.high_id = c.high_id AND d.lifted_at IS NULL)
    ) AS found`;
  return rows[0]?.found === true;
}

/** The nightly recomputation reads every profile once; it may take a while on a large table. */
const FULL_REFRESH = { maxWait: 10_000, timeout: 600_000 };

/**
 * A mobile held by more live profiles than this is a shared phone (an office, a family member who
 * helps many): its profiles are not suggested as pairs by the mobile alone, which would grow with
 * the square of the group; a pair that also has the same name and father's or husband's name is.
 */
export const MOBILE_GROUP_LIMIT = 20;

/**
 * Whether the names beside two profiles `x` and `y` may be one person's father or husband: a
 * father's name never pairs with a husband's, and where either side does not say, they may.
 */
const relationsAgree = (x: string, y: string) =>
  Prisma.sql`(${Prisma.raw(x)}.guardian_relation_code IS NULL OR ${Prisma.raw(y)}.guardian_relation_code IS NULL
    OR ${Prisma.raw(x)}.guardian_relation_code = ${Prisma.raw(y)}.guardian_relation_code)`;

/**
 * The pairs as SQL over the live profiles `x` and `y` (`x.id < y.id`) for the nightly job: the
 * same name, father's or husband's name and mobile; the same mobile in a group within the limit;
 * the same name, date of birth and union; the same name, father's or husband's name and village in
 * one union. Names and villages compare through the stored keys (the name key of the shared
 * package, with the spelling variants), so a title or a known variant makes no difference; a
 * missing key equals no key, so a name of punctuation alone pairs with nobody. A profile without
 * a mobile pairs with nobody by the mobile: a missing number equals no number, here and in
 * `refreshFor`, so the people reached through their volunteer are never one group.
 */
const PAIRS_BY_NAME_FATHER_MOBILE = Prisma.sql`
  SELECT x.id AS low, y.id AS high, ARRAY['name_father_mobile'] AS rules
  FROM beneficiaries x
  JOIN beneficiaries y ON y.mobile = x.mobile AND y.name_key = x.name_key
    AND y.guardian_key = x.guardian_key AND ${relationsAgree('x', 'y')}
    AND x.id < y.id AND y.merged_into_id IS NULL
  WHERE x.merged_into_id IS NULL`;
const PAIRS_BY_MOBILE = Prisma.sql`
  SELECT x.id AS low, y.id AS high, ARRAY['same_mobile'] AS rules
  FROM (SELECT mobile FROM beneficiaries WHERE merged_into_id IS NULL AND mobile IS NOT NULL
        GROUP BY mobile HAVING count(*) BETWEEN 2 AND ${MOBILE_GROUP_LIMIT}) g
  JOIN beneficiaries x ON x.mobile = g.mobile AND x.merged_into_id IS NULL
  JOIN beneficiaries y ON y.mobile = g.mobile AND x.id < y.id AND y.merged_into_id IS NULL`;
const PAIRS_BY_DOB = Prisma.sql`
  SELECT x.id AS low, y.id AS high, ARRAY['name_dob_union'] AS rules
  FROM beneficiaries x
  JOIN beneficiaries y ON y.union_id = x.union_id AND y.name_key = x.name_key AND y.dob = x.dob
    AND x.id < y.id AND y.merged_into_id IS NULL
  WHERE x.merged_into_id IS NULL AND x.dob IS NOT NULL`;
const PAIRS_BY_NAME_FATHER_VILLAGE = Prisma.sql`
  SELECT x.id AS low, y.id AS high, ARRAY['name_father_village'] AS rules
  FROM beneficiaries x
  JOIN beneficiaries y ON y.union_id = x.union_id AND y.name_key = x.name_key
    AND y.guardian_key = x.guardian_key AND y.village_key = x.village_key
    AND ${relationsAgree('x', 'y')} AND x.id < y.id AND y.merged_into_id IS NULL
  WHERE x.merged_into_id IS NULL`;

/**
 * The statement that recomputes the pairs of one profile (`refreshFor`): the rules of the nightly
 * run, found through the profile's own mobile and through its union with its name key, so each is
 * an index lookup. A pair that no longer holds becomes inactive.
 */
export function refreshPairsOf(id: string): Prisma.Sql {
  return Prisma.sql`
    WITH me AS (
      SELECT b.*, (SELECT count(*) FROM beneficiaries s
                   WHERE s.mobile = b.mobile AND s.merged_into_id IS NULL) <= ${MOBILE_GROUP_LIMIT} AS small
      FROM beneficiaries b WHERE b.id = ${id}::uuid AND b.merged_into_id IS NULL
    ), near AS (
      SELECT o.* FROM me JOIN beneficiaries o ON o.id <> me.id AND o.merged_into_id IS NULL
        AND o.mobile = me.mobile
        AND (me.small OR (o.name_key = me.name_key AND o.guardian_key = me.guardian_key))
      UNION
      SELECT o.* FROM me JOIN beneficiaries o ON o.id <> me.id AND o.merged_into_id IS NULL
        AND o.union_id = me.union_id AND o.name_key = me.name_key
    ), found AS (
      SELECT LEAST(me.id, o.id) AS low, GREATEST(me.id, o.id) AS high,
        array_remove(ARRAY[
          CASE WHEN o.union_id = me.union_id AND o.name_key = me.name_key AND o.dob = me.dob
            THEN 'name_dob_union' END,
          CASE WHEN o.mobile = me.mobile AND o.name_key = me.name_key
            AND o.guardian_key = me.guardian_key AND ${relationsAgree('o', 'me')}
            THEN 'name_father_mobile' END,
          CASE WHEN o.union_id = me.union_id AND o.name_key = me.name_key
            AND o.guardian_key = me.guardian_key AND o.village_key = me.village_key
            AND ${relationsAgree('o', 'me')}
            THEN 'name_father_village' END,
          CASE WHEN o.mobile = me.mobile AND me.small THEN 'same_mobile' END], NULL) AS rules
      FROM me JOIN near o ON true
    ), kept AS (
      -- a namesake with another father, or on a mobile too many profiles share, is no pair
      SELECT low, high, rules, ${levelOf(Prisma.sql`rules`)} AS level
      FROM found WHERE cardinality(rules) > 0
    ), gone AS (
      UPDATE beneficiary_merge_candidates c SET active = false, computed_at = now()
      WHERE (c.low_id = ${id}::uuid OR c.high_id = ${id}::uuid) AND c.active
        AND NOT EXISTS (SELECT 1 FROM kept f WHERE f.low = c.low_id AND f.high = c.high_id)
    )
    INSERT INTO beneficiary_merge_candidates (low_id, high_id, rules, level, active, computed_at)
    SELECT low, high, rules, level, true, now() FROM kept
    ON CONFLICT (low_id, high_id) DO UPDATE
      SET rules = EXCLUDED.rules, level = EXCLUDED.level, active = true,
        computed_at = EXCLUDED.computed_at`;
}

/**
 * The suggested duplicate profiles (docs/DECISION_LOG.md, the decisions on profile merges, on
 * the kept duplicate pairs and on comparing names): pairs of live profiles with the same name,
 * father's or husband's name and mobile; the same name, date of birth and union; the same name,
 * father's or husband's name and village in one union; or the same mobile. Each pair says its
 * level. The pairs are kept in `beneficiary_merge_candidates`: a profile's own pairs are
 * recomputed in the transaction that changes it, and a nightly job recomputes them all; a pair
 * that no longer holds is marked inactive, never deleted. The list reads the active pairs whose
 * two profiles are live and inside the caller's scope and not marked as different people.
 */
export class BeneficiaryMergeCandidatesService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Recomputes the pairs of the given profiles in the caller's transaction: index lookups by the
   * profile's own mobile, and by its union with its name key, so it stays cheap on a large table.
   * A retired profile keeps no active pair. The rules are those of the nightly run, profile by
   * profile, so both give the same pairs.
   */
  async refreshFor(tx: Tx, beneficiaryIds: string[]): Promise<void> {
    // shared with other writes, exclusive against the nightly run, so neither undoes the other
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended('merge-candidates', 0))`;
    for (const id of new Set(beneficiaryIds)) await tx.$executeRaw(refreshPairsOf(id));
  }

  /**
   * The nightly recomputation of every pair, set-wise; the pairs it did not find again become
   * inactive. One run at a time.
   */
  async refreshAll(): Promise<{ active: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('merge-candidates', 0))`;
      const [row] = await tx.$queryRaw<{ started: Date }[]>`SELECT now() AS started`;
      const started = row!.started;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO beneficiary_merge_candidates (low_id, high_id, rules, level, active, computed_at)
        SELECT q.low, q.high, q.rules, ${levelOf(Prisma.sql`q.rules`)}, true, ${started}
        FROM (
          SELECT p.low, p.high, array_agg(DISTINCT r ORDER BY r) AS rules
          FROM (${PAIRS_BY_NAME_FATHER_MOBILE} UNION ALL ${PAIRS_BY_MOBILE} UNION ALL ${PAIRS_BY_DOB}
                UNION ALL ${PAIRS_BY_NAME_FATHER_VILLAGE}) p,
            unnest(p.rules) AS r
          GROUP BY p.low, p.high) q
        ON CONFLICT (low_id, high_id) DO UPDATE
          SET rules = EXCLUDED.rules, level = EXCLUDED.level, active = true,
            computed_at = EXCLUDED.computed_at`);
      await tx.$executeRaw`
        UPDATE beneficiary_merge_candidates SET active = false
        WHERE active AND computed_at < ${started}`;
      const active = await tx.mergeCandidate.count({ where: { active: true } });
      return { active };
    }, FULL_REFRESH);
  }

  /**
   * The active pairs in the caller's scope, probable first, then by the pair; a filter by level
   * or by one of the two profiles narrows them. A cursor serves only the list and the filters it
   * was made for.
   */
  async list(
    actor: Principal,
    scope: Scope,
    query: Omit<PageQuery, 'sort'>,
    filter: PairFilter = {},
  ) {
    const binding = `beneficiaries.mergeCandidates|${actor.userId}|${filter.level ?? ''}|${filter.beneficiaryId ?? ''}`;
    const after = query.cursor ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor) : null;
    const position = after ? pairCursor.safeParse(after.v) : null;
    if (after && (after.d !== 'next' || !position?.success))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'cursor', code: 'validation.failed' },
      ]);
    const [level, low, high] = position?.success ? position.data : [];
    const fetched = await boundedRead(this.prisma, async (tx) => {
      const pairs = await tx.$queryRaw<PairRow[]>(Prisma.sql`
        SELECT c.low_id AS low, c.high_id AS high, c.rules, c.level,
          x.ben_no AS low_ben_no, x.name AS low_name, y.ben_no AS high_ben_no, y.name AS high_name
        FROM beneficiary_merge_candidates c
        JOIN beneficiaries x ON x.id = c.low_id AND x.merged_into_id IS NULL
        JOIN beneficiaries y ON y.id = c.high_id AND y.merged_into_id IS NULL
        WHERE c.active
          AND ${beneficiaryScopeSql(scope, 'x')} AND ${beneficiaryScopeSql(scope, 'y')}
          AND NOT EXISTS (
            SELECT 1 FROM beneficiary_merge_dismissals d
            WHERE d.low_id = c.low_id AND d.high_id = c.high_id AND d.lifted_at IS NULL)
          ${filter.level ? Prisma.sql`AND c.level = ${filter.level}` : Prisma.empty}
          ${
            filter.beneficiaryId
              ? Prisma.sql`AND (c.low_id = ${filter.beneficiaryId}::uuid OR c.high_id = ${filter.beneficiaryId}::uuid)`
              : Prisma.empty
          }
          ${
            level && low && high
              ? Prisma.sql`AND (c.level < ${level}
                  OR (c.level = ${level} AND (c.low_id, c.high_id) > (${low}::uuid, ${high}::uuid)))`
              : Prisma.empty
          }
        ORDER BY c.level DESC, c.low_id, c.high_id
        LIMIT ${query.limit + 1}`);
      return pairs;
    });
    const more = fetched.length > query.limit;
    const pairs = fetched.slice(0, query.limit);
    const last = pairs.at(-1);
    const rows = pairs.map((p) => ({
      beneficiaryId: p.low,
      otherBeneficiaryId: p.high,
      benNo: formatBenNo(p.low_ben_no),
      otherBenNo: formatBenNo(p.high_ben_no),
      name: p.low_name,
      otherName: p.high_name,
      matchedOn: [...p.rules].sort(),
      level: p.level,
    }));
    return {
      rows,
      meta: {
        nextCursor:
          more && last
            ? encodeCursor(this.env.CURSOR_SECRET, binding, {
                v: [last.level, last.low, last.high],
                d: 'next',
              })
            : null,
        prevCursor: null,
        limit: query.limit,
      },
    };
  }

  /**
   * The open probable pairs of one profile: active, not marked as two people, the other profile
   * live. Those whose other profile every scope of `nameWith` reaches come first, so the ones the
   * caller may name are never crowded out by others; the caller decides what of the rest it tells.
   * `total` counts every open probable pair, also those beyond the ones returned.
   */
  async probablePairsOf(
    db: Tx,
    beneficiaryId: string,
    nameWith: readonly Scope[] | null,
  ): Promise<OpenPairs> {
    const rows = await db.$queryRaw<
      {
        other: string;
        rules: DuplicateRule[];
        ben_no: number;
        name: string;
        named: boolean;
        total: bigint;
      }[]
    >`
      SELECT x.id AS other, c.rules, x.ben_no, x.name, ${beneficiaryReachedByAll(nameWith, 'x')} AS named,
        count(*) OVER () AS total
      FROM beneficiary_merge_candidates c
      JOIN beneficiaries x
        ON x.id = CASE WHEN c.low_id = ${beneficiaryId}::uuid THEN c.high_id ELSE c.low_id END
        AND x.merged_into_id IS NULL
      WHERE (c.low_id = ${beneficiaryId}::uuid OR c.high_id = ${beneficiaryId}::uuid)
        AND c.active AND c.level = 'probable'
        AND NOT EXISTS (
          SELECT 1 FROM beneficiary_merge_dismissals d
          WHERE d.low_id = c.low_id AND d.high_id = c.high_id AND d.lifted_at IS NULL)
      ORDER BY named DESC, x.ben_no
      LIMIT ${OPEN_PAIRS_SHOWN}`;
    return {
      rows: rows.map((r) => ({
        beneficiaryId: r.other,
        benNo: formatBenNo(r.ben_no),
        name: r.name,
        matchedOn: [...r.rules].sort(),
        named: r.named,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  /** Both profiles live and inside the scope, or 404 without saying which one is not. */
  private async pairInScope(tx: Tx, actor: Principal, scope: Scope, ids: [string, string]) {
    const found = await tx.beneficiary.findMany({
      where: { AND: [{ id: { in: ids }, mergedIntoId: null }, beneficiaryWhere(scope)] },
      select: { id: true, benNo: true, name: true },
    });
    if (found.length !== 2) {
      this.access.denied(actor.userId, scope.permission, 'beneficiary');
      throw new ApiError('permission.not_found', 404);
    }
    return new Map(found.map((b) => [b.id, b]));
  }

  async dismiss(actor: Principal, scope: Scope, body: DismissalRequest) {
    // the database orders uuids by their value; a lower-cased text sorts the same way
    const [low, high] = [body.beneficiaryId, body.otherBeneficiaryId]
      .map((id) => id.toLowerCase())
      .sort() as [string, string];
    try {
      return await this.prisma.$transaction(async (tx) => {
        const people = await this.pairInScope(tx, actor, scope, [low, high]);
        const active = await tx.mergeDismissal.count({
          where: { lowId: low, highId: high, liftedAt: null },
        });
        if (active) throw new ApiError('beneficiary.dismissed', 409);
        const row = await tx.mergeDismissal.create({
          data: {
            id: uuidv7(),
            lowId: low,
            highId: high,
            reason: body.reason,
            dismissedBy: actor.userId,
          },
        });
        await this.audit.record(tx, {
          action: 'beneficiary.merge_dismissed',
          entityType: 'beneficiary',
          entityId: low,
          new: { dismissalId: row.id, otherBeneficiaryId: high },
          reason: body.reason,
        });
        return this.view(row, people);
      });
    } catch (error) {
      // the same pair marked by someone else in between
      if (isUniqueViolation(error)) throw new ApiError('beneficiary.dismissed', 409);
      throw error;
    }
  }

  async lift(actor: Principal, scope: Scope, dismissalId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM beneficiary_merge_dismissals WHERE id = ${dismissalId}::uuid FOR UPDATE`;
      const found = await tx.mergeDismissal.findFirst({
        where: { id: dismissalId, liftedAt: null },
      });
      if (!found) {
        this.access.denied(actor.userId, scope.permission, 'beneficiary');
        throw new ApiError('permission.not_found', 404);
      }
      const people = await this.pairInScope(tx, actor, scope, [found.lowId, found.highId]);
      const row = await tx.mergeDismissal.update({
        where: { id: dismissalId },
        data: { liftedBy: actor.userId, liftedAt: new Date(), liftReason: reason },
      });
      await this.audit.record(tx, {
        action: 'beneficiary.merge_dismissal_lifted',
        entityType: 'beneficiary',
        entityId: found.lowId,
        new: { dismissalId, otherBeneficiaryId: found.highId },
        reason,
      });
      return this.view(row, people);
    });
  }

  /** The active marks whose pair lies in the caller's scope, newest first. */
  async listDismissals(scope: Scope, limit: number) {
    const inScope = beneficiaryWhere(scope);
    const rows = await this.prisma.mergeDismissal.findMany({
      where: {
        liftedAt: null,
        low: { AND: [{ mergedIntoId: null }, inScope] },
        high: { AND: [{ mergedIntoId: null }, inScope] },
      },
      orderBy: { dismissedAt: 'desc' },
      take: limit,
      include: {
        low: { select: { id: true, benNo: true, name: true } },
        high: { select: { id: true, benNo: true, name: true } },
      },
    });
    return rows.map((r) =>
      this.view(
        r,
        new Map([
          [r.low.id, r.low],
          [r.high.id, r.high],
        ]),
      ),
    );
  }

  private view(
    row: {
      id: string;
      lowId: string;
      highId: string;
      reason: string;
      dismissedBy: string;
      dismissedAt: Date;
      liftedAt: Date | null;
    },
    people: Map<string, { benNo: number; name: string }>,
  ) {
    const a = people.get(row.lowId)!;
    const b = people.get(row.highId)!;
    return {
      id: row.id,
      beneficiaryId: row.lowId,
      otherBeneficiaryId: row.highId,
      benNo: formatBenNo(a.benNo),
      otherBenNo: formatBenNo(b.benNo),
      name: a.name,
      otherName: b.name,
      reason: row.reason,
      dismissedBy: row.dismissedBy,
      dismissedAt: row.dismissedAt.toISOString(),
      liftedAt: row.liftedAt ? row.liftedAt.toISOString() : null,
    };
  }
}
