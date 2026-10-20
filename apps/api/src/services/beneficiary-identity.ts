import { uuidv7 } from '@css/shared';
import {
  formatBenNo,
  isBirthRegNumber,
  isNidNumber,
  LOCKED_FIELDS,
  type LookupRequest,
  parseBenNo,
} from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service';
import { beneficiaryWhere, type Scope } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

/** How far a chain of merges is followed (a kept profile can itself be merged later). */
const MERGE_HOPS = 10;

/** A unique index refused the row, through the client (P2002) or a raw statement (P2010, 23505). */
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === 'P2002' ||
    (error.code === 'P2010' && JSON.stringify(error.meta).includes('23505')));

export interface LookupViewer {
  principal: Principal;
  /** The route's scope: `beneficiary.lookup` on the projects the caller works on. */
  scope: Scope;
}

/** The details of a new profile; the application of T2.5 brings them from its form. */
export interface NewProfile {
  nid?: string;
  birthReg?: string;
  name: string;
  fatherOrHusbandName: string;
  motherName?: string;
  mobile: string;
  genderCode: string;
  dob?: Date;
  ageYears?: number;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId: string;
  village: string;
  postOffice?: string;
  postCode?: string;
  landmark?: string;
  /** The volunteer the application belongs to, when another person enters it. */
  ownerUserId?: string;
}

export interface ProfileWarning {
  code: 'beneficiary.mobile_shared';
  benNos: string[];
}

const AUTOFILL = {
  id: true,
  benNo: true,
  name: true,
  fatherOrHusbandName: true,
  motherName: true,
  mobile: true,
  genderCode: true,
  dob: true,
  ageYears: true,
  divisionId: true,
  districtId: true,
  upazilaId: true,
  unionId: true,
  village: true,
  postOffice: true,
  postCode: true,
  landmark: true,
  members14Plus: true,
  childrenUnder14: true,
  isBlocked: true,
} as const;

/**
 * The identity of a beneficiary (BD-01, BD-02, BD-03): the lookup of the application form with its
 * auto-fill and locked fields, the live profile behind a retired one, and the creation of a
 * profile with every identity check. The lookup returns the full auto-fill wherever the profile
 * lives, because a beneficiary comes back in other projects and regions; it is watched instead,
 * with an audit row for every lookup (never the number) and its own rate limit.
 */
