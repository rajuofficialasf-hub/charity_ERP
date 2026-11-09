import { formatBenNo } from '@css/shared/beneficiaries';
import type { Tx } from '../core/prisma.service';

/** Why two beneficiaries of one project look like one family. */
export type FamilyRule = 'mobile' | 'union_village_father';

export interface FamilyMatch {
  beneficiaryId: string;
  benNo: string;
  name: string;
  matchedOn: FamilyRule[];
}

/**
 * The family-duplicate warning of the application review: the other beneficiaries with an
 * application in the same project who share the person's mobile (wherever they live), or the
 * union, the village and the father's or husband's name (compared through `person_name_key`, as
 * the duplicate indexes are). It only warns; the official decides at review with a reason, and a
 * household id is never kept. Union and village alone would flag whole villages, so they count
 * only together with the father's or husband's name.
 */
export class BeneficiaryFamilyService {
  async matches(tx: Tx, projectId: string, beneficiaryId: string): Promise<FamilyMatch[]> {
    const rows = await tx.$queryRaw<
      { id: string; ben_no: number; name: string; same_mobile: boolean; same_family: boolean }[]
    >`
      SELECT b.id, b.ben_no, b.name,
        b.mobile = me.mobile AS same_mobile,
        (b.union_id = me.union_id
          AND person_name_key(b.village) = person_name_key(me.village)
          AND person_name_key(b.father_or_husband_name) = person_name_key(me.father_or_husband_name)
        ) AS same_family
      FROM beneficiaries me
      JOIN applications a ON a.project_id = ${projectId}::uuid AND a.status <> 'deleted'
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      WHERE me.id = ${beneficiaryId}::uuid
        AND b.id <> me.id
        AND b.merged_into_id IS NULL
        AND (b.mobile = me.mobile
          OR (b.union_id = me.union_id
            AND person_name_key(b.village) = person_name_key(me.village)
            AND person_name_key(b.father_or_husband_name) = person_name_key(me.father_or_husband_name)))
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
}
