import type { Tx } from '../core/prisma.service.js';

/** The states an application leaves the volunteer's limit in; every other state counts, drafts included. */
export const NOT_COUNTED_STATES = ['rejected', 'deleted'];

/**
 * The live number of applications each main volunteer holds on a project, as the limit counts
 * them: the owner's applications in every state but rejected and deleted, so the team members'
 * drafts and the applications transferred to the volunteer count too.
 */
export async function liveApplicationCounts(
  db: Tx,
  owners: { projectId: string; ownerVolunteerId: string }[],
): Promise<(projectId: string, ownerVolunteerId: string) => number> {
  const counts = owners.length
    ? await db.application.groupBy({
        by: ['projectId', 'ownerVolunteerId'],
        where: { OR: owners, status: { notIn: NOT_COUNTED_STATES } },
        _count: { _all: true },
      })
    : [];
  return (projectId, ownerVolunteerId) =>
    counts.find((c) => c.projectId === projectId && c.ownerVolunteerId === ownerVolunteerId)?._count
      ._all ?? 0;
}
