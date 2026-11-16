import { DEADLINE_SOON_DAYS, uuidv7, workflowDefinitionSchema } from '@css/shared';
import { isoDateInDhaka } from '@css/shared/format';
import {
  BUDGET_LIMIT_PAISA,
  type CodeLabel,
  editableIn,
  identityRules,
  plannedBudgetPaisa,
  type ProjectCreate,
  type ProjectFilter,
  type ProjectStatus,
  type ProjectUpdate,
  sessionDates,
  sessionLabel,
  type SessionPeriod,
  sessionYear,
  type SetupField,
  startingComponents,
  type TemplateDefinition,
  templateDefinitionSchema,
  sumPaisa,
  transitionFor,
  type WorkflowKey,
} from '@css/shared/projects';
import type { AccessService } from '../access/service.js';
import { holdsPermission, programWhere, projectWhere, type Scope } from '../access/scope.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import { isUniqueViolationOf } from '../core/db-errors.js';
import { assertIfMatch } from '../core/etag.js';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
} from '../core/pagination.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { Env } from '../config/env.js';
import { type Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { applyDefinition, projectDefinition } from './project-definition.js';
import { auditIdentityRulesChange, IDENTITY_RULES_COMPONENT } from './project-identity-rules.js';

/** Newest first by id (UUID v7 follows the time of creation and pages without gaps). */
const DAY = 86_400_000;
const SORT = parseSort(undefined, ['id'], [{ field: 'id', direction: 'desc' }]);

const SELECT = {
  id: true,
  programId: true,
  seriesId: true,
  code: true,
  year: true,
  periodFrom: true,
  periodTo: true,
  nameBn: true,
  nameEn: true,
  description: true,
  status: true,
  workflowVersion: true,
  applyFrom: true,
  applyTo: true,
  perVolunteerLimit: true,
  costPerBeneficiary: true,
  targetBeneficiaries: true,
  budgetPlanned: true,
  dawahEnabled: true,
  activatedAt: true,
  closedAt: true,
  cancelledAt: true,
  updatedAt: true,
  workflowDefinition: { select: { key: true } },
} satisfies Prisma.ProjectSelect;

type Row = Prisma.ProjectGetPayload<{ select: typeof SELECT }>;

/** The caller of a project route: who it is and what its route scope reaches. */
export interface ProjectViewer {
  principal: Principal;
  scope: Scope;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const money = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));
