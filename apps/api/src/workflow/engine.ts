import {
  APPLICATION_ACTIONS,
  type ApplicationAction,
  type WorkflowDefinition,
  workflowDefinitionSchema,
} from '@css/shared';
import type { AccessService } from '../access/service.js';
import { applicationWhere, holdsPermission } from '../access/scope.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import { assertIfMatch } from '../core/etag.js';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { ApplicationEvents } from '../notifications/application-events.js';
import { IDENTITY_RULES_SELECT, identityRulesOf } from '../services/project-identity-rules.js';
import { z } from 'zod';
import { readEffects, type SideEffect, type SideEffectRunner } from './effects.js';
import { type EngineApplication, GuardContext, type GuardInput, GUARDS } from './guards.js';
import { isBuiltEffect, isBuiltGuard } from './registry.js';

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
  pendingPhotos: true,
  flags: true,
  clientCreatedAt: true,
  project: {
    select: {
      status: true,
      applyFrom: true,
      applyTo: true,
      perVolunteerLimit: true,
      workflowSnapshot: true,
      workflowDefinition: { select: { key: true, definition: true } },
      ...IDENTITY_RULES_SELECT,
    },
  },
} as const;

/**
 * What a caller adds to a move once every check has passed: `beforeApply` runs after the
 * permission, the scope, the version and the guards, and its columns are written with the new
 * state in the same statement (the submission binds the person this way, since a submitted
 * application always has one).
 */
export interface TransitionHooks {
  beforeApply?: (
    tx: Tx,
    application: EngineApplication,
  ) => Promise<Prisma.ApplicationUncheckedUpdateInput>;
}

export interface TransitionResult {
  id: string;
  from: string;
  to: string;
  /** The audit entry of the move (the auto moves that followed have their own). */
  auditId: string;
}

const froms = (t: Transition) => (Array.isArray(t.from) ? t.from : [t.from]);

/** A template's approval override: the moves of this permission need a grant with the condition. */
const approvalOverride = z.object({ permission: z.string(), require_condition: z.string() });

/** The internal guard every template with an approval override gets on that permission's moves. */
const APPROVER_GUARD = 'approver.has_permission';

