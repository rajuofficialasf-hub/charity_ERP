import {
  type RowResult,
  rowResultSchema,
  type SyncBatchRequest,
  type SyncBatchResponse,
  type SyncRecord,
} from '@css/shared/sync';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AccessService } from '../access/service';
import { splitPendingPhotos, wrongSlot } from '../applications/pending-photos';
import type {
  ApplicationRead,
  ApplicationsService,
  ApplicationViewer,
  WriteOptions,
} from '../applications/service';
import type { UnlocksService } from '../applications/unlocks';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { SessionService } from '../auth/session.service';
import type { Clock } from '../core/clock';
import { etagOf } from '../core/etag';
import type { PrismaService } from '../core/prisma.service';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import { ApiError } from '../i18n/api-error';
import { readDefinition } from '../services/forms';
import { clampedOffset, correctedDeviceTime, lateSync, verificationReason } from './rules';
import { answerValueSchema } from '@css/shared';
import type { Prisma } from '../generated/prisma/client';

/** The phone's answers as the audit keeps them: read through the answer schema, or marked unreadable. */
const clientAnswersSchema = z.array(
  z.object({
    fieldKey: z.string(),
    repeatIndex: z.number().int().min(0).optional(),
    value: answerValueSchema,
  }),
);
const clientAnswersOf = (answers: unknown[]): Prisma.InputJsonValue => {
  const parsed = clientAnswersSchema.safeParse(answers);
  return parsed.success ? (parsed.data as Prisma.InputJsonValue) : { unreadable: true };
};

const answersPayload = z.strictObject({ answers: z.array(z.unknown()).max(2000) });
const emptyPayload = z.strictObject({});
const fillPayload = z.strictObject({
  unlockId: z.uuid(),
  value: z.record(z.string(), z.unknown()),
});

/**
 * What the ordinary services refuse, said the way the sync centre of the phone explains it
 * (docs/architecture/OFFLINE_SYNC.md "Conflict rules at sync"); every other code travels as it is.
 */
const CODE_MAP: Record<string, string> = {
  'permission.not_found': 'sync.not_permitted',
  'permission.denied': 'sync.not_permitted',
  'application.team_lead_missing': 'sync.not_permitted',
  'workflow.guard.limit_not_exceeded': 'sync.limit_exceeded',
  'workflow.guard.deadline_open': 'sync.deadline_passed',
  'workflow.guard.project_active': 'sync.project_closed',
  'workflow.guard.project_not_closed': 'sync.project_closed',
  'application.not_editable': 'conflict.locked_on_server',
  'application.unlock_not_open': 'conflict.locked_on_server',
};

/** The viewers a volunteer's records are processed with: the project scope of a draft, the application scope of the rest. */
interface SyncContext {
  principal: Principal;
  create: ApplicationViewer;
  view: ApplicationViewer;
}

