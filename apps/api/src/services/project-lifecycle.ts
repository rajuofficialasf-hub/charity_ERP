import { workflowDefinitionSchema } from '@css/shared';
import {
  type ExtendDeadline,
  limitRequired,
  type ProjectAction,
  projectStatusOf,
  setupCheck,
  transitionFor,
} from '@css/shared/projects';
import type { AuditWriter } from '../audit/audit-writer';
import type { Clock } from '../core/clock';
import { assertIfMatch } from '../core/etag';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { ProjectViewer, ProjectsService } from './projects';
import type { ProjectEvents } from '../notifications/project-events';

/**
 * The close guards a workflow may list. A guard whose module exists checks it here; the guards of
 * modules not built yet pass until those modules exist; any other key fails
 * the close, so a misspelled or forgotten guard never passes silently.
 */
const CLOSE_GUARDS = new Map<string, (tx: Tx, projectId: string) => Promise<boolean>>();
const CLOSE_GUARDS_NOT_BUILT_YET: readonly string[] = ['stock.balanced', 'animal_photos.complete'];

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The life of a project (docs/MASTER_SPEC.md, A6): a complete draft is
 * activated and its workflow snapshotted; the application window of an active project is extended
 * with a reason; closing is two steps, each with a reason, and the second runs the workflow's close
 * guards; a closing or closed project is reopened with a reason. Each action locks the project,
 * checks the move before the If-Match (so of two actions at once the second finds the new state),
 * writes and audits in one transaction.
 */
