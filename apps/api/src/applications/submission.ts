import {
  GUARDIAN_RELATION_COLUMN,
  guardianRelationToFill,
  MOBILE_OWNER_COLUMN,
  MOBILE_OWNER_NAME_COLUMN,
  MOBILE_OWNER_NAME_MAX,
  mobileOwnerOf,
} from '@css/shared/beneficiaries';
import { type FormDefinition, identityColumn, indexFields, split } from '@css/shared/forms';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { isForeignKeyViolation } from '../core/db-errors.js';
import type { Tx } from '../core/prisma.service.js';
import { currentContext } from '../core/request-context.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { BeneficiaryContactService, ContactChange } from '../services/beneficiary-contact.js';
import type { BeneficiaryFamilyMembersService } from '../services/beneficiary-family-members.js';
import {
  type BeneficiaryIdentityService,
  type NewProfile,
  personKeysOf,
} from '../services/beneficiary-identity.js';
import { readDefinition } from '../services/forms.js';
import { IDENTITY_RULES_SELECT, identityRulesOf } from '../services/project-identity-rules.js';
import { identityOf, readAnswers } from './answers.js';

/** The contact columns an application's answers may change on a known person's profile. */
const CONTACT_COLUMNS = {
  mobile: 'mobile',
  division_id: 'divisionId',
  district_id: 'districtId',
  upazila_id: 'upazilaId',
  union_id: 'unionId',
  village: 'village',
  post_office: 'postOffice',
  post_code: 'postCode',
  landmark: 'landmark',
} as const;

const NUMBER_WIDTH = 5;

