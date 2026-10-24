import { z } from 'zod';
import { holdsPermission } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Logger } from 'pino';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { WorkflowEngine } from '../workflow/engine';

const uuid = z.uuid();

/** The request of the review screen's bulk action (contract `BulkReviewRequest`). */
export const bulkReviewSchema = z.strictObject({
  action: z.enum(['review', 'approve']),
  rows: z
    .array(
      z.strictObject({
        clientUuid: uuid,
        applicationId: uuid,
        /** The version the list showed for the row, as the ETag of the record. */
        ifMatch: z.string().max(64),
      }),
    )
    .min(1)
    .max(50),
});
export type BulkReview = z.infer<typeof bulkReviewSchema>;

/** One row's outcome (contract `RowResult`). */
export const rowResult = z.object({
  clientUuid: uuid,
  result: z.enum(['done', 'failed', 'pending_photos', 'needs_verification', 'synced']),
  code: z.string().nullable(),
  serverId: uuid.nullable(),
  status: z.string().nullable(),
  stage: z.string().nullable(),
});
export type RowResult = z.infer<typeof rowResult>;

export const bulkResponse = z.object({ results: z.array(rowResult) });

/** The permission each bulk action's transition needs, checked once for the whole request. */
const ACTION_PERMISSION = { review: 'application.review', approve: 'application.approve' } as const;

/**
 * The review screen's bulk action (docs/api/API_STANDARDS.md, section 13): up to fifty
 * applications start their review or take their approval in one request, each row through the
 * engine on its own savepoint, so one refused row never rolls back the others; the whole request
 * runs once per Idempotency-Key and a repeat answers the stored results. The request is refused
 * as a whole when the caller holds no permission for the action at all, or when the key was used
 * by someone else or with other rows.
 */
export class BulkReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly idempotency: IdempotencyService,
    private readonly workflow: WorkflowEngine,
    private readonly logger: Logger,
  ) {}

  async run(
    principal: Principal,
    projectId: string,
    key: string | undefined,
    body: BulkReview,
  ): Promise<{ replay: boolean; results: RowResult[] }> {
    const permission = ACTION_PERMISSION[body.action];
    const access = await this.access.load(principal.userId);
    if (!holdsPermission(permission, access.grants)) {
      this.access.denied(principal.userId, permission, 'application');
      throw new ApiError('permission.denied', 403);
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new ApiError('permission.not_found', 404);
    await this.assertKeyIsOwn(key, principal, body);
    const outcome = await this.idempotency.runWithKey<RowResult>(
      key,
      { userId: principal.userId, deviceSessionId: principal.sessionId },
      body.rows.length,
      async (tx) => {
        const results: RowResult[] = [];
        for (const [i, row] of body.rows.entries())
          results.push(await this.row(tx, principal, projectId, body.action, row, i));
        await this.audit.record(tx, {
          action: 'application.bulk_review',
          entityType: 'project',
          entityId: projectId,
          new: {
            action: body.action,
            rows: body.rows.length,
            done: results.filter((r) => r.result === 'done').length,
          },
        });
        return results;
      },
    );
    return outcome;
  }

  /** One row on its own savepoint: a refusal is its result, and the rows before and after stand. */
  private async row(
    tx: Tx,
    principal: Principal,
    projectId: string,
    action: BulkReview['action'],
    row: BulkReview['rows'][number],
    index: number,
  ): Promise<RowResult> {
    const savepoint = `bulk_row_${index}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
    try {
      const inProject = await tx.application.count({
        where: { id: row.applicationId, projectId },
      });
      if (inProject === 0) throw new ApiError('permission.not_found', 404);
      await this.workflow.transition(tx, principal, row.applicationId, action, {}, row.ifMatch);
      const after = await tx.application.findUniqueOrThrow({
        where: { id: row.applicationId },
        select: { status: true, stage: true },
      });
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      return {
        clientUuid: row.clientUuid,
        result: 'done',
        code: null,
        serverId: row.applicationId,
        status: after.status,
        stage: after.stage,
      };
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      if (!(error instanceof ApiError)) {
        this.logger.error({ err: error, applicationId: row.applicationId }, 'bulk row failed');
      }
      return {
        clientUuid: row.clientUuid,
        result: 'failed',
        code: error instanceof ApiError ? error.code : 'server.internal',
        serverId: row.applicationId,
        status: null,
        stage: null,
      };
    }
  }

  /** A key belongs to the caller and to one set of rows; a repeat with other rows is a mistake, not a replay. */
  private async assertKeyIsOwn(
    key: string | undefined,
    principal: Principal,
    body: BulkReview,
  ): Promise<void> {
    if (!key) return;
    const stored = await this.prisma.syncBatche.findUnique({
      where: { idempotencyKey: key },
      select: { userId: true, results: true },
    });
    if (!stored) return;
    const sent = body.rows.map((r) => r.clientUuid).sort();
    const kept = z
      .array(z.object({ clientUuid: z.string() }).loose())
      .safeParse(stored.results)
      .data?.map((r) => r.clientUuid)
      .sort();
    if (stored.userId !== principal.userId || JSON.stringify(sent) !== JSON.stringify(kept))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'Idempotency-Key', code: 'validation.failed' },
      ]);
  }
}