export class ProjectLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly projects: ProjectsService,
    private readonly clock: Clock,
    private readonly events: ProjectEvents,
  ) {}

  /** Locks the project and refuses a move its state does not allow, then a stale If-Match. */
  private async moving(
    tx: Tx,
    viewer: ProjectViewer,
    projectId: string,
    action: ProjectAction,
    ifMatch: string | undefined,
  ) {
    const project = await this.projects.locked(tx, viewer, projectId);
    const from = projectStatusOf(project.status);
    const to = transitionFor(action, from);
    if (!to) throw new ApiError('workflow.transition_not_allowed', 409);
    assertIfMatch(ifMatch, project.updatedAt);
    if (to === 'active') {
      // an inactive program has no open project: its row is locked, so a deactivation running at
      // the same moment waits for this move or sees the project open
      await tx.$queryRaw`SELECT id FROM programs WHERE id = ${project.programId}::uuid FOR UPDATE`;
      const program = await tx.program.findUniqueOrThrow({
        where: { id: project.programId },
        select: { active: true },
      });
      if (!program.active) throw new ApiError('program.inactive', 409);
    }
    return { project, from, to };
  }

  async activate(viewer: ProjectViewer, projectId: string, ifMatch: string | undefined) {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const { project, from, to } = await this.moving(tx, viewer, projectId, 'activate', ifMatch);
      const [workflow, fundSources, areaCount, components, publishedForms] = await Promise.all([
        tx.project.findUniqueOrThrow({
          where: { id: projectId },
          select: {
            rules: true,
            dawahEnabled: true,
            workflowDefinition: { select: { definition: true } },
          },
        }),
        tx.fundSource.findMany({ where: { projectId }, select: { source: true, amount: true } }),
        tx.projectArea.count({ where: { projectId } }),
        tx.projectComponent.findMany({
          where: { projectId },
          select: { componentKey: true, enabled: true, settings: true },
        }),
        // a form of the kind other cannot take beneficiary applications, so it does not count
        tx.formVersion.count({
          where: { status: 'published', form: { projectId, kind: 'beneficiary_application' } },
        }),
      ]);
      const definition = workflowDefinitionSchema.parse(workflow.workflowDefinition.definition);
      const missing = setupCheck({
        name: { bn: project.nameBn, en: project.nameEn },
        year: project.year,
        workflowKey: project.workflowDefinition.key,
        applyFrom: day(project.applyFrom),
        applyTo: day(project.applyTo),
        perVolunteerLimit: project.perVolunteerLimit,
        limitRequired: limitRequired(definition),
        costPerBeneficiary: project.costPerBeneficiary?.toFixed(2) ?? null,
        targetBeneficiaries: project.targetBeneficiaries,
        fundSources: fundSources.map((f) => ({ source: f.source, amount: f.amount.toFixed(2) })),
        areaCount,
        components,
        rules: workflow.rules,
        dawahEnabled: workflow.dawahEnabled,
        publishedForm: publishedForms > 0,
      });
      if (missing.length)
        throw new ApiError(
          'workflow.guard.project_setup_complete',
          409,
          undefined,
          missing.map((m) => ({ path: m, code: 'validation.required' })),
        );
      const result = await this.projects.writeState(tx, projectId, {
        status: to,
        activatedAt: this.clock.now(),
        // the workflow as it was on activation: later versions never change a running project
        workflowSnapshot: definition as Prisma.InputJsonValue,
        updatedBy: actor,
      });
      await this.audit.record(tx, {
        action: 'project.activate',
        entityType: 'project',
        entityId: projectId,
        old: { status: from },
        new: { status: to, workflowVersion: project.workflowVersion },
      });
      await this.events.activated(tx, projectId, actor);
      return result;
    });
  }

  /** Moves the end of an active project's application window later, with a reason. */
  async extendDeadline(
    viewer: ProjectViewer,
    projectId: string,
    body: ExtendDeadline,
    ifMatch: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const project = await this.projects.locked(tx, viewer, projectId);
      if (project.status !== 'active') throw new ApiError('workflow.transition_not_allowed', 409);
      assertIfMatch(ifMatch, project.updatedAt);
      const current = day(project.applyTo);
      // ISO dates (yyyy-mm-dd) compare correctly as strings
      if (current !== null && body.newApplyTo <= current)
        throw new ApiError('project.deadline_not_later', 409);
      const result = await this.projects.writeState(tx, projectId, {
        applyTo: new Date(`${body.newApplyTo}T00:00:00Z`),
        updatedBy: viewer.principal.userId,
      });
      await this.audit.record(tx, {
        action: 'project.deadline_extend',
        entityType: 'project',
        entityId: projectId,
        old: { applyTo: current },
        new: { applyTo: body.newApplyTo },
        reason: body.reason,
      });
      await this.events.deadlineExtended(tx, projectId, body.newApplyTo, viewer.principal.userId);
      return result;
    });
  }

  /** Active to closing: new applications stop; the remaining work goes on. */
  async startClosing(
    viewer: ProjectViewer,
    projectId: string,
    reason: string,
    ifMatch: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { from, to } = await this.moving(tx, viewer, projectId, 'start_closing', ifMatch);
      const result = await this.projects.writeState(tx, projectId, {
        status: to,
        updatedBy: viewer.principal.userId,
      });
      await this.audit.record(tx, {
        action: 'project.closing',
        entityType: 'project',
        entityId: projectId,
        old: { status: from },
        new: { status: to },
        reason,
      });
      await this.events.lifecycle(tx, 'project_closing', projectId, viewer.principal.userId);
      return result;
    });
  }

  /** Closing to closed, once every close guard of the workflow passes; then read-only. */
  async close(
    viewer: ProjectViewer,
    projectId: string,
    reason: string,
    ifMatch: string | undefined,
  ) {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const { from, to } = await this.moving(tx, viewer, projectId, 'close', ifMatch);
      const { workflowSnapshot } = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { workflowSnapshot: true },
      });
      // a project only becomes active through activation, which stores the snapshot; without one
      // the close guards are unknown, so the close fails
      const snapshot = workflowDefinitionSchema.safeParse(workflowSnapshot);
      const failed: string[] = snapshot.success ? [] : ['workflow_snapshot'];
      for (const guard of snapshot.data?.project_close_guards ?? []) {
        if (CLOSE_GUARDS_NOT_BUILT_YET.includes(guard)) continue;
        const check = CLOSE_GUARDS.get(guard);
        if (!check || !(await check(tx, projectId))) failed.push(guard);
      }
      if (failed.length)
        throw new ApiError(
          'workflow.guard.template_project_close_guards',
          409,
          undefined,
          failed.map((g) => ({ path: g, code: 'workflow.guard.template_project_close_guards' })),
        );
      const result = await this.projects.writeState(tx, projectId, {
        status: to,
        closedAt: this.clock.now(),
        closedBy: actor,
        updatedBy: actor,
      });
      await this.audit.record(tx, {
        action: 'project.close',
        entityType: 'project',
        entityId: projectId,
        old: { status: from },
        new: { status: to },
        reason,
      });
      await this.events.lifecycle(tx, 'project_closed', projectId, actor);
      return result;
    });
  }

  /** A closing or closed project returns to active, with a reason. */
  async reopen(
    viewer: ProjectViewer,
    projectId: string,
    reason: string,
    ifMatch: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { project, from, to } = await this.moving(tx, viewer, projectId, 'reopen', ifMatch);
      const result = await this.projects.writeState(tx, projectId, {
        status: to,
        closedAt: null,
        closedBy: null,
        updatedBy: viewer.principal.userId,
      });
      await this.audit.record(tx, {
        action: 'project.reopen',
        entityType: 'project',
        entityId: projectId,
        old: { status: from, closedAt: project.closedAt?.toISOString() ?? null },
        new: { status: to },
        reason,
      });
      await this.events.lifecycle(tx, 'project_reopened', projectId, viewer.principal.userId);
      return result;
    });
  }
}