/**
 * The batch a phone sends when the network returns (docs/architecture/OFFLINE_SYNC.md "Batch sync
 * endpoint"): each record goes through the ordinary application service with the volunteer as
 * actor, in its own transaction, so permission, scope, guards, effects, notices and audit are the
 * online ones and one refused record never fails the batch. The batch key is reserved first, so a
 * replay answers the stored results; a record that depends on a failed one fails with it. Only a
 * volunteer's records are processed: an official holds no outbox in this task.
 */
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly applications: ApplicationsService,
    private readonly unlocks: UnlocksService,
    private readonly sessions: SessionService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async submit(
    principal: Principal,
    fieldClasses: ReadonlySet<string>,
    key: string | undefined,
    body: SyncBatchRequest,
  ): Promise<{ replay: boolean; response: SyncBatchResponse }> {
    const owner = { userId: principal.userId, deviceSessionId: principal.sessionId };
    const now = this.clock.now();
    const reserved = await this.idempotency.reserveKey(
      key,
      owner,
      body.records.length,
      requestHashOf(body),
      now,
    );
    if (reserved.replay)
      return {
        replay: true,
        response: {
          serverTime: now.toISOString(),
          results: z.array(rowResultSchema).parse(reserved.results),
        },
      };
    // the device clock as the server believes it: learned from the batch, within a day either way
    const offsetMs = clampedOffset(now.getTime() - new Date(body.deviceTime).getTime());
    const results: RowResult[] = [];
    try {
      const context = await this.context(principal, fieldClasses);
      const serverIds = new Map<string, string>();
      const failed = new Set<string>();
      for (const record of body.records) {
        const result = await this.one(context, record, offsetMs, serverIds, failed);
        results.push(result);
        if (result.result === 'failed') failed.add(record.clientUuid);
        else if (result.serverId) serverIds.set(record.clientUuid, result.serverId);
      }
      await this.prisma.$transaction(async (tx) => {
        await this.idempotency.storeResults(tx, reserved.batchId, results);
        if (body.pendingAfter !== undefined)
          await this.sessions.reportPending(tx, principal.sessionId, body.pendingAfter, now);
        await this.audit.record(tx, {
          action: 'sync.batch',
          entityType: 'device_session',
          entityId: principal.sessionId,
          new: {
            records: results.length,
            failed: results.filter((r) => r.result === 'failed').length,
            pendingAfter: body.pendingAfter ?? null,
            deviceTime: body.deviceTime,
            offsetMs,
          },
        });
      });
    } catch (error) {
      // the batch itself broke: the key is given back, so the phone's retry runs it again (every
      // record is idempotent by its client id) instead of waiting on a batch that never ends
      await this.idempotency.releaseKey(reserved.batchId);
      throw error;
    }
    return { replay: false, response: { serverTime: now.toISOString(), results } };
  }

  /** The scopes of a volunteer who may sync; null for an official or a blocked volunteer. */
  private async context(
    principal: Principal,
    fieldClasses: ReadonlySet<string>,
  ): Promise<SyncContext | null> {
    if (principal.kind !== 'volunteer') return null;
    if (await this.applications.isBlocked(principal)) return null;
    const access = await this.access.load(principal.userId);
    const [create, view] = await Promise.all([
      this.access.scopeFor(principal, access, 'application.create', 'project'),
      this.access.scopeFor(principal, access, 'application.view', 'application'),
    ]);
    return {
      principal,
      create: { principal, scope: create, fieldClasses },
      view: { principal, scope: view, fieldClasses },
    };
  }

  private async one(
    context: SyncContext | null,
    record: SyncRecord,
    offsetMs: number,
    serverIds: ReadonlyMap<string, string>,
    failed: ReadonlySet<string>,
  ): Promise<RowResult> {
    const refused = (code: string): RowResult => ({
      clientUuid: record.clientUuid,
      result: 'failed',
      code,
    });
    if (!context) return refused('sync.not_permitted');
    if (record.dependencies?.some((d) => failed.has(d))) return refused('sync.dependency_failed');
    try {
      switch (record.kind) {
        case 'application_draft':
          return this.done(record, await this.draft(context, record, offsetMs));
        case 'application_update':
          return await this.update(context, record, offsetMs, serverIds);
        case 'application_submit':
          return this.done(record, await this.send(context, record, offsetMs, serverIds));
        case 'field_update':
          return await this.fill(context, record);
      }
    } catch (error) {
      if (error instanceof ApiError) return refused(codeOf(error));
      // a database or programming error of one record: on record for the operators, the batch goes on
      this.logger.error(
        { err: error, clientUuid: record.clientUuid, kind: record.kind },
        'sync record failed',
      );
      return refused('server.internal');
    }
  }

  private done(record: SyncRecord, read: ApplicationRead): RowResult {
    const { application } = read;
    const held = application.status === 'needs_verification';
    return {
      clientUuid: record.clientUuid,
      result: held ? 'needs_verification' : 'synced',
      // the reason the office looks at it, for the phone to say
      ...(held ? { code: verificationReason(application.flags) } : {}),
      serverId: application.id,
      status: application.status,
      pendingPhotos: application.pendingPhotos,
    };
  }

  private async draft(
    context: SyncContext,
    record: SyncRecord,
    offsetMs: number,
  ): Promise<ApplicationRead> {
    const payload = parsed(answersPayload, record.payload);
    const { answers, pending } = splitPendingPhotos(payload.answers);
    await this.assertPhotoSlots(pending, record.formVersionId);
    // the device time moved onto the server's clock, so the deadline is judged fairly
    const createdAt = correctedDeviceTime(record.clientCreatedAt, offsetMs, this.clock.now());
    const created = await this.applications.create(
      context.create,
      record.projectId,
      {
        clientUuid: record.clientUuid,
        clientCreatedAt: createdAt.toISOString(),
        projectId: record.projectId,
        formVersionId: record.formVersionId,
        answers,
      },
      { pendingPhotos: pending, sync: { createdAt } },
    );
    return created.value;
  }

  /**
   * An edit from the phone against the record as it is now: a record waiting for the office stays
   * as it is; a record the caller may no longer edit keeps the server's word; a draft changed on
   * both sides goes to the later change, and the losing one is on record
   * (docs/architecture/OFFLINE_SYNC.md "Conflict rules at sync").
   */
  private async update(
    context: SyncContext,
    record: SyncRecord,
    offsetMs: number,
    serverIds: ReadonlyMap<string, string>,
  ): Promise<RowResult> {
    const id = await this.targetOf(record, serverIds);
    const payload = parsed(answersPayload, record.payload);
    const { answers, pending } = splitPendingPhotos(payload.answers);
    await this.assertPhotoSlots(pending, record.formVersionId);
    const current = await this.applications.get(context.view, id);
    const { status } = current.application;
    // the server's own stored answers, already shaped by the answer schema
    const serverAnswers = current.application.answers as Prisma.InputJsonValue;
    if (status === 'needs_verification')
      return {
        clientUuid: record.clientUuid,
        result: 'failed',
        code: 'sync.held_for_verification',
        serverId: id,
        status,
      };
    if (!(await this.applications.mayEdit(context.view, id, status))) {
      // the office decided meanwhile: the server's word stands, the attempt is on record
      await this.onRecord('sync.conflict_server_won', context.principal, id, {
        status,
        serverAnswers,
        clientAnswers: clientAnswersOf(answers),
      });
      return {
        clientUuid: record.clientUuid,
        result: 'failed',
        code: 'conflict.locked_on_server',
        serverId: id,
        status,
        conflict: { kept: 'server', serverValue: serverAnswers },
      };
    }
    const currentEtag = etagOf(current.updatedAt);
    // the version the phone last saw; a record the phone made in this batch (named as the target
    // or a dependency) has none, and nothing changed since; an unknown base on any other record
    // is a conflict the times decide
    const madeInBatch = [record.target, ...(record.dependencies ?? [])].some(
      (key) => typeof key === 'string' && serverIds.has(key),
    );
    const base = record.baseVersion ?? (madeInBatch ? currentEtag : null);
    let conflict: WriteOptions['conflict'];
    if (base !== currentEtag) {
      const clientAt = correctedDeviceTime(record.clientUpdatedAt, offsetMs, this.clock.now());
      const times = {
        clientUpdatedAt: clientAt.toISOString(),
        serverUpdatedAt: current.updatedAt.toISOString(),
      };
      if (clientAt.getTime() <= current.updatedAt.getTime()) {
        await this.onRecord('sync.conflict_last_write', context.principal, id, {
          kept: 'server',
          ...times,
          clientAnswers: clientAnswersOf(answers),
        });
        return {
          ...this.done(record, current),
          conflict: { kept: 'server', serverValue: serverAnswers },
        };
      }
      conflict = { ...times, serverAnswers };
    }
    const read = await this.applications.update(context.view, id, { answers }, currentEtag, {
      pendingPhotos: pending,
      conflict,
    });
    return this.done(record, read);
  }

  /**
   * A send from the phone: a record already waiting for the office stays so; one sent while the
   * window was open that arrives after it closed is held for the office; the rest goes through
   * the engine as online.
   */
  private async send(
    context: SyncContext,
    record: SyncRecord,
    offsetMs: number,
    serverIds: ReadonlyMap<string, string>,
  ): Promise<ApplicationRead> {
    const id = await this.targetOf(record, serverIds);
    parsed(emptyPayload, record.payload);
    const current = await this.applications.get(context.view, id);
    if (current.application.status === 'needs_verification') return current;
    const ifMatch = record.baseVersion ?? etagOf(current.updatedAt);
    const project = await this.prisma.project.findUnique({
      where: { id: current.application.projectId },
      select: { applyTo: true },
    });
    const sentAt = correctedDeviceTime(record.clientCreatedAt, offsetMs, this.clock.now());
    if (project && lateSync(sentAt, this.clock.now(), project.applyTo))
      return this.applications.holdForVerification(
        context.view,
        id,
        ifMatch,
        ['late_sync'],
        sentAt,
      );
    return this.applications.act(context.view, id, 'submit', {}, ifMatch);
  }

  /** An outcome of the sync rules on record, with the actor, outside any record's transaction. */
  private async onRecord(
    action: string,
    principal: Principal,
    applicationId: string,
    facts: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.audit.record(this.prisma, {
      action,
      entityType: 'application',
      entityId: applicationId,
      actorUserId: principal.userId,
      new: facts,
    });
  }

  private async fill(context: SyncContext, record: SyncRecord): Promise<RowResult> {
    const payload = parsed(fillPayload, record.payload);
    const view = await this.unlocks.fill(context.principal, payload.unlockId, {
      value: payload.value,
    });
    return {
      clientUuid: record.clientUuid,
      result: 'synced',
      serverId: view.applicationId,
      status: null,
    };
  }

  /**
   * A photo still on the phone may only stand for a photo question the volunteer sees: a slot that
   * names anything else (a required text, an official question) is the record's own mistake.
   */
  private async assertPhotoSlots(slots: readonly string[], formVersionId: string): Promise<void> {
    if (!slots.length) return;
    const definition = await readDefinition(this.prisma, formVersionId, 'volunteer');
    const wrong = wrongSlot(slots, definition);
    if (wrong)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: wrong, code: 'application.photo_slot_invalid' },
      ]);
  }

  /**
   * The application a record acts on: its server id, else the id the draft it depends on got in
   * this batch, else the one that draft got in an earlier batch (looked up by its client id; the
   * service still decides whether the caller may touch it).
   */
  private async targetOf(
    record: SyncRecord,
    serverIds: ReadonlyMap<string, string>,
  ): Promise<string> {
    if (record.target) return record.target;
    for (const dependency of record.dependencies ?? []) {
      const known = serverIds.get(dependency);
      if (known) return known;
      const earlier = await this.prisma.application.findUnique({
        where: { clientUuid: dependency },
        select: { id: true },
      });
      if (earlier) return earlier.id;
    }
    throw new ApiError('sync.target_unknown', 422);
  }
}

/**
 * The code a refused record carries. A client id that belongs to another caller's record is
 * refused as not permitted, like every other foreign record, so nothing says it exists.
 */
function codeOf(error: ApiError): string {
  if (error.code === 'validation.failed' && error.details?.some((d) => d.path === 'clientUuid'))
    return 'sync.not_permitted';
  return CODE_MAP[error.code] ?? error.code;
}

/** The hash a key is bound to: the same request in any key order gives the same hash. */
export function requestHashOf(body: unknown): string {
  return createHash('sha256').update(stable(body)).digest('base64url');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** A record's payload against the schema of its kind; a mismatch is the record's own failure. */
function parsed<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new ApiError(
      'validation.failed',
      422,
      undefined,
      result.error.issues.map((i) => ({ path: i.path.join('.'), code: 'validation.failed' })),
    );
  return result.data;
}
