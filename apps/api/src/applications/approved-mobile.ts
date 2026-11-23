import { translate } from '@css/shared/i18n';
import type { Principal } from '../auth/principal.js';
import type { Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import type { BeneficiaryContactService } from '../services/beneficiary-contact.js';
import type { ApprovalWrites } from '../workflow/engine.js';

/** Why the profile's mobile changed, on its change-log row (stored data, in the office's language). */
const FROM_APPROVAL = translate('bn', 'common.contact.from_approval');

/** The mobile a known person's application gives, against the one the profile has. */
export interface ProfileMobileChange {
  from: string | null;
  to: string;
  /** Another live profile has the number: it stays on the application and is never written. */
  heldByOther: boolean;
}

/** The mobile the application's answers give, as the form's mobile question holds it. */
export async function answeredMobile(tx: Tx, applicationId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ v: string | null }[]>`
    SELECT aa.value->>'v' AS v
    FROM application_answers aa
    JOIN form_fields f ON f.id = aa.field_id
    WHERE aa.application_id = ${applicationId}::uuid
      AND f.standard_column = 'mobile' AND aa.repeat_index = 0
    LIMIT 1`;
  const value = rows[0]?.v?.trim();
  return value ? value : null;
}

/**
 * A known person's new mobile (the profile was made before, and the application gives another
 * number): the family check reads it from the submission on, the approver is shown it first, and
 * the approval writes it to the profile through the contact service with its change log. A number
 * another live profile has stays on the application, a warning only.
 */
export class ApprovedMobile implements ApprovalWrites {
  constructor(private readonly contact: BeneficiaryContactService) {}

  /** The change the approval would make, or null when the application gives no other number. */
  async pending(tx: Tx, applicationId: string): Promise<ProfileMobileChange | null> {
    const row = await tx.application.findUnique({
      where: { id: applicationId },
      select: { beneficiary: { select: { id: true, mobile: true } } },
    });
    const person = row?.beneficiary;
    if (!person) return null;
    const to = await answeredMobile(tx, applicationId);
    if (!to || to === person.mobile) return null;
    const holder = await tx.beneficiary.findFirst({
      where: { mobile: to, mergedIntoId: null, id: { not: person.id } },
      select: { id: true },
    });
    return { from: person.mobile, to, heldByOther: holder !== null };
  }

  /**
   * Writes the new number with the move that records the approval, the approver as its author;
   * the engine has checked the approver's permission and reach on the application. A number the
   * own-mobile rule refuses is left on the application, as one another profile has.
   */
  async approved(tx: Tx, principal: Principal, applicationId: string): Promise<void> {
    const change = await this.pending(tx, applicationId);
    if (!change || change.heldByOther) return;
    const { beneficiaryId } = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { beneficiaryId: true },
    });
    const before = await this.contact.locked(tx, beneficiaryId!);
    try {
      await this.contact.apply(
        tx,
        principal,
        before,
        { mobile: change.to },
        { reason: FROM_APPROVAL },
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'beneficiary.mobile_is_volunteer_mobile')
        return;
      throw error;
    }
  }
}
