import { formatBenNo } from '@css/shared/beneficiaries';
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

/** An earlier beneficiary whose family list probably holds the applicant. */
export interface FamilyMemberMatch {
  rule: 'family_member';
  headId: string;
  headBenNo: string;
  headName: string;
  /** The relationship the head's list gives the member (a code of the list `relationship`). */
  relationshipCode: string | null;
  /** That relationship in the list's words. */
  relationship: { bn: string; en: string } | null;
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
   * person's father's or husband's name, in the person's union and village. The relationship is
   * the one the head's list gives.
   */
  async membersOf(tx: Tx, beneficiaryId: string): Promise<FamilyMemberMatch[]> {
    const rows = await tx.$queryRaw<
      {
        head_id: string;
        ben_no: number;
        name: string;
        relationship_code: string | null;
        label_bn: string | null;
        label_en: string | null;
      }[]
    >`
      SELECT DISTINCT ON (h.ben_no, m.relationship_code)
        h.id AS head_id, h.ben_no, h.name, m.relationship_code,
        r.label_bn, r.label_en
      FROM beneficiaries me
      JOIN beneficiary_family_members m ON m.name_key = me.name_key AND m.active
      JOIN beneficiaries h ON h.id = m.beneficiary_id AND h.id <> me.id
        AND h.merged_into_id IS NULL
        AND h.name_key = me.guardian_key
        AND h.union_id = me.union_id AND h.village_key = me.village_key
      LEFT JOIN reference_lists r
        ON r.list_key = m.relationship_list AND r.code = m.relationship_code
      WHERE me.id = ${beneficiaryId}::uuid
      ORDER BY h.ben_no, m.relationship_code
      LIMIT ${MEMBER_MATCHES_SHOWN}`;
    return rows.map((r) => ({
      rule: 'family_member',
      headId: r.head_id,
      headBenNo: formatBenNo(r.ben_no),
      headName: r.name,
      relationshipCode: r.relationship_code,
      relationship:
        r.label_bn !== null && r.label_en !== null ? { bn: r.label_bn, en: r.label_en } : null,
    }));
  }
}
