import { z } from 'zod';
import { applicationWhere, holdsPermission, projectWhere } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { lockPeople } from '../services/help-history.js';
import type { IdempotencyService } from '../idempotency/idempotency.service.js';
import type { WorkflowEngine } from '../workflow/engine.js';
import { WAITLIST_ORDER } from './decision-rules.js';

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
/** How many waitlisted applications the pull reads at a time while it looks for a free one. */
const PAGE = 50;

/**
 * "পরেরজনকে আনুন": the next waitlisted application of a quota area moves into approved in one
 * click (the highest score, then the earliest waitlisted). Pulls of one project run one after
 * another, so two officials pulling at once get two different people; the move goes through the
 * engine as an approval with its guards, so a full quota still asks for a comment.
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
        // one pull of a project at a time: the next pull waits and then sees this one's outcome,
        // so two officials pulling at once get two different people
        await tx.$queryRaw`SELECT 1 AS held FROM pg_advisory_xact_lock(hashtextextended(${`waitlist:${projectId}`}, 0))`;
        const next = await this.firstFree(tx, {
          AND: [{ projectId, status: 'waitlisted', ...area }, applicationWhere(scope)],
        });
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
   * The first application in pull order that is still waitlisted, locked: a row another write
   * holds is waited for, never skipped, so the pull takes the true next one and a row that left
   * the waitlist meanwhile is passed over. The candidates are read a page at a time.
   */
  private async firstFree(
    tx: Tx,
    where: Prisma.ApplicationWhereInput,
  ): Promise<string | undefined> {
    for (let skip = 0; ; skip += PAGE) {
      const page = await tx.application.findMany({
        where,
        orderBy: WAITLIST_ORDER,
        select: { id: true },
        skip,
        take: PAGE,
      });
      for (const { id } of page) {
        // the person before the application, as the engine's move takes them (`lockPeople`)
        const [person] = await tx.$queryRaw<{ beneficiary_id: string | null }[]>`
          SELECT beneficiary_id FROM applications WHERE id = ${id}::uuid`;
        if (person?.beneficiary_id) await lockPeople(tx, [person.beneficiary_id]);
        const held = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM applications WHERE id = ${id}::uuid AND status = 'waitlisted'
             FOR UPDATE`;
        if (held.length) return id;
      }
      if (page.length < PAGE) return undefined;
    }
  }

  /**
   * The applications of the asked area: an area is a place of the level the project's quotas
   * weigh by (any union when it has union quotas, any district when it has district quotas, with
   * or without a target of its own), and none is asked when the project weighs them as a whole.
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
    if (!areaId) throw refuse();
    const place = await this.prisma.location.findUnique({
      where: { id: areaId },
      select: { level: true },
    });
    if (place?.level !== level) throw refuse();
    return level === 'union' ? { unionId: areaId } : { districtId: areaId };
  }
}