const text = (standard: Record<string, unknown>, column: string): string | undefined => {
  const value = standard[column];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * Raised inside a move that would make a profile when the new person looks like someone on the
 * block list: no profile is made and the move is abandoned. Once the transaction has rolled back
 * the caller holds a sent entry for an official, or marks an entry an official was verifying;
 * this is never an answer to a client.
 */
export class BlockedNamesakeMatch extends Error {
  constructor(
    /** The blocked live profile the person looks like. */
    readonly beneficiaryId: string,
  ) {
    super('the new person of this application looks like a blocked profile');
    this.name = 'BlockedNamesakeMatch';
  }
}

/**
 * The standard columns of an application's answers and the rows of its family group, as the
 * official definition reads them.
 */
export async function standardOf(tx: Tx, applicationId: string, formVersionId: string) {
  const definition = await readDefinition(tx, formVersionId, 'official');
  const { standard, familyMembers } = split(
    definition,
    await readAnswers(tx, applicationId, definition),
  );
  return { definition, standard, familyMembers };
}

/**
 * What a submission adds to an application around the engine's move: with it, the person (the
 * live profile behind the number when one exists by now, else a profile created from the answers;
 * without a number, where the project asks the document only "if they have one", a profile
 * without a document), since a submitted application always has its person, and a known person's
 * new mobile or address written to the profile with its change log when the submitter may edit
 * that profile's contact data (otherwise the application keeps the new values for the office to
 * see), and with the mobile whose number it is and that person's name, on a new profile and on a
 * known one alike, and whether the name beside the person is the father's or the husband's, on a
 * new profile and on a known one that holds none (a submission never changes one it holds),
 * and the family members its answers list, which replace the person's active members unless a
 * list of an application submitted later stands; after it,
 * the number of the project in the order the office receives the applications
 * (`<code>-<year>-<5 digits>`). Both run in the move's transaction, so a refused move leaves
 * neither behind. A new person, with or without a number, is compared with the block list right
 * before the profile is made: a match makes none and raises `BlockedNamesakeMatch`, unless an
 * official is deciding an entry that already shows that match.
 */
export class SubmissionWriter {
  constructor(
    private readonly access: AccessService,
    private readonly identity: BeneficiaryIdentityService,
    private readonly contact: BeneficiaryContactService,
    private readonly audit: AuditWriter,
    private readonly familyMembers: BeneficiaryFamilyMembersService,
  ) {}

  /**
   * `movedAt` is the time of the move that runs the binding, the one the engine stamps as a
   * draft's submission: the order of the family lists compares that very value.
   */
  async bindPerson(
    tx: Tx,
    actor: Principal,
    applicationId: string,
    movedAt: Date,
    options: {
      writeContact?: boolean;
      ownerUserId?: string;
      /**
       * The live profile an official linked an entry without a number to; an entry with a number
       * is bound by that number and this is not read.
       */
      linkBeneficiaryId?: string;
      /**
       * An official is deciding an entry that waits for verification with the flag of a person
       * who looks like a blocked one, so has compared the two: the comparison is not made again,
       * or the entry could never leave. An entry that waits for another reason is compared.
       */
      compared?: boolean;
    } = {},
  ): Promise<Prisma.ApplicationUncheckedUpdateInput> {
    const row = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        id: true,
        projectId: true,
        formVersionId: true,
        beneficiaryId: true,
        identityKind: true,
        createdByUserId: true,
        submittedAt: true,
        ownerVolunteer: { select: { userId: true } },
        // the project's own rule, read in the move's transaction
        project: { select: IDENTITY_RULES_SELECT },
      },
    });
    const rules = identityRulesOf(row.project);
    const { definition, standard, familyMembers } = await standardOf(
      tx,
      applicationId,
      row.formVersionId,
    );
    const identity = identityOf(standard);
    const number = identity?.number;
    const nid = identity?.column === 'nid' ? identity.number : undefined;
    const birthReg = identity?.column === 'birth_reg' ? identity.number : undefined;
    let { beneficiaryId, identityKind } = row;
    let profileCreated = false;
    if (!beneficiaryId && number) {
      // a profile for the number may exist by now (another application, a public entry): it is
      // bound like a lookup would, never refused as a duplicate of itself
      const live = await this.liveProfile(tx, number);
      if (live) {
        await this.identity.assertMayApply(tx, live);
        beneficiaryId = live;
        identityKind = identityColumn(number);
      }
    } else if (!beneficiaryId && options.linkBeneficiaryId) {
      // a blocked person stays refused here, as on every new application
      await this.identity.assertMayApply(tx, options.linkBeneficiaryId);
      beneficiaryId = options.linkBeneficiaryId;
      identityKind = 'none';
    } else if (!beneficiaryId && rules.document !== 'optional') {
      // without a number there is no profile to make; the engine's identity guard refuses the move
      return {};
    }
    if (!beneficiaryId) {
      const mobile = text(standard, 'mobile');
      // a person without a number of their own is reached through the volunteer, where the
      // project allows it; elsewhere a profile needs its mobile as before
      if (!mobile && rules.mobile !== 'optional')
        throw new ApiError('validation.mobile_format', 422);
      // the creating team member's own mobile is refused as the person's, like the owner's (one
      // chosen at a verification too, which the row does not hold yet)
      const volunteers = [row.createdByUserId, options.ownerUserId].filter((id): id is string =>
        Boolean(id),
      );
      if (volunteers.length && mobile)
        await this.identity.assertNotVolunteerMobile(tx, mobile, volunteers);
      const dob = text(standard, 'dob');
      const genderCode = text(standard, 'gender_code');
      if (genderCode) await this.assertListed(tx, definition, genderCode);
      const owner = this.mobileOwner(definition, standard);
      // a blocked person does not come back as a new profile, with a new number or with none
      if (!options.compared) {
        const namesake = await this.namesake(tx, standard);
        if (namesake) throw new BlockedNamesakeMatch(namesake);
      }
      const profile = await this.createProfile(tx, actor, {
        ...(nid ? { nid } : {}),
        ...(birthReg ? { birthReg } : {}),
        name: text(standard, 'name') ?? '',
        fatherOrHusbandName: text(standard, 'father_or_husband_name') ?? '',
        guardianRelationCode: text(standard, GUARDIAN_RELATION_COLUMN) ?? null,
        motherName: text(standard, 'mother_name'),
        ...(mobile ? { mobile } : {}),
        mobileOwnerCode: owner.code,
        mobileOwnerName: owner.name,
        genderCode: text(standard, 'gender_code') ?? '',
        dob: dob ? new Date(dob) : undefined,
        ageYears: typeof standard.age_years === 'number' ? standard.age_years : undefined,
        divisionId: text(standard, 'division_id') ?? '',
        districtId: text(standard, 'district_id') ?? '',
        upazilaId: text(standard, 'upazila_id') ?? '',
        unionId: text(standard, 'union_id') ?? '',
        village: text(standard, 'village') ?? '',
        postOffice: text(standard, 'post_office'),
        postCode: text(standard, 'post_code'),
        landmark: text(standard, 'landmark'),
        ownerUserId: options.ownerUserId ?? row.ownerVolunteer?.userId,
        documentOptional: rules.document === 'optional',
      } satisfies NewProfile);
      beneficiaryId = profile.id;
      identityKind = nid ? 'nid' : birthReg ? 'birth_reg' : 'none';
      profileCreated = true;
      // who made the profile, on which project and under which rule: a profile without a document
      // has no number to trace it by
      await this.audit.record(tx, {
        action: 'beneficiary.create',
        entityType: 'beneficiary',
        entityId: profile.id,
        new: {
          benNo: profile.benNo,
          applicationId,
          projectId: row.projectId,
          identityDocument: rules.document,
          mobileRule: rules.mobile,
          document: identityKind,
          hasMobile: Boolean(mobile),
          madeBy: actor.userId,
        },
      });
    } else if (options.writeContact !== false) {
      // whether the name is the father's or the husband's, given to a profile that has none
      await this.fillGuardianRelation(tx, actor, applicationId, beneficiaryId, standard);
      if (await this.contact.mayEdit(tx, actor, beneficiaryId)) {
        const before = await this.contact.locked(tx, beneficiaryId);
        const body: Record<string, unknown> = {};
        for (const [column, field] of Object.entries(CONTACT_COLUMNS)) {
          const value = text(standard, column);
          if (value !== undefined) body[field] = value;
        }
        // whose number it is, only where the answers give the number and say whose
        const owner = this.mobileOwner(definition, standard);
        if (owner.code) {
          body.mobileOwnerCode = owner.code;
          body.mobileOwnerName = owner.name;
        }
        try {
          await this.contact.apply(tx, actor, before, body as ContactChange);
        } catch (error) {
          throw unlisted(error);
        }
      }
    }
    // the family the answers list, at the send and at a verification alike: the order of the
    // lists is the order of the applications' submission, so a list that arrives late never
    // replaces a newer one. A draft is stamped with its submission by the move that runs this,
    // with the move's own time.
    await this.familyMembers.replaceFrom(tx, actor, {
      beneficiaryId,
      applicationId,
      submittedAt: row.submittedAt ?? movedAt,
      definition,
      rows: familyMembers,
    });
    if (beneficiaryId === row.beneficiaryId && identityKind === row.identityKind) return {};
    await this.audit.record(tx, {
      action: 'application.person_bound',
      entityType: 'application',
      entityId: applicationId,
      new: { beneficiaryId, identityKind, profileCreated },
    });
    // written with the new state by the engine, in one statement
    return { beneficiaryId, identityKind };
  }

  /**
   * The identity number of the application's answers with the live profile behind it; both null
   * for an entry without a number.
   */
  async identityHolder(
    tx: Tx,
    applicationId: string,
  ): Promise<{ number: string | null; holder: string | null }> {
    const row = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { formVersionId: true },
    });
    const { standard } = await standardOf(tx, applicationId, row.formVersionId);
    const number = identityOf(standard)?.number ?? null;
    return { number, holder: number ? await this.liveProfile(tx, number) : null };
  }

  /**
   * The blocked profile the person of these answers looks like, where a send would make a new
   * profile for them: with a number no live profile holds, or without a number where the project
   * lets the document be left out. Null in every other case (a number a live profile holds binds
   * that profile, and nothing is made), and for a person whose name, father's or husband's name,
   * union or village is missing.
   */
  async blockedLookalike(
    tx: Tx,
    standard: Record<string, unknown>,
    documentRule: 'required' | 'optional',
  ): Promise<string | null> {
    const identity = identityOf(standard);
    const makesProfile = identity
      ? (await this.liveProfile(tx, identity.number)) === null
      : documentRule === 'optional';
    return makesProfile ? this.namesake(tx, standard) : null;
  }

  /** The blocked live profile with this person's name, father's or husband's name and village. */
  private async namesake(tx: Tx, standard: Record<string, unknown>): Promise<string | null> {
    const person = personKeysOf(standard);
    return person ? this.identity.blockedNamesake(tx, person) : null;
  }

  /** The live profile holding the number, through a retired profile's chain, or null. */
  private async liveProfile(tx: Tx, number: string): Promise<string | null> {
    const holder = await tx.beneficiary.findFirst({
      where: identityColumn(number) === 'nid' ? { nid: number } : { birthReg: number },
      select: { id: true, mergedIntoId: true },
    });
    if (!holder) return null;
    return holder.mergedIntoId ? this.identity.liveOf(tx, holder.id) : holder.id;
  }

  /**
   * The person's gender answer is a code of the gender list, as the profile requires. An older
   * version of a form could carry options of its own (codes such as `opt_…`), so a draft made on
   * it can hold a code the list never had: the volunteer is told which question, in the request's
   * language, and that the draft has to be made again on the current form.
   */
  private async assertListed(tx: Tx, definition: FormDefinition, code: string): Promise<void> {
    const listed = await tx.referenceList.findFirst({
      where: { listKey: 'gender', code },
      select: { id: true },
    });
    if (listed) return;
    const field = [...indexFields(definition).values()].find(
      (located) => located.field.standardColumn === 'gender_code',
    )?.field;
    // an empty answer, or one no question holds, keeps the profile's own refusal
    if (!field) return;
    const locale = currentContext()?.locale ?? 'bn';
    throw new ApiError('application.answer_not_in_list', 422, { question: field.label[locale] }, [
      { path: `answers.${field.fieldKey}`, code: 'validation.option_unknown' },
    ]);
  }

  /**
   * Whose number the answers' mobile is, as the profile keeps it: nothing without a mobile, and
   * the owner's name only beside someone else than the person. A name longer than the profile
   * takes is refused on its question.
   */
  private mobileOwner(definition: FormDefinition, standard: Record<string, unknown>) {
    const owner = mobileOwnerOf(
      text(standard, 'mobile'),
      text(standard, MOBILE_OWNER_COLUMN),
      text(standard, MOBILE_OWNER_NAME_COLUMN),
    );
    if (owner.name && owner.name.length > MOBILE_OWNER_NAME_MAX) {
      const field = [...indexFields(definition).values()].find(
        (located) => located.field.standardColumn === MOBILE_OWNER_NAME_COLUMN,
      )?.field;
      throw new ApiError('validation.failed', 422, undefined, [
        {
          path: field ? `answers.${field.fieldKey}` : 'answers',
          code: 'validation.too_long',
          params: { max: MOBILE_OWNER_NAME_MAX },
        },
      ]);
    }
    return owner;
  }

  /** The profile from the answers; a code outside its reference list is the form's mistake, not the server's. */
  private async createProfile(tx: Tx, actor: Principal, input: NewProfile) {
    try {
      return await this.identity.createProfile(tx, actor, input);
    } catch (error) {
      throw unlisted(error);
    }
  }

  /**
   * Gives a known person's profile the answer whether the name beside them is the father's or the
   * husband's, only where the profile holds none: the relation describes a locked name, so a
   * relation already on the profile is never changed by an application. Any submitter's answer
   * may fill it, as it fills a new profile; an unlisted code is the form's mistake (422).
   */
  private async fillGuardianRelation(
    tx: Tx,
    actor: Principal,
    applicationId: string,
    beneficiaryId: string,
    standard: Record<string, unknown>,
  ): Promise<void> {
    const answered = text(standard, GUARDIAN_RELATION_COLUMN);
    if (!answered) return;
    const current = await tx.beneficiary.findUniqueOrThrow({
      where: { id: beneficiaryId },
      select: { guardianRelationCode: true },
    });
    const code = guardianRelationToFill(current.guardianRelationCode, answered);
    if (!code) return;
    try {
      // the condition holds the rule against a write that came in between
      const { count } = await tx.beneficiary.updateMany({
        where: { id: beneficiaryId, guardianRelationCode: null },
        data: { guardianRelationCode: code, updatedBy: actor.userId },
      });
      if (!count) return;
    } catch (error) {
      throw unlisted(error);
    }
    await this.audit.record(tx, {
      action: 'beneficiary.guardian_relation_set',
      entityType: 'beneficiary',
      entityId: beneficiaryId,
      old: { guardianRelationCode: null },
      new: { guardianRelationCode: code, applicationId },
    });
  }

  /** The number, once the application is in the office's hands. */
  async number(tx: Tx, actor: Principal, applicationId: string): Promise<void> {
    const row = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { projectId: true, appNo: true, project: { select: { code: true, year: true } } },
    });
    if (row.appNo) return;
    const appNo = await this.nextNumber(tx, row.projectId, row.project);
    await tx.application.update({
      where: { id: applicationId },
      data: { appNo, updatedBy: actor.userId },
    });
    await this.audit.record(tx, {
      action: 'application.numbered',
      entityType: 'application',
      entityId: applicationId,
      new: { appNo },
    });
  }

  /** The next number of the project; the project's numbering is locked for the transaction so two submissions cannot share one. */
  private async nextNumber(
    tx: Tx,
    projectId: string,
    project: { code: string; year: number },
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`application-number-of:${projectId}`}))`;
    const [row] = await tx.$queryRaw<{ n: number }[]>`
      SELECT coalesce(max(substring(app_no from '[0-9]+$')::int), 0) AS n
        FROM applications WHERE project_id = ${projectId}::uuid AND app_no IS NOT NULL`;
    const next = Number(row?.n ?? 0) + 1;
    return `${project.code}-${project.year}-${String(next).padStart(NUMBER_WIDTH, '0')}`;
  }
}

/** A code no reference list holds reached a profile column: the answers are refused, not the server. */
function unlisted(error: unknown): unknown {
  return isForeignKeyViolation(error)
    ? new ApiError('validation.failed', 422, undefined, [
        { path: 'answers', code: 'validation.option_unknown' },
      ])
    : error;
}
