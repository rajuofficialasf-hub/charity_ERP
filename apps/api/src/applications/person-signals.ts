import type { EffectiveAccess } from '../access/effective.js';
import type { AccessService } from '../access/service.js';
import type { Scope } from '../access/scope.js';
import type { Principal } from '../auth/principal.js';
import type { Tx } from '../core/prisma.service.js';
import type { BeneficiaryFamilyService } from '../services/beneficiary-family.js';
import type {
  BeneficiaryMergeCandidatesService,
  DuplicateRule,
} from '../services/beneficiary-merge-candidates.js';

/** Another profile a signal points at, named only where the viewer may open it. */
export interface PersonRef {
  beneficiaryId: string;
  benNo: string;
  name: string;
}

/** The applicant is probably a member an earlier beneficiary listed in their family. */
export interface FamilyMemberSignal {
  relationshipCode: string | null;
  relationship: { bn: string; en: string } | null;
  /** The earlier beneficiary, or null where the viewer may not open that profile. */
  head: PersonRef | null;
}

/** The applicant's profile and another one probably are one person. */
export interface SamePersonSignal {
  level: 'probable';
  matchedOn: DuplicateRule[];
  /** The other profile, or null where the viewer may not open both and compare them. */
  other: PersonRef | null;
}

export interface PersonSignalsView {
  familyMemberSignals: FamilyMemberSignal[];
  samePersonSignals: SamePersonSignal[];
}

/** A profile the viewer may open: the beneficiary tab's permission reaches it. */
const OPEN_PROFILE = 'beneficiary.view_all';
/** Two profiles the viewer may compare: the duplicates' permission reaches both. */
const COMPARE_PAIR = 'beneficiary.merge.dismiss';

/**
 * What the review tells about the applicant's person beyond this project: the earlier families
 * that probably hold them as a member, and the open probable pairs with another profile. Both
 * only tell, never refuse. Another profile is named only where the viewer's scope reaches it,
 * so a signal never gives away a person the viewer could not look up; otherwise it says only
 * that such a profile exists.
 */
export class PersonSignals {
  constructor(
    private readonly access: AccessService,
    private readonly family: BeneficiaryFamilyService,
    private readonly candidates: BeneficiaryMergeCandidatesService,
  ) {}

  async forPerson(
    db: Tx,
    principal: Principal,
    access: EffectiveAccess,
    beneficiaryId: string,
  ): Promise<PersonSignalsView> {
    const [members, pairs] = await Promise.all([
      this.family.membersOf(db, beneficiaryId),
      this.candidates.probablePairsOf(db, beneficiaryId),
    ]);
    if (!members.length && !pairs.length) return { familyMemberSignals: [], samePersonSignals: [] };
    const [profiles, compare] = await Promise.all([
      this.access.sensitiveScope(principal, access, OPEN_PROFILE, 'beneficiary'),
      pairs.length
        ? this.access.sensitiveScope(principal, access, COMPARE_PAIR, 'beneficiary')
        : null,
    ]);
    const reaches = async (scope: Scope | null, id: string) =>
      !!scope && (await this.access.reaches(scope, { beneficiaryId: id }, db));
    const comparesAll = async (id: string) =>
      (await reaches(profiles, id)) &&
      (await reaches(compare, id)) &&
      (await reaches(profiles, beneficiaryId)) &&
      (await reaches(compare, beneficiaryId));
    const familyMemberSignals: FamilyMemberSignal[] = [];
    for (const m of members)
      familyMemberSignals.push({
        relationshipCode: m.relationshipCode,
        relationship: m.relationship,
        head: (await reaches(profiles, m.headId))
          ? { beneficiaryId: m.headId, benNo: m.headBenNo, name: m.headName }
          : null,
      });
    const samePersonSignals: SamePersonSignal[] = [];
    for (const p of pairs)
      samePersonSignals.push({
        level: 'probable',
        matchedOn: p.matchedOn,
        other: (await comparesAll(p.beneficiaryId))
          ? { beneficiaryId: p.beneficiaryId, benNo: p.benNo, name: p.name }
          : null,
      });
    return { familyMemberSignals, samePersonSignals };
  }
}
