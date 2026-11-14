import type { EffectiveAccess } from '../access/effective.js';
import type { AccessService } from '../access/service.js';
import type { Scope } from '../access/scope.js';
import type { Principal } from '../auth/principal.js';
import type { Tx } from '../core/prisma.service.js';
import type {
  BeneficiaryFamilyService,
  MemberRelationship,
} from '../services/beneficiary-family.js';
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

/** How sure a signal is: both signals are probable, never certain. */
const PROBABLE = { level: 'probable' } as const;
type SignalLevel = typeof PROBABLE;

/**
 * The applicant is probably a member an earlier beneficiary listed in their family. Where the
 * viewer may not open the head, the signal carries its level alone.
 */
export type FamilyMemberSignal =
  (SignalLevel & { relationships: MemberRelationship[]; head: PersonRef }) | SignalLevel;

/**
 * The applicant's profile and another one probably are one person. Where the viewer may not open
 * both and compare them, the signal carries its level alone.
 */
export type SamePersonSignal =
  (SignalLevel & { matchedOn: DuplicateRule[]; other: PersonRef }) | SignalLevel;

export interface PersonSignalsView {
  familyMemberSignals: FamilyMemberSignal[];
  /** How many earlier families there are in all, also beyond the ones listed. */
  familyMemberSignalsTotal: number;
  samePersonSignals: SamePersonSignal[];
  /** How many open probable pairs there are in all, also beyond the ones listed. */
  samePersonSignalsTotal: number;
}

/** No signal: a volunteer's read, or a record without a person. */
export const NO_PERSON_SIGNALS: PersonSignalsView = {
  familyMemberSignals: [],
  familyMemberSignalsTotal: 0,
  samePersonSignals: [],
  samePersonSignalsTotal: 0,
};

/** A profile the viewer may open: the beneficiary tab's permission reaches it. */
const OPEN_PROFILE = 'beneficiary.view_all';
/** Two profiles the viewer may compare: the duplicates' permission reaches both. */
const COMPARE_PAIR = 'beneficiary.merge.dismiss';

/**
 * What the review tells about the applicant's person beyond this project: the earlier families
 * that probably hold them as a member, and the open probable pairs with another profile. Both
 * only tell, never refuse. Another profile is named only where the viewer's scope reaches it, so
 * a signal never gives away a person the viewer could not look up; otherwise it says no more than
 * that such a profile exists. The scopes are applied in the queries, before their limit, so the
 * profiles the viewer may open are listed first.
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
    const [profiles, compare] = await Promise.all([
      this.access.sensitiveScope(principal, access, OPEN_PROFILE, 'beneficiary'),
      this.access.sensitiveScope(principal, access, COMPARE_PAIR, 'beneficiary'),
    ]);
    const reaches = async (scope: Scope | null) =>
      !!scope && (await this.access.reaches(scope, { beneficiaryId }, db));
    // a pair is compared from the applicant's side too: both scopes must reach the applicant
    const [opensOwn, comparesOwn] = await Promise.all([reaches(profiles), reaches(compare)]);
    const pairScopes = profiles && compare && opensOwn && comparesOwn ? [profiles, compare] : null;
    const [members, pairs] = await Promise.all([
      this.family.membersOf(db, beneficiaryId, profiles),
      this.candidates.probablePairsOf(db, beneficiaryId, pairScopes),
    ]);
    return {
      familyMemberSignals: members.rows.map((m) =>
        m.named
          ? {
              ...PROBABLE,
              relationships: m.relationships,
              head: { beneficiaryId: m.headId, benNo: m.headBenNo, name: m.headName },
            }
          : PROBABLE,
      ),
      familyMemberSignalsTotal: members.total,
      samePersonSignals: pairs.rows.map((p) =>
        p.named
          ? {
              ...PROBABLE,
              matchedOn: p.matchedOn,
              other: { beneficiaryId: p.beneficiaryId, benNo: p.benNo, name: p.name },
            }
          : PROBABLE,
      ),
      samePersonSignalsTotal: pairs.total,
    };
  }
}