function approvalOf(definition: WorkflowDefinition, permission: string) {
  const parsed = approvalOverride.safeParse(definition.overrides?.approval);
  if (!parsed.success || parsed.data.permission !== permission) return null;
  return { permission, condition: parsed.data.require_condition };
}

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
    private readonly sideEffects: SideEffectRunner,
  ) {}

  async transition(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    action: ApplicationAction,
    input: GuardInput = {},
    ifMatch?: string,
    hooks: TransitionHooks = {},
  ): Promise<TransitionResult> {
    const spec = APPLICATION_ACTIONS[action];
    if ('later' in spec && spec.later) throw new ApiError('workflow.action_not_built', 409);
    await tx.$queryRaw`SELECT id FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
    const row = await tx.application.findUnique({
      where: { id: applicationId },
      select: APPLICATION_SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    // a draft project has no snapshot yet; its template still says what the move would be, and
    // the project.active guard refuses the move
    const definition = workflowDefinitionSchema.parse(
      row.project.workflowSnapshot ?? row.project.workflowDefinition.definition,
    );
    // the permission and the scope come first, so a caller the application is hidden from learns
    // neither that it exists nor its state: the action's target state names the permission, the
    // exact transition is matched to the state only after the scope check
    const candidates = (definition.transitions ?? []).filter(
      (t) => t.to === spec.to && t.permission,
    );
    const transition = candidates.find(
      (t) => froms(t).includes(row.status) && (spec.from as readonly string[]).includes(row.status),
    );
    const permission = (transition ?? candidates[0])?.permission;
    if (!permission) throw new ApiError('workflow.transition_not_allowed', 409);

    const access = await this.access.load(principal.userId, tx);
    if (!holdsPermission(permission, access.grants)) {
      this.access.denied(principal.userId, permission, 'application');
      throw new ApiError('permission.denied', 403);
    }
    const scope = await this.access.scopeFor(principal, access, permission, 'application', tx);
    const reached = await tx.application.count({
      where: { AND: [{ id: applicationId }, applicationWhere(scope)] },
    });
    if (reached === 0) throw new ApiError('permission.not_found', 404);
    if (!transition) throw new ApiError('workflow.transition_not_allowed', 409);
    const application: EngineApplication = {
      ...row,
      project: {
        status: row.project.status,
        applyFrom: row.project.applyFrom,
        applyTo: row.project.applyTo,
        perVolunteerLimit: row.project.perVolunteerLimit,
        approval: approvalOf(definition, permission),
        identityRules: identityRulesOf(row.project),
      },
    };

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
      transition.to,
    );
    await this.runGuards(transition, ctx);
    const auditId = await this.apply(tx, principal, application, transition, action, input, hooks);
    await this.followAutomatic(tx, principal, application, transition.to, definition);
    return { id: applicationId, from: application.status, to: transition.to, auditId };
  }

  /** The effects that write their own rows, inside the move's transaction. */
  private async runSideEffects(
    tx: Tx,
    effects: readonly SideEffect[],
    applicationId: string,
    actor: string,
  ): Promise<void> {
    for (const effect of effects) await this.sideEffects.run(tx, effect, applicationId, actor);
  }

  private async runGuards(transition: Transition, ctx: GuardContext): Promise<void> {
    const guards = [...(transition.guards ?? [])];
    if (ctx.application.project.approval && !guards.includes(APPROVER_GUARD))
      guards.push(APPROVER_GUARD);
    const asked: string[] = [];
    for (const name of guards) {
      if (!isBuiltGuard(name)) throw new ApiError('workflow.guard_not_built', 409);
      const result = await GUARDS[name](ctx);
      if (result === false) throw new ApiError(`workflow.guard.${name.replace(/\./g, '_')}`, 409);
      if (result !== true) asked.push(result.comment);
    }
    // a decision that asks for a comment goes on with one, and names why it asks without
    if (asked.length && !ctx.input.comment?.trim())
      throw new ApiError(
        'workflow.comment_required',
        422,
        undefined,
        asked.map((reason) => ({ path: reason, code: 'workflow.comment_required' })),
      );
  }

  /** Writes the new state with its stamps and texts, then the audit entry, then the messages. */
  private async apply(
    tx: Tx,
    principal: Principal,
    application: EngineApplication,
    transition: Transition,
    action: ApplicationAction,
    input: GuardInput,
    hooks: TransitionHooks,
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
    // the decision's own reason stays on the row; a comment asked by a guard goes beside it into
    // the audit entry, and becomes the row's note only when the decision has no reason
    else if (reason || comment) Object.assign(stamps, { decisionComment: reason ?? comment });
    if (transition.to === 'deleted') Object.assign(stamps, { deletedAt: now });
    await tx.application.update({
      where: { id: application.id },
      data: {
        ...(hooks.beforeApply ? await hooks.beforeApply(tx, application) : {}),
        status: transition.to,
        updatedBy: actor,
        updatedAt: now,
        ...stamps,
      },
    });
    await this.runSideEffects(tx, outcome.run, application.id, actor);
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
      await this.events.publish(tx, key, { ...application, action, reason, message }, actor, now);
    return auditId;
  }

  /**
   * The automatic moves the new state triggers (`on_enter_<state>`), each audited on its own and
   * with its messages sent; `status` is the state the application has just entered.
   */
  private async followAutomatic(
    tx: Tx,
    principal: Principal,
    application: EngineApplication,
    status: string,
    definition: WorkflowDefinition,
  ): Promise<void> {
    for (let hops = 0; hops < 5; hops += 1) {
      const auto = (definition.transitions ?? []).find(
        (t) => t.auto === true && t.trigger === `on_enter_${status}` && froms(t).includes(status),
      );
      if (!auto) return;
      for (const name of auto.effects ?? [])
        if (!isBuiltEffect(name)) throw new ApiError('workflow.effect_not_built', 409);
      const outcome = readEffects(auto.effects ?? [], this.events);
      const now = this.clock.now();
      await tx.application.update({
        where: { id: application.id },
        data: { status: auto.to, updatedBy: principal.userId, updatedAt: now },
      });
      await this.runSideEffects(tx, outcome.run, application.id, principal.userId);
      await this.audit.record(tx, {
        action: outcome.auditAction ?? `application.${auto.to}`,
        entityType: 'application',
        entityId: application.id,
        old: { status },
        new: {
          status: auto.to,
          automatic: true,
          ...(outcome.locked ? { locked: true } : {}),
          ...(outcome.pending.length ? { effectsPending: outcome.pending } : {}),
        },
        actorUserId: principal.userId,
      });
      for (const key of outcome.notify)
        await this.events.publish(
          tx,
          key,
          { ...application, action: auto.to, reason: null, message: null },
          principal.userId,
          now,
        );
      status = auto.to;
    }
    throw new Error(`the automatic moves of application ${application.id} do not end`);
  }
}
