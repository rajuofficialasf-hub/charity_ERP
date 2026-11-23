import { answeredMobile } from './approved-mobile.js';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BeneficiaryFamilyService } from '../services/beneficiary-family.js';
import { openPairInProject } from '../services/beneficiary-merge-candidates.js';
import { IDENTITY_RULES_SELECT, identityRulesOf } from '../services/project-identity-rules.js';
import { mergedTwins } from './merged-twins.js';

/**
 * Why a decision asks for a comment: it goes against the score order, the quota area is full, or
 * the person appears again in the project, as probably the same person under another profile or
 * as someone of the same family, where the project holds that repeat.
 */
export const COMMENT_REASONS = [
  'against_score',
  'quota_full',
  'same_person',
  'family_match',
] as const;
export type CommentReason = (typeof COMMENT_REASONS)[number];

/** The states whose applications still wait for a decision in the review queue. */
const WAITING = ['reviewed', 'waitlisted'];

interface Decided {
  id: string;
  projectId: string;
  status: string;
  totalScore: Prisma.Decimal | null;
  districtId: string;
  unionId: string;
  waitlistedAt: Date | null;
}

/**
 * The quota area an application is weighed in: its union when the project has union quotas,
 * else its district when it has district quotas, else the whole project. A project without
 * quotas still has a score order, over the whole project.
 */
async function quotaAreaWhere(
  tx: Tx,
  application: Pick<Decided, 'projectId' | 'districtId' | 'unionId'>,
): Promise<{ unionId?: string; districtId?: string }> {
  const levels = new Set(
    (
      await tx.projectQuota.findMany({
        where: { projectId: application.projectId },
        select: { level: true },
        distinct: ['level'],
      })
    ).map((q) => q.level),
  );
  if (levels.has('union')) return { unionId: application.unionId };
  if (levels.has('district')) return { districtId: application.districtId };
  return {};
}

/** The waitlisted applications of an area in the order they are pulled: the highest score, then the earliest. */
export const WAITLIST_ORDER: Prisma.ApplicationOrderByWithRelationInput[] = [
  { totalScore: { sort: 'desc', nulls: 'last' } },
  { waitlistedAt: 'asc' },
  { id: 'asc' },
];

/**
 * The next waitlisted application of the area, as the pull takes it: the highest score, then the
 * earliest waitlisted. It is read without a lock: pulls of a project run one after another, and
 * a row some other write holds still counts as the next one.
 */
