import { formatBenNo } from '@css/shared/beneficiaries';
import { beneficiaryReachedByAll, type Scope } from '../access/scope.js';
import type { Tx } from '../core/prisma.service.js';

/**
 * Why a beneficiary looks like one family with another: the same mobile or the same union,
 * village and father's or husband's name (two applicants of one project), or the applicant is
 * probably a member an earlier beneficiary listed in their family.
 */
export type FamilyRule = 'mobile' | 'union_village_father' | 'family_member';

/** The rules of the family-duplicate warning between two applicants of one project. */
export type ProjectFamilyRule = Exclude<FamilyRule, 'family_member'>;

export interface FamilyMatch {
  beneficiaryId: string;
  benNo: string;
  name: string;
  matchedOn: ProjectFamilyRule[];
}

/** A relationship a family list gives a member: a code of the list `relationship` and its words. */
export interface MemberRelationship {
  code: string;
  name: { bn: string; en: string } | null;
}

/** An earlier beneficiary whose family list probably holds the applicant. */
export interface FamilyMemberMatch {
  rule: 'family_member';
  headId: string;
  headBenNo: string;
  headName: string;
  /** Every relationship under which the head's list holds the member, by code. */
  relationships: MemberRelationship[];
  /** Whether the scope the caller gave reaches the head. */
  named: boolean;
}

/** The earlier families shown for a person, and how many there are in all. */
export interface FamilyMemberMatches {
  rows: FamilyMemberMatch[];
  total: number;
}

/** At most this many earlier families are named for one applicant. */
const MEMBER_MATCHES_SHOWN = 10;

/**
 * The family signals of the application review. It only tells; the official decides at review
 * with a reason, a household id is never kept, and a family link is always "probably".
 * Names and villages compare through the stored keys (the name key of the shared package, with
 * the spelling variants), so a title or a known variant makes no difference and a missing key
 * matches nobody.
 */
export class BeneficiaryFamilyService {
  /**
   * The family-duplicate warning: the other beneficiaries with an application in the same project
   * who share the person's mobile (wherever they live), or the union, the village and the father's
   * or husband's name. Union and village alone would flag whole villages, so they count only
   * together with the father's or husband's name; a wife and a child of one man are one family,
   * so whether that name is a father's or a husband's does not matter here. A person without a
   * mobile shares it with nobody.
   */
  async matches(tx: Tx, projectId: string, beneficiaryId: string): Promise<FamilyMatch[]> {
    const rows = await tx.$queryRaw<
      { id: string; ben_no: number; name: string; same_mobile: boolean; same_family: boolean }[]
    >`
      SELECT b.id, b.ben_no, b.name,
        COALESCE(b.mobile = me.mobile, false) AS same_mobile,
        COALESCE(b.union_id = me.union_id AND b.village_key = me.village_key
          AND b.guardian_key = me.guardian_key, false) AS same_family
      FROM beneficiaries me
      JOIN applications a ON a.project_id = ${projectId}::uuid AND a.status <> 'deleted'
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      WHERE me.id = ${beneficiaryId}::uuid
        AND b.id <> me.id
        AND b.merged_into_id IS NULL
        AND (b.mobile = me.mobile
          OR (b.union_id = me.union_id AND b.village_key = me.village_key
            AND b.guardian_key = me.guardian_key))
      ORDER BY b.ben_no`;
    return rows.map((r) => ({
      beneficiaryId: r.id,
      benNo: formatBenNo(r.ben_no),
      name: r.name,
      matchedOn: [
        ...(r.same_mobile ? (['mobile'] as const) : []),
        ...(r.same_family ? (['union_village_father'] as const) : []),
      ],
    }));
  }

  /**
   * The earlier beneficiaries whose active family list probably holds the person, in any project:
   * a member with the person's name, in the family of a live profile whose own name is the
   * person's father's or husband's name, in the person's union and village. Each head comes once,
   * with every relationship its list gives the member. Heads the scope `nameWith` reaches come
   * first, so the ones the caller may name are never crowded out by others; `total` counts every
   * head, also those beyond the ones returned.
   */
  async membersOf(
    tx: Tx,
    beneficiaryId: string,
    nameWith: Scope | null,
  ): Promise<FamilyMemberMatches> {
    const rows = await tx.$queryRaw<
      {
        head_id: string;
        ben_no: number;
        name: string;
        named: boolean;
        relationships: { code: string; bn: string | null; en: string | null }[];
        total: bigint;
      }[]
    >`
      WITH heads AS (
        SELECT x.id AS head_id, x.ben_no, x.name,
          ${beneficiaryReachedByAll(nameWith ? [nameWith] : null, 'x')} AS named,
          COALESCE(
            jsonb_agg(DISTINCT jsonb_build_object(
              'code', m.relationship_code, 'bn', r.label_bn, 'en', r.label_en))
              FILTER (WHERE m.relationship_code IS NOT NULL),
            '[]'::jsonb) AS relationships
        FROM beneficiaries me
        JOIN beneficiary_family_members m ON m.name_key = me.name_key AND m.active
        JOIN beneficiaries x ON x.id = m.beneficiary_id AND x.id <> me.id
          AND x.merged_into_id IS NULL
          AND x.name_key = me.guardian_key
          AND x.union_id = me.union_id AND x.village_key = me.village_key
        LEFT JOIN reference_lists r
          ON r.list_key = m.relationship_list AND r.code = m.relationship_code
        WHERE me.id = ${beneficiaryId}::uuid
        GROUP BY x.id
      )
      SELECT head_id, ben_no, name, named, relationships, count(*) OVER () AS total
      FROM heads
      ORDER BY named DESC, ben_no
      LIMIT ${MEMBER_MATCHES_SHOWN}`;
    return {
      rows: rows.map((r) => ({
        rule: 'family_member',
        headId: r.head_id,
        headBenNo: formatBenNo(r.ben_no),
        headName: r.name,
        relationships: r.relationships
          .map((rel) => ({
            code: rel.code,
            name: rel.bn !== null && rel.en !== null ? { bn: rel.bn, en: rel.en } : null,
          }))
          .sort((a, b) => a.code.localeCompare(b.code)),
        named: r.named,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  /**
   * Whether the person is probably a member listed in the family of another applicant of the
   * project: the member signal of the review (`membersOf`), narrowed to the heads with an
   * application in this project.
   */
  async memberInProject(tx: Tx, projectId: string, beneficiaryId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM beneficiaries me
        JOIN beneficiary_family_members m ON m.name_key = me.name_key AND m.active
        JOIN beneficiaries x ON x.id = m.beneficiary_id AND x.id <> me.id
          AND x.merged_into_id IS NULL
          AND x.name_key = me.guardian_key
          AND x.union_id = me.union_id AND x.village_key = me.village_key
        JOIN applications a
          ON a.beneficiary_id = x.id AND a.project_id = ${projectId}::uuid AND a.status <> 'deleted'
        WHERE me.id = ${beneficiaryId}::uuid
      ) AS found`;
    return rows[0]?.found === true;
  }
}