export class BeneficiaryIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * The live profile a profile id leads to: itself, or the kept profile at the end of its merges;
   * null when the id names nothing.
   */
  async liveOf(db: Tx, beneficiaryId: string): Promise<string | null> {
    let id = beneficiaryId;
    for (let hop = 0; hop <= MERGE_HOPS; hop++) {
      const found = await db.beneficiary.findUnique({
        where: { id },
        select: { mergedIntoId: true },
      });
      if (!found) return null;
      if (!found.mergedIntoId) return id;
      id = found.mergedIntoId;
    }
    return null;
  }

  /**
   * The live profiles a search term names by identity: a BEN number of any profile, or an NID or
   * birth-registration number of a profile inside `identityScope`; retired profiles lead to their
   * kept profile. Null when the term is neither.
   */
  async idsByIdentity(term: string, identityScope: Scope | null): Promise<string[] | null> {
    const benNo = parseBenNo(term);
    const digits = term.replace(/\D/g, '');
    const where: Prisma.BeneficiaryWhereInput[] = [];
    if (benNo !== null) where.push({ benNo });
    else if (identityScope && [10, 13, 17].includes(digits.length))
      where.push({
        AND: [{ OR: [{ nid: digits }, { birthReg: digits }] }, beneficiaryWhere(identityScope)],
      });
    else return null;
    const rows = await this.prisma.beneficiary.findMany({
      where: { OR: where },
      select: { id: true },
    });
    const live = await Promise.all(rows.map((r) => this.liveOf(this.prisma, r.id)));
    return [...new Set(live.filter((id): id is string => id !== null))];
  }

  /** The lookup of the application form, inside a project the caller works on. */
  async lookup(viewer: LookupViewer, body: LookupRequest) {
    const project = await this.access.findProject(viewer.scope, body.projectId, { id: true });
    const access = await this.access.load(viewer.principal.userId);
    const nearScope = await this.access.sensitiveScope(
      viewer.principal,
      access,
      'beneficiary.lookup',
      'beneficiary',
    );
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.beneficiary.findFirst({
        where: body.nid ? { nid: body.nid } : { birthReg: body.birthReg },
        select: { id: true },
      });
      const liveId = match ? await this.liveOf(tx, match.id) : null;
      const b = liveId
        ? await tx.beneficiary.findUnique({ where: { id: liveId }, select: AUTOFILL })
        : null;
      if (!b) {
        await this.audit.record(tx, {
          action: 'beneficiary.looked_up',
          entityType: 'beneficiary',
          new: { found: false, projectId: project.id },
        });
        return { found: false as const };
      }
      const [applied, caller, inScope] = await Promise.all([
        tx.application.count({
          where: { projectId: project.id, beneficiaryId: b.id, status: { not: 'deleted' } },
        }),
        tx.user.findUnique({ where: { id: viewer.principal.userId }, select: { mobile: true } }),
        nearScope ? this.access.reaches(nearScope, { beneficiaryId: b.id }, tx) : false,
      ]);
      await this.audit.record(tx, {
        action: 'beneficiary.looked_up',
        entityType: 'beneficiary',
        entityId: b.id,
        new: { found: true, projectId: project.id, outsideScope: !inScope },
      });
      const retired = match && match.id !== b.id;
      return {
        found: true as const,
        blocked: b.isBlocked,
        alreadyAppliedInProject: applied > 0,
        mobileIsCallerOwn: !!caller?.mobile && caller.mobile === b.mobile,
        ...(retired ? { mergedInto: { benNo: b.benNo } } : {}),
        autofill: {
          beneficiaryId: b.id,
          benNo: b.benNo,
          name: b.name,
          fatherOrHusbandName: b.fatherOrHusbandName,
          motherName: b.motherName,
          mobile: b.mobile,
          genderCode: b.genderCode,
          dob: b.dob ? b.dob.toISOString().slice(0, 10) : null,
          ageYears: b.ageYears,
          divisionId: b.divisionId,
          districtId: b.districtId,
          upazilaId: b.upazilaId,
          unionId: b.unionId,
          village: b.village,
          postOffice: b.postOffice,
          postCode: b.postCode,
          landmark: b.landmark,
          members14Plus: b.members14Plus,
          childrenUnder14: b.childrenUnder14,
          lockedFields: [...LOCKED_FIELDS],
        },
      };
    });
  }

  /**
   * Refuses a mobile that belongs to the volunteer entering the profile, or to the volunteer an
   * application belongs to (BD-03); the database refuses the same on every application as well.
   */
  async assertNotVolunteerMobile(db: Tx, mobile: string, userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    const holders = await db.user.count({ where: { id: { in: ids }, mobile } });
    if (holders > 0) throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
  }

  /** The BEN numbers of the other live profiles with this mobile (a warning, never a refusal). */
  async sharedMobile(db: Tx, mobile: string, exceptId?: string): Promise<ProfileWarning[]> {
    const others = await db.beneficiary.findMany({
      where: { mobile, mergedIntoId: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { benNo: true },
      orderBy: { benNo: 'asc' },
      take: 10,
    });
    return others.length
      ? [{ code: 'beneficiary.mobile_shared', benNos: others.map((o) => formatBenNo(o.benNo)) }]
      : [];
  }

  /**
   * A refusal of an identity number another profile holds; it names that profile's BEN number only
   * to a caller whose beneficiary scope reaches it.
   */
  async identityTaken(
    db: Tx,
    actor: Principal,
    holderId: string,
    path: 'nid' | 'birthReg' | 'newValue',
  ): Promise<ApiError> {
    const access = await this.access.load(actor.userId, db);
    const scope = await this.access.sensitiveScope(
      actor,
      access,
      'beneficiary.view_all',
      'beneficiary',
    );
    const holder = await db.beneficiary.findUnique({
      where: { id: holderId },
      select: { benNo: true },
    });
    const sees =
      !!scope && !!holder && (await this.access.reaches(scope, { beneficiaryId: holderId }, db));
    return new ApiError('beneficiary.identity_taken', 409, undefined, [
      {
        path,
        code: 'beneficiary.identity_taken',
        ...(sees && holder ? { params: { benNo: formatBenNo(holder.benNo) } } : {}),
      },
    ]);
  }

  /**
   * Creates a profile inside the caller's transaction: exactly one valid identity number that no
   * other profile holds, a mobile that is not the volunteer's own, and a warning when another
   * profile has the same mobile. The BEN number comes from its sequence.
   */
  async createProfile(tx: Tx, actor: Principal, input: NewProfile) {
    const { nid, birthReg } = input;
    if (!nid && !birthReg) throw new ApiError('beneficiary.identity_missing', 422);
    if (nid !== undefined && !isNidNumber(nid)) throw new ApiError('validation.nid_format', 422);
    if (birthReg !== undefined && !isBirthRegNumber(birthReg))
      throw new ApiError('validation.birth_reg_format', 422);
    const holder = await tx.beneficiary.findFirst({
      where: { OR: [...(nid ? [{ nid }] : []), ...(birthReg ? [{ birthReg }] : [])] },
      select: { id: true, nid: true },
    });
    if (holder)
      throw await this.identityTaken(
        tx,
        actor,
        holder.id,
        nid && holder.nid === nid ? 'nid' : 'birthReg',
      );
    await this.assertNotVolunteerMobile(tx, input.mobile, [
      actor.userId,
      ...(input.ownerUserId ? [input.ownerUserId] : []),
    ]);
    const warnings = await this.sharedMobile(tx, input.mobile);
    try {
      // an explicit insert: the reference-list columns are generated by the database, and Prisma
      // would send their schema default
      const [created] = await tx.$queryRaw<{ id: string; ben_no: number }[]>`
        INSERT INTO beneficiaries (id, nid, birth_reg, name, father_or_husband_name, mother_name,
          mobile, gender_code, dob, age_years, division_id, district_id, upazila_id, union_id,
          village, post_office, post_code, landmark, created_by, updated_by)
        VALUES (${uuidv7()}::uuid, ${nid ?? null}, ${birthReg ?? null}, ${input.name},
          ${input.fatherOrHusbandName}, ${input.motherName ?? null}, ${input.mobile},
          ${input.genderCode}, ${input.dob ?? null}::date, ${input.ageYears ?? null}::smallint,
          ${input.divisionId}::uuid, ${input.districtId}::uuid, ${input.upazilaId}::uuid,
          ${input.unionId}::uuid, ${input.village}, ${input.postOffice ?? null},
          ${input.postCode ?? null}, ${input.landmark ?? null}, ${actor.userId}::uuid,
          ${actor.userId}::uuid)
        RETURNING id, ben_no`;
      return { id: created!.id, benNo: created!.ben_no, warnings };
    } catch (error) {
      // a profile with the same number committed in between
      if (isUniqueViolation(error)) throw new ApiError('beneficiary.identity_taken', 409);
      throw error;
    }
  }
}
