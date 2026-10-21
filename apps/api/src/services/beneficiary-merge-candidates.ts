import { uuidv7 } from '@css/shared';
import { type DismissalRequest, formatBenNo } from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service';
import { beneficiaryScopeSql, beneficiaryWhere, type Scope } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import { boundedRead } from '../core/bounded-read';
import { decodeCursor, encodeCursor, type PageQuery } from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import { isUniqueViolation } from './beneficiary-identity';

/** Why two profiles look like one person, in the order the suggestions name the rules. */
export type DuplicateRule = 'name_dob_union' | 'name_father_mobile' | 'same_mobile';

type PairRow = { low: string; high: string; rules: DuplicateRule[] };

/** The nightly recomputation reads every profile once; it may take a while on a large table. */
const FULL_REFRESH = { maxWait: 10_000, timeout: 600_000 };

/**
 * The pairs of one rule set as SQL over the live profiles `x` and `y` (`x.id < y.id`): by one
 * mobile (with the stronger rule of the same name and father's or husband's name), and by the same
 * name, date of birth and union. Names compare through `person_name_key`, as the indexes do.
 */
const PAIRS_BY_MOBILE = Prisma.sql`
  SELECT x.id AS low, y.id AS high,
    array_remove(ARRAY[
      CASE WHEN person_name_key(x.name) = person_name_key(y.name)
        AND person_name_key(x.father_or_husband_name) = person_name_key(y.father_or_husband_name)
        THEN 'name_father_mobile' END,
      'same_mobile'], NULL) AS rules
  FROM beneficiaries x
  JOIN beneficiaries y ON y.mobile = x.mobile AND x.id < y.id AND y.merged_into_id IS NULL
  WHERE x.merged_into_id IS NULL`;
const PAIRS_BY_DOB = Prisma.sql`
  SELECT x.id AS low, y.id AS high, ARRAY['name_dob_union'] AS rules
  FROM beneficiaries x
  JOIN beneficiaries y ON person_name_key(y.name) = person_name_key(x.name) AND y.dob = x.dob
    AND y.union_id = x.union_id AND x.id < y.id AND y.merged_into_id IS NULL AND y.dob IS NOT NULL
  WHERE x.merged_into_id IS NULL AND x.dob IS NOT NULL`;

