import {
  APPLICATION_ACTIONS,
  type ApplicationAction,
  type WorkflowDefinition,
  workflowDefinitionSchema,
} from '@css/shared';
import type { AccessService } from '../access/service';
import { applicationWhere, holdsPermission } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import { assertIfMatch } from '../core/etag';
import type { Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { ApplicationEvents } from '../notifications/application-events';
import { readEffects } from './effects';
import { type EngineApplication, GuardContext, type GuardInput, GUARDS } from './guards';
import { isBuiltEffect, isBuiltGuard } from './registry';

type Transition = NonNullable<WorkflowDefinition['transitions']>[number];

const APPLICATION_SELECT = {
  id: true,
  projectId: true,
  formVersionId: true,
  beneficiaryId: true,
  ownerVolunteerId: true,
  createdByUserId: true,
  createdBy: true,
  submittedBy: true,
  status: true,
  zakatDecision: true,
  updatedAt: true,
  project: {
    select: {
      status: true,
      applyFrom: true,
      applyTo: true,
      perVolunteerLimit: true,
      workflowSnapshot: true,
      workflowDefinition: { select: { key: true, definition: true } },
    },
  },
} as const;

export interface TransitionResult {
  id: string;
  from: string;
  to: string;
  /** The audit entry of the move (the auto moves that followed have their own). */
  auditId: string;
}

const froms = (t: Transition) => (Array.isArray(t.from) ? t.from : [t.from]);

/**
 * The workflow engine (docs/architecture/WORKFLOW_ENGINE.md): moves an application through a
 * transition of its project's snapshot and nothing else. The caller must hold the transition's
 * permission with a scope that reaches the application, every guard must pass, then the state is
 * written, the effects are applied, one audit entry records the move with its texts, and the
 * automatic moves the new state triggers follow in the same transaction.
 */
export class WorkflowEngine {
  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly events: ApplicationEvents,
  ) {}

  async transition(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    action: ApplicationAction,
    input: GuardInput = {},
    ifMatch?: string,
  ): Promise<TransitionResult> {
    const spec = APPLICATION_ACTIONS[action];
    if ('later' in spec && spec.later) throw new ApiError('workflow.action_not_built', 409);
    await tx.$queryRaw`SELECT id FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
    const row = await tx.application.findUnique({
      where: { id: applicationId },
      select: APPLICATION_SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    const application: EngineApplication = {
      ...row,
      project: {
        status: row.project.status,
        applyFrom: row.project.applyFrom,
        applyTo: row.project.applyTo,
        perVolunteerLimit: row.project.perVolunteerLimit,
        workflowKey: row.project.workflowDefinition.key,
      },
    };
    // a draft project has no snapshot yet; its template still says what the move would be, and
    // the project.active guard refuses the move
    const definition = workflowDefinitionSchema.parse(
      row.project.workflowSnapshot ?? row.project.workflowDefinition.definition,
    );
    const transition = (definition.transitions ?? []).find(
      (t) =>
        t.to === spec.to &&
        froms(t).includes(application.status) &&
        (spec.from as readonly string[]).includes(application.status),
    );
    if (!transition || !transition.permission)
      throw new ApiError('workflow.transition_not_allowed', 409);

    const access = await this.access.load(principal.userId, tx);
    if (!holdsPermission(transition.permission, access.grants)) {
      this.access.denied(principal.userId, transition.permission, 'application');
      throw new ApiError('permission.denied', 403);
    }
    const scope = await this.access.scopeFor(
      principal,
      access,
      transition.permission,
      'application',
      tx,
    );
    const reached = await tx.application.count({
      where: { AND: [{ id: applicationId }, applicationWhere(scope)] },
    });
    if (reached === 0) throw new ApiError('permission.not_found', 404);

    if (ifMatch !== undefined) assertIfMatch(ifMatch, row.updatedAt);
    if (transition.requires_reason && !input.reason?.trim())
      throw new ApiError('workflow.reason_required', 422);
    if (spec.texts === 'reason_and_message' && !input.message?.trim())
      throw new ApiError('workflow.message_required', 422);

    const ctx = new GuardContext(
      tx,
      application,
      { userId: principal.userId, kind: principal.kind, access },
      input,
      this.clock,
    );
    await this.runGuards(transition, ctx);
    const auditId = await this.apply(tx, principal, application, transition, action, input);
    await this.followAutomatic(tx, principal, applicationId, definition);
    return { id: applicationId, from: application.status, to: transition.to, auditId };
  }

  private async runGuards(transition: Transition, ctx: GuardContext): Promise<void> {
    for (const name of transition.guards ?? []) {
      if (!isBuiltGuard(name)) throw new ApiError('workflow.guard_not_built', 409);
      if (!(await GUARDS[name](ctx)))
        throw new ApiError(`workflow.guard.${name.replace(/\./g, '_')}`, 409);
    }
  }

  /** Writes the new state with its stamps and texts, then the audit entry, then the messages. */
  private async apply(
    tx: Tx,
    principal: Principal,
    application: EngineApplication,
    transition: Transition,
    action: ApplicationAction,
    input: GuardInput,
  ): Promise<string> {
    for (const name of transition.effects ?? [])
      if (!isBuiltEffect(name)) throw new ApiError('workflow.effect_not_built', 409);
    const outcome = readEffects(transition.effects ?? [], this.events);
    const now = this.clock.now();
    const actor = principal.userId;
    const reason = input.reason?.trim() || null;
    const message = input.message?.trim() || null;
    const comment = input.comment?.trim() || null;
    const stamps: Record<string, unknown> = {};
    switch (transition.actor_recorded_as) {
      case 'submitted_by':
        Object.assign(stamps, { submittedBy: actor, submittedAt: now });
        break;
      case 'reviewed_by':
        Object.assign(stamps, { reviewedBy: actor, reviewedAt: now });
        break;
      case 'approved_by':
        Object.assign(stamps, { approvedBy: actor, approvedAt: now });
        break;
      case 'completed_by':
        Object.assign(stamps, { completedBy: actor, completedAt: now });
        break;
      default:
        break;
    }
    if (transition.to === 'rejected')
      Object.assign(stamps, { decisionComment: reason, rejectionMessage: message });
    else if (application.status === 'rejected')
      Object.assign(stamps, { decisionComment: reason, rejectionMessage: null });
    else if (reason || comment) Object.assign(stamps, { decisionComment: comment ?? reason });
    if (transition.to === 'deleted') Object.assign(stamps, { deletedAt: now });
    await tx.application.update({
      where: { id: application.id },
      data: { status: transition.to, updatedBy: actor, updatedAt: now, ...stamps },
    });
    const auditId = await this.audit.record(tx, {
      action: outcome.auditAction ?? `application.${action}`,
      entityType: 'application',
      entityId: application.id,
      old: { status: application.status },
      new: {
        status: transition.to,
        action,
        ...(comment ? { comment } : {}),
        ...(message ? { message } : {}),
        ...(outcome.locked ? { locked: true } : {}),
        ...(outcome.pending.length ? { effectsPending: outcome.pending } : {}),
      },
      reason,
      actorUserId: actor,
    });
    for (const key of outcome.notify)
      await this.events.publish(tx, key, { ...application, action, reason, message }, actor);
    return auditId;
  }

  /** The automatic moves the new state triggers (`on_enter_<state>`), each audited on its own. */
  private async followAutomatic(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    definition: WorkflowDefinition,
  ): Promise<void> {
    for (let hops = 0; hops < 5; hops += 1) {
      const current = await tx.application.findUniqueOrThrow({
        where: { id: applicationId },
        select: APPLICATION_SELECT,
      });
      const auto = (definition.transitions ?? []).find(
        (t) =>
          t.auto === true &&
          t.trigger === `on_enter_${current.status}` &&
          froms(t).includes(current.status),
      );
      if (!auto) return;
      for (const name of auto.effects ?? [])
        if (!isBuiltEffect(name)) throw new ApiError('workflow.effect_not_built', 409);
      const outcome = readEffects(auto.effects ?? [], this.events);
      const now = this.clock.now();
      await tx.application.update({
        where: { id: applicationId },
        data: { status: auto.to, updatedBy: principal.userId, updatedAt: now },
      });
      await this.audit.record(tx, {
        action: outcome.auditAction ?? `application.${auto.to}`,
        entityType: 'application',
        entityId: applicationId,
        old: { status: current.status },
        new: {
          status: auto.to,
          automatic: true,
          ...(outcome.pending.length ? { effectsPending: outcome.pending } : {}),
        },
        actorUserId: principal.userId,
      });
    }
    throw new Error(`the automatic moves of application ${applicationId} do not end`);
  }
}
