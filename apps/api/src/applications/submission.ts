import type { ContactUpdate } from '@css/shared/beneficiaries';
import { type FormDefinition, identityColumn, indexFields, split } from '@css/shared/forms';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { isForeignKeyViolation } from '../core/db-errors.js';
import type { Tx } from '../core/prisma.service.js';
import { currentContext } from '../core/request-context.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { BeneficiaryContactService } from '../services/beneficiary-contact.js';
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
 * Raised inside the move of a send when the new person looks like someone on the block list: no
 * profile is made and the move is abandoned. The caller holds the entry for an official once the
 * transaction has rolled back; this is never an answer to a client.
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

/** The standard columns of an application's answers, as the official definition reads them. */
export async function standardOf(tx: Tx, applicationId: string, formVersionId: string) {
  const definition = await readDefinition(tx, formVersionId, 'official');
  const { standard } = split(definition, await readAnswers(tx, applicationId, definition));
  return { definition, standard };
}

/**
 * What a submission adds to an application around the engine's move: with it, the person (the
 * live profile behind the number when one exists by now, else a profile created from the answers;
 * without a number, where the project asks the document only "if they have one", a profile
 * without a document), since a submitted application always has its person, and a known person's
 * new mobile or address written to the profile with its change log when the submitter may edit
 * that profile's contact data (otherwise the application keeps the new values for the office to
 * see); after it,
 * the number of the project in the order the office receives the applications
 * (`<code>-<year>-<5 digits>`). Both run in the move's transaction, so a refused move leaves
 * neither behind. A new person, with or without a number, is compared with the block list right
 * before the profile is made: a match makes none and raises `BlockedNamesakeMatch`, unless an
 * official who is deciding the held entry has made that comparison.
 */
export class SubmissionWriter {
  constructor(
    private readonly access: AccessService,
    private readonly identity: BeneficiaryIdentityService,
    private readonly contact: BeneficiaryContactService,
    private readonly audit: AuditWriter,
  ) {}

  async bindPerson(
    tx: Tx,
    actor: Principal,
    applicationId: string,
    options: {
      writeContact?: boolean;
      ownerUserId?: string;
      /**
       * The live profile an official linked an entry without a number to; an entry with a number
       * is bound by that number and this is not read.
       */
      linkBeneficiaryId?: string;
      /**
       * An official is deciding an entry that waits for verification and has compared its person
       * with the block list: the comparison is not made again, or the entry could never leave.
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
        ownerVolunteer: { select: { userId: true } },
        // the project's own rule, read in the move's transaction
        project: { select: IDENTITY_RULES_SELECT },
      },
    });
    const rules = identityRulesOf(row.project);
    const { definition, standard } = await standardOf(tx, applicationId, row.formVersionId);
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
        motherName: text(standard, 'mother_name'),
        ...(mobile ? { mobile } : {}),
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
    } else if (
      options.writeContact !== false &&
      (await this.mayEditContact(tx, actor, beneficiaryId))
    ) {
      const before = await this.contact.locked(tx, beneficiaryId);
      const body: Record<string, unknown> = {};
      for (const [column, field] of Object.entries(CONTACT_COLUMNS)) {
        const value = text(standard, column);
        if (value !== undefined) body[field] = value;
      }
      await this.contact.apply(tx, actor, before, body as ContactUpdate);
    }
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
   * Whether the submitter may write the profile's contact data: the contact-edit permission with
   * a scope that reaches the profile, as the contact route requires. A volunteer's answers never
   * rewrite a profile other projects rely on.
   */
  private async mayEditContact(tx: Tx, actor: Principal, beneficiaryId: string): Promise<boolean> {
    const access = await this.access.load(actor.userId, tx);
    const scope = await this.access.sensitiveScope(
      actor,
      access,
      'beneficiary.contact.edit',
      'beneficiary',
    );
    return !!scope && (await this.access.reaches(scope, { beneficiaryId }, tx));
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

  /** The profile from the answers; a code outside its reference list is the form's mistake, not the server's. */
  private async createProfile(tx: Tx, actor: Principal, input: NewProfile) {
    try {
      return await this.identity.createProfile(tx, actor, input);
    } catch (error) {
      if (isForeignKeyViolation(error))
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'answers', code: 'validation.option_unknown' },
        ]);
      throw error;
    }
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