/**
 * The suggested duplicate profiles (the merge rules in docs/DECISION_LOG.md): pairs of live
 * profiles with the same name, father's or husband's name and mobile; the same name, date of birth
 * and union; or the same mobile. The pairs are kept in `beneficiary_merge_candidates`: a profile's
 * own pairs are recomputed in the transaction that changes it, and a nightly job recomputes them all;
 * a pair that no longer holds is marked inactive, never deleted. The list reads the active pairs
 * whose two profiles are live and inside the caller's scope and not marked as different people.
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
   * profile's own mobile and name, so it stays cheap on a large table. A retired profile keeps no
   * active pair.
   */
  async refreshFor(tx: Tx, beneficiaryIds: string[]): Promise<void> {
    for (const id of new Set(beneficiaryIds)) {
      await tx.$executeRaw`
        WITH me AS (
          SELECT * FROM beneficiaries WHERE id = ${id}::uuid AND merged_into_id IS NULL
        ), found AS (
          SELECT LEAST(me.id, o.id) AS low, GREATEST(me.id, o.id) AS high,
            array_remove(ARRAY[
              CASE WHEN o.dob = me.dob AND o.union_id = me.union_id
                AND person_name_key(o.name) = person_name_key(me.name) THEN 'name_dob_union' END,
              CASE WHEN o.mobile = me.mobile AND person_name_key(o.name) = person_name_key(me.name)
                AND person_name_key(o.father_or_husband_name) = person_name_key(me.father_or_husband_name)
                THEN 'name_father_mobile' END,
              CASE WHEN o.mobile = me.mobile THEN 'same_mobile' END], NULL) AS rules
          FROM me JOIN beneficiaries o ON o.id <> me.id AND o.merged_into_id IS NULL
            AND (o.mobile = me.mobile
              OR (person_name_key(o.name) = person_name_key(me.name) AND o.dob = me.dob
                AND o.union_id = me.union_id))
        ), gone AS (
          UPDATE beneficiary_merge_candidates c SET active = false, computed_at = now()
          WHERE (c.low_id = ${id}::uuid OR c.high_id = ${id}::uuid) AND c.active
            AND NOT EXISTS (SELECT 1 FROM found f WHERE f.low = c.low_id AND f.high = c.high_id)
        )
        INSERT INTO beneficiary_merge_candidates (low_id, high_id, rules, active, computed_at)
        SELECT low, high, rules, true, now() FROM found
        ON CONFLICT (low_id, high_id) DO UPDATE
          SET rules = EXCLUDED.rules, active = true, computed_at = EXCLUDED.computed_at`;
    }
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
        INSERT INTO beneficiary_merge_candidates (low_id, high_id, rules, active, computed_at)
        SELECT p.low, p.high, array_agg(DISTINCT r ORDER BY r), true, ${started}
        FROM (${PAIRS_BY_MOBILE} UNION ALL ${PAIRS_BY_DOB}) p, unnest(p.rules) AS r
        GROUP BY p.low, p.high
        ON CONFLICT (low_id, high_id) DO UPDATE
          SET rules = EXCLUDED.rules, active = true, computed_at = EXCLUDED.computed_at`);
      await tx.$executeRaw`
        UPDATE beneficiary_merge_candidates SET active = false
        WHERE active AND computed_at < ${started}`;
      const active = await tx.mergeCandidate.count({ where: { active: true } });
      return { active };
    }, FULL_REFRESH);
  }

  async list(actor: Principal, scope: Scope, query: Omit<PageQuery, 'sort'>) {
    const binding = `beneficiaries.mergeCandidates|${actor.userId}`;
    const after = query.cursor ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor) : null;
    if (after && after.d !== 'next')
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'cursor', code: 'validation.failed' },
      ]);
    const [low, high] = (after?.v ?? []) as [string?, string?];
    const fetched = await boundedRead(this.prisma, async (tx) => {
      const pairs = await tx.$queryRaw<PairRow[]>(Prisma.sql`
        SELECT c.low_id AS low, c.high_id AS high, c.rules
        FROM beneficiary_merge_candidates c
        JOIN beneficiaries x ON x.id = c.low_id AND x.merged_into_id IS NULL
        JOIN beneficiaries y ON y.id = c.high_id AND y.merged_into_id IS NULL
        WHERE c.active
          AND ${beneficiaryScopeSql(scope, 'x')} AND ${beneficiaryScopeSql(scope, 'y')}
          AND NOT EXISTS (
            SELECT 1 FROM beneficiary_merge_dismissals d
            WHERE d.low_id = c.low_id AND d.high_id = c.high_id AND d.lifted_at IS NULL)
          ${low && high ? Prisma.sql`AND (c.low_id, c.high_id) > (${low}::uuid, ${high}::uuid)` : Prisma.empty}
        ORDER BY c.low_id, c.high_id
        LIMIT ${query.limit + 1}`);
      const ids = [...new Set(pairs.flatMap((p) => [p.low, p.high]))];
      const people = await tx.beneficiary.findMany({
        where: { id: { in: ids } },
        select: { id: true, benNo: true, name: true },
      });
      return { pairs, people: new Map(people.map((p) => [p.id, p])) };
    });
    const more = fetched.pairs.length > query.limit;
    const pairs = fetched.pairs.slice(0, query.limit);
    const last = pairs.at(-1);
    const rows = pairs.map((p) => {
      const a = fetched.people.get(p.low)!;
      const b = fetched.people.get(p.high)!;
      return {
        beneficiaryId: p.low,
        otherBeneficiaryId: p.high,
        benNo: formatBenNo(a.benNo),
        otherBenNo: formatBenNo(b.benNo),
        name: a.name,
        otherName: b.name,
        matchedOn: [...p.rules].sort(),
      };
    });
    return {
      rows,
      meta: {
        nextCursor:
          more && last
            ? encodeCursor(this.env.CURSOR_SECRET, binding, { v: [last.low, last.high], d: 'next' })
            : null,
        prevCursor: null,
        limit: query.limit,
      },
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
    const [low, high] = [body.beneficiaryId, body.otherBeneficiaryId].sort() as [string, string];
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