async function nextWaitlisted(
  tx: Tx,
  me: Pick<Decided, 'projectId' | 'districtId' | 'unionId'>,
): Promise<string | null> {
  const area = await quotaAreaWhere(tx, me);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM applications
     WHERE project_id = ${me.projectId}::uuid AND status = 'waitlisted'
       AND (${area.unionId ?? null}::uuid IS NULL OR union_id = ${area.unionId ?? null}::uuid)
       AND (${area.districtId ?? null}::uuid IS NULL OR district_id = ${area.districtId ?? null}::uuid)
     ORDER BY total_score DESC NULLS LAST, waitlisted_at ASC, id ASC
     LIMIT 1`;
  return rows[0]?.id ?? null;
}

const SELECT = {
  id: true,
  projectId: true,
  status: true,
  totalScore: true,
  districtId: true,
  unionId: true,
  waitlistedAt: true,
} satisfies Prisma.ApplicationSelect;

/**
 * Whether moving the application to `to` goes against the score order inside its quota area:
 * approving while a higher-scored application of the area still waits; pulling from the waitlist
 * any but the next in order (the highest score, then the earliest waitlisted); waitlisting or
 * rejecting while a lower-scored one of the area is approved. An application without a score
 * (a form without points) has no order to go against, except the waitlist's own order.
 */
export async function againstScore(tx: Tx, applicationId: string, to: string): Promise<boolean> {
  const me = await tx.application.findUnique({ where: { id: applicationId }, select: SELECT });
  if (!me) return false;
  const area = { projectId: me.projectId, id: { not: me.id }, ...(await quotaAreaWhere(tx, me)) };
  if (to === 'approved' && me.status === 'waitlisted')
    return (await nextWaitlisted(tx, me)) !== me.id;
  if (me.totalScore === null) return false;
  if (to === 'approved')
    return (
      (await tx.application.count({
        where: { ...area, status: { in: WAITING }, totalScore: { gt: me.totalScore } },
      })) > 0
    );
  if (to === 'waitlisted' || to === 'rejected')
    return (
      (await tx.application.count({
        where: {
          ...area,
          approvedAt: { not: null },
          status: { not: 'deleted' },
          totalScore: { lt: me.totalScore },
        },
      })) > 0
    );
  return false;
}

/**
 * Whether approving the application lands in a full quota: a union or district quota of its
 * place whose approvals have reached the target. A full quota asks for a comment; it never
 * refuses the approval.
 */
export async function quotaFull(tx: Tx, applicationId: string): Promise<boolean> {
  const me = await tx.application.findUnique({ where: { id: applicationId }, select: SELECT });
  if (!me) return false;
  const quotas = await tx.projectQuota.findMany({
    where: { projectId: me.projectId, locationId: { in: [me.unionId, me.districtId] } },
    select: { level: true, locationId: true, target: true },
  });
  for (const q of quotas) {
    const approved = await tx.application.count({
      where: {
        projectId: me.projectId,
        id: { not: me.id },
        approvedAt: { not: null },
        status: { not: 'deleted' },
        ...(q.level === 'union' ? { unionId: q.locationId } : { districtId: q.locationId }),
      },
    });
    if (approved >= q.target) return true;
  }
  return false;
}

/**
 * The repeats of the person in the project that an approval asks a comment for, by the project's
 * own rules (docs/BUSINESS_RULES.md, "Application workflow"): `same_person` when the person's
 * profile has an open probable pair with another live profile that has an application in the
 * project, or a profile merged with it holds a sent application in the project, `family_match`
 * when the person has a family match in the project (another applicant with the same mobile, or
 * the same union, village and father's or husband's name) or is probably a member listed in the
 * family of another applicant of the project. Each is asked only where the project holds that
 * repeat; where it only tells, the review shows the signal and the approval asks nothing. A pair
 * an official marked as two people asks nothing. The guard of the move and the review's hints both
 * read this one function, so the screen asks exactly what the move will. An entry not yet linked
 * to a profile has no person to compare; it reaches an approval only after its verification links
 * one. The rules are read from the project's stored settings, never from the request.
 */
export async function repeatReasons(tx: Tx, applicationId: string): Promise<CommentReason[]> {
  const me = await tx.application.findUnique({
    where: { id: applicationId },
    select: { projectId: true, beneficiaryId: true, project: { select: IDENTITY_RULES_SELECT } },
  });
  if (!me?.beneficiaryId) return [];
  const rules = identityRulesOf(me.project);
  const reasons: CommentReason[] = [];
  if (
    rules.repeatPerson === 'hold' &&
    ((await openPairInProject(tx, me.projectId, me.beneficiaryId)) ||
      (await mergedTwins(tx, me.projectId, me.beneficiaryId)).length > 0)
  )
    reasons.push('same_person');
  if (rules.repeatFamily === 'hold') {
    const family = new BeneficiaryFamilyService();
    if (
      (
        await family.matches(
          tx,
          me.projectId,
          me.beneficiaryId,
          await answeredMobile(tx, applicationId),
        )
      ).length > 0 ||
      (await family.memberInProject(tx, me.projectId, me.beneficiaryId))
    )
      reasons.push('family_match');
  }
  return reasons;
}

/** The comments a move would ask for now, for the review screen to ask before it sends. */
export async function commentReasons(
  tx: Tx,
  applicationId: string,
  to: string,
): Promise<CommentReason[]> {
  const reasons: CommentReason[] = [];
  if (await againstScore(tx, applicationId, to)) reasons.push('against_score');
  if (to === 'approved' && (await quotaFull(tx, applicationId))) reasons.push('quota_full');
  if (to === 'approved') reasons.push(...(await repeatReasons(tx, applicationId)));
  return reasons;
}
