import { createHash } from 'node:crypto';
import { z } from 'zod';
import { holdsPermission } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Logger } from 'pino';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import type { IdempotencyService } from '../idempotency/idempotency.service.js';
import { lockPeople } from '../services/help-history.js';
import type { WorkflowEngine } from '../workflow/engine.js';

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
    .max(50)
    .refine(
      (rows) => new Set(rows.map((r) => r.clientUuid)).size === rows.length,
      'each row needs its own clientUuid',
    ),
});
export type BulkReview = z.infer<typeof bulkReviewSchema>;

/** A batch of fifty rows makes dozens of round trips per row; the transaction may take its time. */
const BULK_TRANSACTION = { maxWait: 5_000, timeout: 120_000 };

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
 * The review screen's bulk action (docs/api/API_STANDARDS.md, "Bulk-update pattern"): up to fifty
 * applications start their review or take their approval in one request, each row through the
 * engine on its own savepoint, so one refused row never rolls back the others; the whole request
 * runs once per Idempotency-Key and a repeat answers the stored results. The request is refused as
 * a whole when the caller holds no permission for the action at all, or when the key was used by
 * someone else or with other rows.
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
    const outcome = await this.idempotency.runWithKey<RowResult>(
      key,
      { userId: principal.userId, deviceSessionId: principal.sessionId },
      body.rows.length,
      async (tx) => {
        // the people of every row first, all at once in id order, before any row takes its
        // application: each row's move takes its person before the application, and so does a
        // merge, so the order never crosses another request's (`lockPeople`)
        const people = await tx.application.findMany({
          where: { id: { in: body.rows.map((r) => r.applicationId) }, projectId },
          select: { beneficiaryId: true },
        });
        await lockPeople(
          tx,
          people.map((p) => p.beneficiaryId).filter((id): id is string => id !== null),
        );
        const results: RowResult[] = [];
        for (const row of body.rows)
          results.push(await this.row(tx, principal, projectId, body.action, row));
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
      { requestHash: requestHashOf(projectId, body), ...BULK_TRANSACTION },
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
  ): Promise<RowResult> {
    // the rows run one after another, so one name serves: Postgres releases or rolls back the
    // newest savepoint of that name
    await tx.$executeRaw`SAVEPOINT bulk_row`;
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
      await tx.$executeRaw`RELEASE SAVEPOINT bulk_row`;
      return {
        clientUuid: row.clientUuid,
        result: 'done',
        code: null,
        serverId: row.applicationId,
        status: after.status,
        stage: after.stage,
      };
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT bulk_row`;
      // a refusal is the row's result; anything else (a lock, a lost connection) fails the whole
      // request, so nothing is stored under the key and the same key can try again
      if (!(error instanceof ApiError)) {
        this.logger.error({ err: error, applicationId: row.applicationId }, 'bulk row failed');
        throw error;
      }
      return {
        clientUuid: row.clientUuid,
        result: 'failed',
        code: error.code,
        serverId: row.applicationId,
        status: null,
        stage: null,
      };
    }
  }
}

/** What a key stands for: the project, the action and the rows as sent, so a repeat must match exactly. */
function requestHashOf(projectId: string, body: BulkReview): string {
  const rows = [...body.rows]
    .map((r) => `${r.clientUuid}|${r.applicationId}|${r.ifMatch}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(`${projectId}\n${body.action}\n${rows}`).digest('hex');
}
