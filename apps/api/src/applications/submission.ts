import type { ContactUpdate } from '@css/shared/beneficiaries';
import { identityColumn, split } from '@css/shared/forms';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import { isForeignKeyViolation } from '../core/db-errors';
import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { BeneficiaryContactService } from '../services/beneficiary-contact';
import type { BeneficiaryIdentityService, NewProfile } from '../services/beneficiary-identity';
import { readDefinition } from '../services/forms';
import { readAnswers } from './answers';

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
 * What a submission adds to an application around the engine's move: with it, the person (the
 * live profile behind the number when one exists by now, else a profile created from the answers),
 * since a submitted application always has its person, and a known person's new mobile or
 * address written to the profile with its change log when the submitter may edit that profile's
 * contact data (otherwise the application keeps the new values for the office to see); after it,
 * the number of the project in the order the office receives the applications
 * (`<code>-<year>-<5 digits>`). Both run in the move's transaction, so a refused move leaves
 * neither behind.
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
  ): Promise<Prisma.ApplicationUncheckedUpdateInput> {
    const row = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        id: true,
        formVersionId: true,
        beneficiaryId: true,
        identityKind: true,
        createdByUserId: true,
        ownerVolunteer: { select: { userId: true } },
      },
    });
    const definition = await readDefinition(tx, row.formVersionId, 'official');
    const { standard } = split(definition, await readAnswers(tx, applicationId, definition));
    let { beneficiaryId, identityKind } = row;
    let profileCreated = false;
    if (!beneficiaryId) {
      const nid = text(standard, 'nid');
      const birthReg = text(standard, 'birth_reg');
      // without a number there is no profile to make; the engine's identity guard refuses the move
      if (!nid && !birthReg) return {};
      // a profile for the number may exist by now (another application, a public entry): it is
      // bound like a lookup would, never refused as a duplicate of itself
      const number = nid ?? birthReg!;
      const live = await this.liveProfile(tx, number);
      if (live) {
        await this.identity.assertMayApply(tx, live);
        beneficiaryId = live;
        identityKind = identityColumn(number);
      }
    }
    if (!beneficiaryId) {
      const nid = text(standard, 'nid');
      const birthReg = text(standard, 'birth_reg');
      const mobile = text(standard, 'mobile') ?? '';
      // the creating team member's own mobile is refused as the person's, like the owner's
      if (row.createdByUserId && mobile)
        await this.identity.assertNotVolunteerMobile(tx, mobile, [row.createdByUserId]);
      const dob = text(standard, 'dob');
      const profile = await this.createProfile(tx, actor, {
        ...(nid ? { nid } : {}),
        ...(birthReg ? { birthReg } : {}),
        name: text(standard, 'name') ?? '',
        fatherOrHusbandName: text(standard, 'father_or_husband_name') ?? '',
        motherName: text(standard, 'mother_name'),
        mobile,
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
        ownerUserId: row.ownerVolunteer?.userId,
      } satisfies NewProfile);
      beneficiaryId = profile.id;
      identityKind = nid ? 'nid' : 'birth_reg';
      profileCreated = true;
      await this.audit.record(tx, {
        action: 'beneficiary.create',
        entityType: 'beneficiary',
        entityId: profile.id,
        new: { benNo: profile.benNo, applicationId },
      });
    } else if (await this.mayEditContact(tx, actor, beneficiaryId)) {
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