const toDate = (s: string | null | undefined) =>
  s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00Z`);

const month = (d: Date) => d.toISOString().slice(0, 7);
/** The stored days of a period of months. */
function periodDates(period: SessionPeriod): { periodFrom: Date; periodTo: Date } {
  const { from, to } = sessionDates(period);
  return { periodFrom: new Date(`${from}T00:00:00Z`), periodTo: new Date(`${to}T00:00:00Z`) };
}

/** What a reader of a project sees: a volunteer the work facts only, an official the rest. */
interface ViewOf {
  forVolunteer: boolean;
  /** The budget amounts, only inside the caller's `budget.view` scope (docs/security/RBAC.md, the budget rows). */
  budget: boolean;
}

/** An official who changes a project sees all of it: the editors hold `budget.view` by default. */
const EDITOR: ViewOf = { forVolunteer: false, budget: true };

/**
 * What a project shows. A volunteer gets only the work facts of an active project it is on: never
 * the budget, the program, the series, or anything the officials keep (fund sources, staff and areas have their
 * own official-only routes). An official without `budget.view` on the project gets no amounts.
 */
function view(p: Row, { forVolunteer, budget }: ViewOf) {
  const work = {
    id: p.id,
    code: p.code,
    year: p.year,
    name: { bn: p.nameBn, en: p.nameEn },
    status: p.status as ProjectStatus,
    workflowKey: p.workflowDefinition.key,
    applyFrom: day(p.applyFrom),
    applyTo: day(p.applyTo),
    perVolunteerLimit: p.perVolunteerLimit,
    dawahEnabled: p.dawahEnabled,
    // which session of its project this is: the months it runs and the label read from them
    periodFrom: month(p.periodFrom),
    periodTo: month(p.periodTo),
    sessionLabel: sessionLabel(month(p.periodFrom), month(p.periodTo)),
  };
  if (forVolunteer) return work;
  return {
    ...work,
    programId: p.programId,
    seriesId: p.seriesId,
    description: p.description,
    workflowVersion: p.workflowVersion,
    ...(budget
      ? {
          costPerBeneficiary: money(p.costPerBeneficiary),
          targetBeneficiaries: p.targetBeneficiaries,
          budgetPlanned: money(p.budgetPlanned),
        }
      : {}),
    activatedAt: p.activatedAt?.toISOString() ?? null,
    closedAt: p.closedAt?.toISOString() ?? null,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
  };
}

/** Fields the activation check needs, which an activated project cannot lose again. */
const REQUIRED_ONCE_ACTIVE: readonly (keyof ProjectUpdate)[] = [
  'applyFrom',
  'perVolunteerLimit',
  'costPerBeneficiary',
  'targetBeneficiaries',
];

/** The two unique indexes that give a series one session per start year. */
const SESSION_YEAR_INDEXES = ['projects_series_id_year_key', 'projects_code_year_key'];

/**
 * The error to answer with: 409 when a session of the series took the year at the same moment
 * and the unique index decided, else the error as it came.
 */
export function yearTakenOr(error: unknown): unknown {
  return SESSION_YEAR_INDEXES.some((index) => isUniqueViolationOf(error, index))
    ? new ApiError('project.session_year_taken', 409)
    : error;
}

/** Where a new session's setup starts, and what it records of its source. */
export interface StartingPoint {
  workflowKey: WorkflowKey;
  definition?: TemplateDefinition;
  sourceTemplateId?: string;
  copiedFromProjectId?: string;
}

/** The request fields as the setup fields `editableIn` knows. */
const FIELDS: Record<keyof ProjectUpdate, SetupField> = {
  name: 'name',
  description: 'description',
  periodFrom: 'period',
  periodTo: 'period',
  workflowKey: 'workflowKey',
  applyFrom: 'applyFrom',
  applyTo: 'applyTo',
  perVolunteerLimit: 'perVolunteerLimit',
  costPerBeneficiary: 'costPerBeneficiary',
  targetBeneficiaries: 'targetBeneficiaries',
};

/** Whether a request value equals the current one (money compared to the paisa). */
function sameValue(key: keyof ProjectUpdate, value: unknown, current: unknown): boolean {
  if (key === 'costPerBeneficiary' && typeof value === 'string' && typeof current === 'string')
    return plannedBudgetPaisa(value, 1) === plannedBudgetPaisa(current, 1);
  return JSON.stringify(value) === JSON.stringify(current);
}

/**
 * Projects (docs/MASTER_SPEC.md, "Program and project setup (project configuration)"), each one
 * session of a project series (docs/database/DATABASE_SCHEMA.md, "projects"): a PM creates a draft
 * session of a series of its program; the setup changes as the session's state allows; a draft
 * that was never activated can be cancelled. Every write locks the project (on creation, the
 * series and its program) and is audited in its transaction.
 */
export class ProjectsService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly clock: Clock,
  ) {}

  /** Of the given projects, those whose budget the caller may see (`budget.view` in its scope). */
  private async budgetVisible(viewer: ProjectViewer, ids: string[]): Promise<Set<string>> {
    if (viewer.principal.kind === 'volunteer' || ids.length === 0) return new Set();
    const access = await this.access.load(viewer.principal.userId);
    if (!holdsPermission('budget.view', access.grants)) return new Set();
    const scope = await this.access.scopeFor(viewer.principal, access, 'budget.view', 'project');
    const rows = await this.prisma.project.findMany({
      where: { AND: [{ id: { in: ids } }, projectWhere(scope)] },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** The projects a caller reaches; a volunteer only the active ones it is on. */
  private where(viewer: ProjectViewer): Prisma.ProjectWhereInput {
    const reach = projectWhere(viewer.scope);
    return viewer.principal.kind === 'volunteer' ? { AND: [reach, { status: 'active' }] } : reach;
  }

  /** The rows of the project list for these filters; the home counts with it too. */
  listWhere(query: ProjectFilter, viewer: ProjectViewer): Prisma.ProjectWhereInput {
    return {
      AND: [
        this.where(viewer),
        // a cancelled draft leaves the lists unless asked for
        { status: query.status ?? { not: 'cancelled' } },
        query.programId ? { programId: query.programId } : {},
        query.seriesId ? { seriesId: query.seriesId } : {},
        query.year ? { year: query.year } : {},
        query.endingSoon ? this.endingSoonWhere() : {},
      ],
    };
  }

  /** The application window ends today or within the next few days (Dhaka dates). */
  private endingSoonWhere(): Prisma.ProjectWhereInput {
    const now = this.clock.now();
    const today = isoDateInDhaka(now);
    const last = isoDateInDhaka(new Date(now.getTime() + DEADLINE_SOON_DAYS * DAY));
    return {
      applyTo: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${last}T00:00:00Z`) },
    };
  }

  async list(query: ProjectFilter & PageQuery, viewer: ProjectViewer) {
    const binding = `projects.list|${viewer.principal.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter = this.listWhere(query, viewer);
    const [fetched, total] = await Promise.all([
      this.prisma.project.findMany({
        where: cursor ? { AND: [filter, keysetWhere(SORT, cursor)] } : filter,
        orderBy: orderBy(SORT, direction),
        take: query.limit + 1,
        select: SELECT,
      }),
      query.include === 'total' ? this.prisma.project.count({ where: filter }) : undefined,
    ]);
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: SORT,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
      total,
    });
    const forVolunteer = viewer.principal.kind === 'volunteer';
    const budget = await this.budgetVisible(
      viewer,
      rows.map((p) => p.id),
    );
    return {
      rows: rows.map((p) => view(p, { forVolunteer, budget: budget.has(p.id) })),
      meta,
    };
  }

  async get(viewer: ProjectViewer, projectId: string) {
    const row = await this.prisma.project.findFirst({
      where: { AND: [{ id: projectId }, this.where(viewer)] },
      select: SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    const budget = await this.budgetVisible(viewer, [row.id]);
    return {
      project: view(row, {
        forVolunteer: viewer.principal.kind === 'volunteer',
        budget: budget.has(row.id),
      }),
      updatedAt: row.updatedAt,
    };
  }

  /**
   * A draft session of a series, created in the setup's first step, starting from a workflow, a
   * master template or a copy of a project the caller may view.
   */
  async create(viewer: ProjectViewer, body: ProjectCreate) {
    try {
      return await this.prisma.$transaction((tx) =>
        this.createSession(tx, viewer, body.seriesId, body, (t) =>
          this.startingPoint(t, viewer, body.source),
        ),
      );
    } catch (error) {
      throw yearTakenOr(error);
    }
  }

  /**
   * Writes a draft session of a series inside the caller's transaction. The code, the program and
   * the names are the series', the year is the year the period starts in, and a series takes one
   * session per start year (409 otherwise). The program is the one the series is stored with: a
   * caller who may not create projects there is refused (403), and an inactive program takes no
   * session (409). The series is locked first, then its program, the order every write of what the
   * sessions of a series share takes.
   */
  async createSession(
    tx: Tx,
    viewer: ProjectViewer,
    seriesId: string,
    period: SessionPeriod,
    startOf: (tx: Tx) => Promise<StartingPoint>,
  ) {
    const actor = viewer.principal.userId;
    await tx.$queryRaw`SELECT id FROM project_series WHERE id = ${seriesId}::uuid FOR UPDATE`;
    const series = await tx.projectSeries.findUnique({
      where: { id: seriesId },
      select: { id: true, programId: true, code: true, nameBn: true, nameEn: true },
    });
    if (!series) throw new ApiError('permission.not_found', 404);
    await this.lockedProgram(tx, viewer, series.programId);
    const year = sessionYear(period.periodFrom);
    // a cancelled session keeps its year, as it keeps its row
    if (await tx.project.findFirst({ where: { seriesId, year }, select: { id: true } }))
      throw new ApiError('project.session_year_taken', 409);
    const start = await startOf(tx);
    const workflow = await this.workflow(tx, start.workflowKey);
    const id = uuidv7();
    const components = await this.components(tx, start.workflowKey, workflow.definition);
    // the dawah flag follows the dawah component the project starts with
    const dawah = (start.definition?.components ?? components).some(
      (c) => c.componentKey === 'dawah' && c.enabled,
    );
    const row = await tx.project.create({
      select: SELECT,
      data: {
        id,
        programId: series.programId,
        seriesId,
        code: series.code,
        year,
        ...periodDates(period),
        nameBn: series.nameBn,
        nameEn: series.nameEn,
        status: 'draft',
        workflowDefinitionId: workflow.id,
        workflowVersion: workflow.version,
        dawahEnabled: dawah,
        sourceTemplateId: start.sourceTemplateId ?? null,
        copiedFromProjectId: start.copiedFromProjectId ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
    });
    await tx.projectComponent.createMany({
      data: components.map((c) => ({
        id: uuidv7(),
        projectId: id,
        componentKey: c.componentKey,
        enabled: c.enabled,
        settings: c.settings as Prisma.InputJsonValue,
        createdBy: actor,
        updatedBy: actor,
      })),
    });
    // a template or a copy brings its components, syllabus and rules
    if (start.definition) await applyDefinition(tx, id, start.definition, actor);
    // the application numbers of this project count from here
    await tx.idSequence.create({ data: { scopeKey: `app:${id}`, lastValue: 0 } });
    // what the project's application asks from its first day, whichever source set it
    const asked = await tx.projectComponent.findUnique({
      where: {
        projectId_componentKey: { projectId: id, componentKey: IDENTITY_RULES_COMPONENT },
      },
      select: { settings: true },
    });
    const source = start.sourceTemplateId
      ? { kind: 'template', templateId: start.sourceTemplateId }
      : start.copiedFromProjectId
        ? { kind: 'copy', projectId: start.copiedFromProjectId }
        : { kind: 'workflow', workflowKey: start.workflowKey };
    await this.audit.record(tx, {
      action: 'project.create',
      entityType: 'project',
      entityId: id,
      new: { ...view(row, EDITOR), source, identityRules: identityRules(asked?.settings) },
    });
    return { project: view(row, EDITOR), updatedAt: row.updatedAt };
  }

  /**
   * The session a new session of a series copies: the one named, which must be a session of that
   * series, or its newest session that is not cancelled (422 when there is none to copy).
   */
  async sessionToCopy(
    tx: Tx,
    seriesId: string,
    sourceProjectId: string | undefined,
  ): Promise<StartingPoint> {
    const source = await tx.project.findFirst({
      where: sourceProjectId
        ? { id: sourceProjectId, seriesId }
        : { seriesId, status: { not: 'cancelled' } },
      orderBy: { year: 'desc' },
      select: { id: true },
    });
    if (!source) throw new ApiError('project.session_source_foreign', 422);
    const definition = await projectDefinition(tx, source.id);
    return { workflowKey: definition.workflowKey, definition, copiedFromProjectId: source.id };
  }

  async update(
    viewer: ProjectViewer,
    projectId: string,
    body: ProjectUpdate,
    ifMatch: string | undefined,
  ) {
    try {
      return await this.updateLocked(viewer, projectId, body, ifMatch);
    } catch (error) {
      throw yearTakenOr(error);
    }
  }

  private async updateLocked(
    viewer: ProjectViewer,
    projectId: string,
    body: ProjectUpdate,
    ifMatch: string | undefined,
  ) {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      // what a session shares with its series (the names, the year among its sessions) is
      // written under the series' lock, taken before the session's as a rename of the series
      // takes them, so the two never wait on each other
      if (body.name !== undefined || body.periodFrom !== undefined)
        await this.lockSeriesOf(tx, projectId);
      const before = await this.locked(tx, viewer, projectId);
      assertIfMatch(ifMatch, before.updatedAt);
      const status = before.status as ProjectStatus;
      const current = view(before, EDITOR) as Record<string, unknown>;
      // a field sent with its current value changes nothing, so a whole form may be sent back
      const changing = (Object.keys(body) as (keyof ProjectUpdate)[]).filter(
        // eslint-disable-next-line security/detect-object-injection -- keys of the strict body schema
        (key) => !sameValue(key, body[key], current[key]),
      );
      for (const key of changing)
        // eslint-disable-next-line security/detect-object-injection -- key is a field of the strict body schema
        if (!editableIn(status, FIELDS[key])) throw new ApiError('project.read_only', 409);
      if (status !== 'draft')
        for (const key of REQUIRED_ONCE_ACTIVE)
          // eslint-disable-next-line security/detect-object-injection -- a fixed list of body fields
          if (body[key] === null) throw new ApiError('validation.required', 422);
      const cost =
        body.costPerBeneficiary === undefined
          ? money(before.costPerBeneficiary)
          : body.costPerBeneficiary;
      const target =
        body.targetBeneficiaries === undefined
          ? before.targetBeneficiaries
          : body.targetBeneficiaries;
      if (changing.includes('costPerBeneficiary') || changing.includes('targetBeneficiaries'))
        await this.checkBudget(tx, projectId, status, cost, target);
      // a draft's period, its two months together; the year is the year it starts in, and a
      // series takes one session per start year
      const period =
        (changing.includes('periodFrom') || changing.includes('periodTo')) &&
        body.periodFrom !== undefined &&
        body.periodTo !== undefined
          ? { periodFrom: body.periodFrom, periodTo: body.periodTo }
          : undefined;
      const year = period ? sessionYear(period.periodFrom) : before.year;
      if (year !== before.year) {
        const taken = await tx.project.findFirst({
          where: { seriesId: before.seriesId, year, id: { not: projectId } },
          select: { id: true },
        });
        if (taken) throw new ApiError('project.session_year_taken', 409);
      }
      if (body.name && changing.includes('name')) {
        // a session carries the names of its series: while it is the series' one session its
        // rename renames the series; beside other sessions it is renamed with them, through the
        // series
        const others = await tx.project.count({
          where: { seriesId: before.seriesId, id: { not: projectId } },
        });
        if (others) throw new ApiError('project.read_only', 409);
        await tx.projectSeries.update({
          where: { id: before.seriesId },
          data: { nameBn: body.name.bn, nameEn: body.name.en, updatedBy: actor },
        });
      }
      const from = body.applyFrom === undefined ? day(before.applyFrom) : body.applyFrom;
      const to = body.applyTo === undefined ? day(before.applyTo) : body.applyTo;
      if (from && to && from > to) throw new ApiError('validation.out_of_range', 422);
      let workflow: { id: string; version: number; dawahEnabled: boolean } | undefined;
      if (body.workflowKey && body.workflowKey !== before.workflowDefinition.key) {
        // a draft that changes its workflow starts again from that workflow's components
        const next = await this.workflow(tx, body.workflowKey);
        const components = await this.components(tx, body.workflowKey, next.definition);
        workflow = {
          ...next,
          dawahEnabled: components.some((c) => c.componentKey === 'dawah' && c.enabled),
        };
        const asked = await tx.projectComponent.findUnique({
          where: {
            projectId_componentKey: { projectId, componentKey: IDENTITY_RULES_COMPONENT },
          },
          select: { settings: true },
        });
        for (const c of components)
          await tx.projectComponent.update({
            where: {
              projectId_componentKey: { projectId, componentKey: c.componentKey },
            },
            data: {
              enabled: c.enabled,
              settings: c.settings as Prisma.InputJsonValue,
              updatedBy: actor,
            },
          });
        // the new workflow's starting settings may ask something else of an application
        await auditIdentityRulesChange(
          this.audit,
          tx,
          projectId,
          asked?.settings,
          components.find((c) => c.componentKey === IDENTITY_RULES_COMPONENT)?.settings,
        );
      }
      const row = await tx.project.update({
        where: { id: projectId },
        select: SELECT,
        data: {
          nameBn: body.name?.bn,
          nameEn: body.name?.en,
          description: body.description,
          ...(period ? { year, ...periodDates(period) } : {}),
          workflowDefinitionId: workflow?.id,
          workflowVersion: workflow?.version,
          dawahEnabled: workflow?.dawahEnabled,
          applyFrom: toDate(body.applyFrom),
          applyTo: toDate(body.applyTo),
          perVolunteerLimit: body.perVolunteerLimit,
          costPerBeneficiary: body.costPerBeneficiary,
          targetBeneficiaries: body.targetBeneficiaries,
          updatedBy: actor,
        },
      });
      const old = current;
      const now = view(row, EDITOR) as Record<string, unknown>;
      // only what changed goes into the audit entry
      const changed = Object.keys(now).filter(
        // eslint-disable-next-line security/detect-object-injection -- keys of the view object
        (k) => JSON.stringify(old[k]) !== JSON.stringify(now[k]),
      );
      await this.audit.record(tx, {
        action: 'project.configure',
        entityType: 'project',
        entityId: projectId,
        // eslint-disable-next-line security/detect-object-injection -- keys of the view object
        old: Object.fromEntries(changed.map((k) => [k, old[k]])) as Prisma.InputJsonValue,
        // eslint-disable-next-line security/detect-object-injection -- keys of the view object
        new: Object.fromEntries(changed.map((k) => [k, now[k]])) as Prisma.InputJsonValue,
      });
      return { project: view(row, EDITOR), updatedAt: row.updatedAt };
    });
  }

  /**
   * Refuses a planned budget the column cannot hold and, once the project is active, one its fund
   * sources no longer add up to: an active project's budget changes together with its fund sources.
   * Pass the fund sources about to be saved, or leave them out to use the
   * stored ones.
   */
  async checkBudget(
    tx: Tx,
    projectId: string,
    status: ProjectStatus,
    cost: string | null,
    target: number | null,
    fundSources?: readonly string[],
  ): Promise<void> {
    const planned = plannedBudgetPaisa(cost, target);
    if (planned !== null && planned >= BUDGET_LIMIT_PAISA)
      throw new ApiError('validation.out_of_range', 422);
    if (status === 'draft') return;
    const amounts =
      fundSources ??
      (await tx.fundSource.findMany({ where: { projectId }, select: { amount: true } })).map((f) =>
        f.amount.toFixed(2),
      );
    if (amounts.length === 0 || planned === null || sumPaisa(amounts) !== planned)
      throw new ApiError('project.budget_mismatch', 422);
  }

  /** A draft that was never activated is cancelled with a reason; it keeps its row and code. */
  async cancel(viewer: ProjectViewer, projectId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.locked(tx, viewer, projectId);
      if (!transitionFor('cancel', before.status as ProjectStatus))
        throw new ApiError('workflow.transition_not_allowed', 409);
      const row = await tx.project.update({
        where: { id: projectId },
        select: SELECT,
        data: {
          status: 'cancelled',
          cancelledAt: this.clock.now(),
          cancelledBy: viewer.principal.userId,
          updatedBy: viewer.principal.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'project.cancel',
        entityType: 'project',
        entityId: projectId,
        old: { status: before.status },
        new: { status: 'cancelled' },
        reason,
      });
      return { project: view(row, EDITOR), updatedAt: row.updatedAt };
    });
  }

  /**
   * Writes a lifecycle change of a locked project and returns the project as an official sees it.
   * The caller has checked the move and audits it in the same transaction.
   */
  async writeState(tx: Tx, projectId: string, data: Prisma.ProjectUncheckedUpdateInput) {
    const row = await tx.project.update({ where: { id: projectId }, select: SELECT, data });
    return { project: view(row, EDITOR), updatedAt: row.updatedAt };
  }

  /**
   * Locks the series a project is a session of. Every write of what the sessions of a series
   * share takes this lock first and the session's row after it.
   */
  async lockSeriesOf(tx: Tx, projectId: string): Promise<void> {
    await tx.$queryRaw`
      SELECT s.id FROM project_series s
      JOIN projects p ON p.series_id = s.id
      WHERE p.id = ${projectId}::uuid
      FOR UPDATE OF s`;
  }

  /** The project inside the caller's scope (404 outside), with its row locked for the write. */
  async locked(tx: Tx, viewer: ProjectViewer, projectId: string): Promise<Row> {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    const row = await tx.project.findFirst({
      where: { AND: [{ id: projectId }, this.where(viewer)] },
      select: SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    return row;
  }

  /**
   * A program the caller may put a project or a series in: inside its scope (403 otherwise) and
   * active (409). The row is locked against a deactivation at the same moment.
   */
  async lockedProgram(tx: Tx, viewer: ProjectViewer, programId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM programs WHERE id = ${programId}::uuid FOR UPDATE`;
    const program = await tx.program.findFirst({
      where: { AND: [{ id: programId }, programWhere(viewer.scope)] },
      select: { active: true },
    });
    if (!program) {
      this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
      throw new ApiError('permission.denied', 403);
    }
    if (!program.active) throw new ApiError('program.inactive', 409);
  }

  /**
   * Where a new project starts: a workflow's starting setup, an active master template (any in the
   * organisation), or a copy of a project the caller may view. An unknown template or a project
   * outside the caller's reach is not found; an inactive template starts nothing.
   */
  private async startingPoint(
    tx: Tx,
    viewer: ProjectViewer,
    source: ProjectCreate['source'],
  ): Promise<StartingPoint> {
    if (source.kind === 'workflow') return { workflowKey: source.workflowKey };
    if (source.kind === 'template') {
      const template = await tx.projectTemplate.findUnique({
        where: { id: source.templateId },
        select: { active: true, definition: true },
      });
      // a form template of the form library shares the table and starts no project
      const parsed = templateDefinitionSchema.safeParse(template?.definition);
      if (!template || !parsed.success) throw new ApiError('permission.not_found', 404);
      if (!template.active) throw new ApiError('template.inactive', 409);
      const definition = parsed.data;
      return {
        workflowKey: definition.workflowKey,
        definition,
        sourceTemplateId: source.templateId,
      };
    }
    const actor = viewer.principal.userId;
    if (!(await this.access.holdsOnProject(actor, 'project.view', source.projectId, tx))) {
      this.access.denied(actor, 'project.view', 'project');
      throw new ApiError('permission.not_found', 404);
    }
    const definition = await projectDefinition(tx, source.projectId);
    return {
      workflowKey: definition.workflowKey,
      definition,
      copiedFromProjectId: source.projectId,
    };
  }

  /** The newest seeded definition of a workflow (422 when it is not seeded). */
  private async workflow(tx: Tx, key: WorkflowKey) {
    const row = await tx.workflowDefinition.findFirst({
      where: { key },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, definition: true },
    });
    if (!row) throw new ApiError('validation.option_unknown', 422);
    return { ...row, definition: workflowDefinitionSchema.parse(row.definition) };
  }

  /** The starting components of a workflow, with the list defaults from the reference lists. */
  private async components(
    tx: Tx,
    key: WorkflowKey,
    definition: ReturnType<typeof workflowDefinitionSchema.parse>,
  ) {
    const lists = await tx.referenceList.findMany({
      where: {
        listKey: { in: ['beneficiary_class_default', 'application_kind_default'] },
        active: true,
      },
      orderBy: { sortOrder: 'asc' },
      select: { listKey: true, code: true, labelBn: true, labelEn: true },
    });
    const of = (listKey: string): CodeLabel[] =>
      lists
        .filter((l) => l.listKey === listKey)
        .map((l) => ({ code: l.code, label: { bn: l.labelBn, en: l.labelEn } }));
    return startingComponents(key, definition, {
      beneficiaryClasses: of('beneficiary_class_default'),
      applicationKinds: of('application_kind_default'),
    });
  }
}
