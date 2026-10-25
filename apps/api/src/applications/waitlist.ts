import { z } from 'zod';
import { applicationWhere, holdsPermission, projectWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { Principal } from '../auth/principal';
import type { PrismaService } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { WorkflowEngine } from '../workflow/engine';
import { WAITLIST_ORDER } from './decision-rules';

/** The pull's request: the quota area to pull from, and the comment a full quota may ask for. */
export const pullNextSchema = z.strictObject({
  /** The union or the district of the quota area, as the project's quotas define its areas; absent for the whole project. */
  areaId: z.uuid().optional(),
  comment: z.string().trim().max(2000).optional(),
});
export type PullNext = z.infer<typeof pullNextSchema>;

/** The one pull's answer, kept under its key so a repeat answers the same person. */
interface Pulled extends Prisma.JsonObject {
  id: string;
  appNo: string | null;
}

const PERMISSION = 'application.waitlist';

/**
 * "পরেরজনকে আনুন": the next waitlisted application of a quota area moves into approved in one
 * click (the highest score, then the earliest waitlisted). The rows of the area are locked and a
 * row another pull holds is skipped, so two officials pulling at once get two different people;
 * the move goes through the engine with its guards, so a full quota still asks for a comment.
 */
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly idempotency: IdempotencyService,
    private readonly workflow: WorkflowEngine,
  ) {}

  async pullNext(
    principal: Principal,
    projectId: string,
    key: string | undefined,
    body: PullNext,
  ): Promise<{ replay: boolean; pulled: Pulled }> {
    const access = await this.access.load(principal.userId);
    if (!holdsPermission(PERMISSION, access.grants)) {
      this.access.denied(principal.userId, PERMISSION, 'application');
      throw new ApiError('permission.denied', 403);
    }
    const scope = await this.access.scopeFor(principal, access, PERMISSION, 'application');
    // a project outside the caller's reach is not found, whatever its waitlist holds
    const projectScope = await this.access.scopeFor(principal, access, 'project.view', 'project');
    const reached = await this.prisma.project.count({
      where: { AND: [{ id: projectId }, projectWhere(projectScope)] },
    });
    if (!reached) throw new ApiError('permission.not_found', 404);
    const area = await this.areaOf(projectId, body.areaId);
    const outcome = await this.idempotency.runWithKey<Pulled>(
      key,
      { userId: principal.userId, deviceSessionId: principal.sessionId },
      1,
      async (tx) => {
        const candidates = await tx.application.findMany({
          where: { AND: [{ projectId, status: 'waitlisted', ...area }, applicationWhere(scope)] },
          orderBy: WAITLIST_ORDER,
          select: { id: true },
          take: 50,
        });
        if (!candidates.length) throw new ApiError('workflow.waitlist_empty', 409);
        // the first in order that no other pull holds, locked alone; a held row is skipped, not
        // waited for, and the rows after it stay free for the other pulls
        let next: string | undefined;
        for (const { id } of candidates) {
          const held = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM applications WHERE id = ${id}::uuid AND status = 'waitlisted'
               FOR UPDATE SKIP LOCKED`;
          if (held.length) {
            next = id;
            break;
          }
        }
        if (!next) throw new ApiError('workflow.waitlist_empty', 409);
        await this.workflow.transition(tx, principal, next, 'pull_from_waitlist', {
          ...(body.comment ? { comment: body.comment } : {}),
        });
        const row = await tx.application.findUniqueOrThrow({
          where: { id: next },
          select: { id: true, appNo: true },
        });
        return [{ id: row.id, appNo: row.appNo }];
      },
      { requestHash: JSON.stringify([projectId, body.areaId ?? null]) },
    );
    return { replay: outcome.replay, pulled: outcome.results[0]! };
  }

  /**
   * The applications of the asked area: an area must be a place the project's quotas define its
   * areas by (a union with union quotas, a district with district quotas), and none is asked when
   * the project weighs its applications as a whole.
   */
  private async areaOf(
    projectId: string,
    areaId: string | undefined,
  ): Promise<Prisma.ApplicationWhereInput> {
    const quotas = await this.prisma.projectQuota.findMany({
      where: { projectId },
      select: { level: true, locationId: true },
    });
    const level = quotas.some((q) => q.level === 'union')
      ? 'union'
      : quotas.some((q) => q.level === 'district')
        ? 'district'
        : null;
    const refuse = () =>
      new ApiError('validation.failed', 422, undefined, [
        { path: 'areaId', code: 'validation.option_unknown' },
      ]);
    if (level === null) {
      if (areaId) throw refuse();
      return {};
    }
    if (!areaId || !quotas.some((q) => q.level === level && q.locationId === areaId))
      throw refuse();
    return level === 'union' ? { unionId: areaId } : { districtId: areaId };
  }
}
