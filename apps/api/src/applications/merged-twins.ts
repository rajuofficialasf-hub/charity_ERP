import type { Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';

/**
 * The applications one person holds in a project on another profile because two profiles of them
 * were merged: a merge leaves a decided application of a project both had on the retired profile,
 * so the person can stand twice in the project. Sending, approving and the review read this one
 * query, so they agree on what counts as the same person.
 */

/** An application of the same person in the project, on a profile linked by a merge. */
export interface MergedTwin {
  id: string;
  appNo: string | null;
  status: string;
}

/**
 * The sent applications (any state but draft and deleted) in the project of every profile linked
 * to the given one by a merge, in either direction and along a chain of merges, but not the
 * given profile's own.
 */
export async function mergedTwins(
  tx: Tx,
  projectId: string,
  beneficiaryId: string,
): Promise<MergedTwin[]> {
  return tx.$queryRaw<MergedTwin[]>`
    WITH RECURSIVE linked(id) AS (
      SELECT ${beneficiaryId}::uuid
      UNION
      SELECT b.id FROM beneficiaries b, linked l, beneficiaries lb
      WHERE lb.id = l.id AND (b.merged_into_id = l.id OR b.id = lb.merged_into_id)
    )
    SELECT a.id, a.app_no AS "appNo", a.status FROM applications a
    WHERE a.project_id = ${projectId}::uuid
      AND a.beneficiary_id IN (SELECT id FROM linked)
      AND a.beneficiary_id <> ${beneficiaryId}::uuid
      AND a.status NOT IN ('draft', 'deleted')
    ORDER BY a.created_at, a.id`;
}

/**
 * Refuses to send an application whose person already stands in the project on a profile linked
 * by a merge (a draft left on a retired profile, or a draft of the kept profile beside the retired
 * profile's sent one): the same answer as a second application of one profile.
 */
export async function assertNotAppliedOnMergedProfile(
  tx: Tx,
  applicationId: string,
  boundBeneficiaryId?: string | null,
): Promise<void> {
  const app = await tx.application.findUnique({
    where: { id: applicationId },
    select: { projectId: true, beneficiaryId: true },
  });
  // the person the submission binds now is written after this check, with the move itself
  const beneficiaryId = boundBeneficiaryId ?? app?.beneficiaryId;
  if (!app || !beneficiaryId) return;
  if ((await mergedTwins(tx, app.projectId, beneficiaryId)).length > 0)
    throw new ApiError('beneficiary.already_applied', 409);
}
