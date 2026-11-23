import { translate } from '@css/shared/i18n';
import type { Principal } from '../auth/principal.js';
import type { Tx } from '../core/prisma.service.js';
import type { BeneficiaryContactService } from '../services/beneficiary-contact.js';
import type { ApprovalWrites } from '../workflow/engine.js';

/** Why the profile's mobile changed, on its change-log row (stored data, in the office's language). */
const FROM_APPROVAL = translate('bn', 'common.contact.from_approval');

/**
 * Why a new number stays on the application instead of the profile: another live profile has it,
 * it is a volunteer's own number on one of the person's applications, the approver may not edit
 * the person's contact data, or the profile's mobile changed after the application was sent (a
 * correction, or another application's approval, is newer than this one).
 */
export const MOBILE_KEPT = [
  'other_profile',
  'volunteer_mobile',
  'not_allowed',
  'profile_changed',
] as const;
export type MobileKept = (typeof MOBILE_KEPT)[number];

/** The mobile a known person's application gives, against the one the profile has. */
export interface ProfileMobileChange {
  from: string | null;
  to: string;
  /** Why the approval leaves the number on the application; null when it writes it. */
  kept: MobileKept | null;
}

/**
 * The mobile the application's answers give, as the form's mobile question holds it; a form has
 * one such question, and the first by its place is read should it hold more.
 */
export async function answeredMobile(tx: Tx, applicationId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ v: string | null }[]>`
    SELECT aa.value->>'v' AS v
    FROM application_answers aa
    JOIN form_fields f ON f.id = aa.field_id
    WHERE aa.application_id = ${applicationId}::uuid
      AND f.standard_column = 'mobile' AND aa.repeat_index = 0
    ORDER BY f.sort_order, f.id
    LIMIT 1`;
  const value = rows[0]?.v?.trim();
  return value ? value : null;
}

/**
 * A known person's new mobile (the profile was made before, and the application gives another
 * number): the family check reads it from the submission on, the approver is shown it first, and
 * the approval writes it to the profile through the contact service with its change log. It stays
 * on the application, a warning only, for each reason of `MobileKept`.
 */
export class ApprovedMobile implements ApprovalWrites {
  constructor(private readonly contact: BeneficiaryContactService) {}

  /**
   * The change an approval by `principal` would make, or null when the application gives no other
   * number. `mobile` is the application's number where the caller has read it already.
   */
  async pending(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    mobile?: string | null,
  ): Promise<ProfileMobileChange | null> {
    return (await this.changeOf(tx, principal, applicationId, mobile))?.change ?? null;
  }

  /**
   * Writes the new number with the move that records the approval, the approver as its author,
   * once the engine has checked the approver's permission and reach on the application.
   */
  async approved(tx: Tx, principal: Principal, applicationId: string): Promise<void> {
    const found = await this.changeOf(tx, principal, applicationId);
    if (!found || found.change.kept) return;
    const before = await this.contact.locked(tx, found.beneficiaryId);
    // the row lock is taken now: a write that came between the reading and the lock leaves it
    if (before.mobile !== found.change.from) return;
    await this.contact.apply(
      tx,
      principal,
      before,
      { mobile: found.change.to },
      { reason: FROM_APPROVAL },
    );
  }

  private async changeOf(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    mobile?: string | null,
  ): Promise<{ change: ProfileMobileChange; beneficiaryId: string } | null> {
    const row = await tx.application.findUnique({
      where: { id: applicationId },
      select: { submittedAt: true, beneficiary: { select: { id: true, mobile: true } } },
    });
    const person = row?.beneficiary;
    if (!person) return null;
    const to = mobile === undefined ? await answeredMobile(tx, applicationId) : mobile;
    if (!to || to === person.mobile) return null;
    const change: ProfileMobileChange = {
      from: person.mobile,
      to,
      kept: await this.keptFor(tx, principal, person.id, to, row.submittedAt),
    };
    return { change, beneficiaryId: person.id };
  }

  private async keptFor(
    tx: Tx,
    principal: Principal,
    beneficiaryId: string,
    to: string,
    submittedAt: Date | null,
  ): Promise<MobileKept | null> {
    const holder = await tx.beneficiary.findFirst({
      where: { mobile: to, mergedIntoId: null, id: { not: beneficiaryId } },
      select: { id: true },
    });
    if (holder) return 'other_profile';
    if (submittedAt) {
      const newer = await tx.fieldChange.findFirst({
        where: {
          entityType: 'beneficiary',
          entityId: beneficiaryId,
          field: 'mobile',
          createdAt: { gt: submittedAt },
        },
        select: { id: true },
      });
      if (newer) return 'profile_changed';
    }
    if (await this.contact.isVolunteerMobile(tx, principal, beneficiaryId, to))
      return 'volunteer_mobile';
    if (!(await this.contact.mayEdit(tx, principal, beneficiaryId))) return 'not_allowed';
    return null;
  }
}
