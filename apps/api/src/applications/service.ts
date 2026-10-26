import {
  APPLICATION_ACTIONS,
  APPLICATION_STATES,
  type ApplicationAction,
  scoreCriteriaSchema,
  uuidv7,
  type WorkflowDefinition,
  workflowDefinitionSchema,
} from '@css/shared';
import { type Answer, type Audience, type FormDefinition, identityColumn } from '@css/shared/forms';
import { isoDateInDhaka } from '@css/shared/format';
import { z } from 'zod';
import { type EffectiveAccess, WORKING_ASSIGNMENT, workingTeamProjects } from '../access/effective';
import {
  applicationWhere,
  holdsPermission,
  ownApplicationsWhere,
  projectWhere,
  type Scope,
  teamLeadsOf,
} from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import { boundedRead } from '../core/bounded-read';
import type { Clock } from '../core/clock';
import {
  isUniqueViolation,
  isUniqueViolationOf,
  isVolunteerMobileRefusal,
} from '../core/db-errors';
import { assertIfMatch, etagOf } from '../core/etag';
import {
  buildPage,
  type CursorBody,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageNumberQuery,
  type PageQuery,
  pageOffset,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import { literalContains } from '../core/search';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { BeneficiaryFamilyService } from '../services/beneficiary-family';
import type { BeneficiaryIdentityService } from '../services/beneficiary-identity';
import { type FormAudience, readDefinition, versionView } from '../services/forms';
import { isAddressChain } from '../services/locations';
import type { NisabService } from '../services/nisab';
import { assertReachesApplication, isBlockedVolunteer } from './callers';
import { liveApplicationCounts } from './limit';
import type { UnlocksService } from './unlocks';
import type { ScoringService } from './scoring';
import { type CommentReason, commentReasons } from './decision-rules';
import type { Replayable } from '../services/uploads';
import type { WorkflowEngine } from '../workflow/engine';
import { type EngineApplication, GuardContext, GUARDS } from '../workflow/guards';
import type { BuiltGuard } from '../workflow/registry';
import { readActivities } from './activities';
import { readChanges, readTimeline } from './history';
import type { SubmissionWriter } from './submission';
import {
  addressOf,
  assertUploadsOwn,
  changedAnswers,
  checkAnswers,
  fieldByColumn,
  IDENTITY_COLUMN,
  nisabOption,
  readAnswers,
  textOf,
  writeAnswers,
} from './answers';
import {
  type ApplicationActionBody,
  type ApplicationCreate,
  type ApplicationFilter,
  type ApplicationSummary,
  type ApplicationUpdate,
  type ApplicationView,
  OFFICIAL_SECTION,
} from './view';

export interface ApplicationViewer {
  principal: Principal;
  /** The route's scope: the applications the caller reaches, or the projects for a create. */
  scope: Scope;
  fieldClasses: ReadonlySet<string>;
}

/** What a read answers, with the version the next write carries back in If-Match. */
export interface ApplicationRead {
  application: ApplicationView;
  updatedAt: Date;
}

/** The permission an edit needs in each state (docs/architecture/WORKFLOW_ENGINE.md, section 3). */
const EDIT_PERMISSION: Record<string, string> = {
  draft: 'application.edit_draft',
  submitted: 'application.edit_pending',
  under_review: 'application.review',
};

/** The identity answers a known person's profile locks: the number, the name, the father or husband. */
const LOCKED_COLUMNS = [IDENTITY_COLUMN, 'name', 'father_or_husband_name'] as const;

/** The guards a draft passes before it is made, so a refusal comes before any writing. */
const CREATE_GUARDS: BuiltGuard[] = [
  'project.active',
  'deadline.open',
  'volunteer.not_blocked',
  'consent.accepted',
  'limit.not_exceeded',
];

const IDENTITY_NUMBER = /^(\d{10}|\d{13}|\d{17})$/;
const TEAM_MEMBER_ROLE = 'volunteer_team_member';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Newest first by id (UUID v7 follows the time of creation and pages without gaps; a submission time can be null). */
const LIST_SORT_FIELDS = ['id'];
const DEFAULT_SORT = [{ field: 'id', direction: 'desc' as const }];
/** The office's review queue: the highest score first, unscored last, then the newest. */
const SCORE_SORT = [
  { field: 'totalScore', direction: 'desc' as const },
  { field: 'id', direction: 'desc' as const },
];
/** The decisions whose comment the review screen asks for before it sends. */
const DECISIONS = ['approve', 'waitlist', 'reject', 'pull_from_waitlist'] as const;
/** The states whose answers can still change the score; a decision freezes it. */
const SCORED_WHILE = ['submitted', 'under_review'];
/** The states a list leaves out unless asked for by name. */
const HIDDEN_STATES = ['deleted'];

/** The values a cursor of the score order carries: the score (or none) and the id. */
const SCORE_CURSOR = z.tuple([z.number().nullable(), z.uuid()]);

/**
 * The order of the review queue as Prisma reads it: the score high to low with the unscored last,
 * then the newest; reversed for a backward page.
 */
function scoreOrder(direction: 'next' | 'prev'): Prisma.ApplicationOrderByWithRelationInput[] {
  return direction === 'next'
    ? [{ totalScore: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
    : [{ totalScore: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }];
}

/** The rows after a cursor in the score order, where an unscored row comes after every score. */
function scoreKeyset(cursor: CursorBody): Prisma.ApplicationWhereInput {
  const parsed = SCORE_CURSOR.safeParse(cursor.v);
  if (!parsed.success)
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'cursor', code: 'validation.failed' },
    ]);
  const [score, id] = parsed.data;
  if (cursor.d === 'next')
    return score === null
      ? { totalScore: null, id: { lt: id } }
      : {
          OR: [
            { totalScore: { lt: score } },
            { totalScore: score, id: { lt: id } },
            { totalScore: null },
          ],
        };
  return score === null
    ? { OR: [{ totalScore: null, id: { gt: id } }, { totalScore: { not: null } }] }
    : { OR: [{ totalScore: { gt: score } }, { totalScore: score, id: { gt: id } }] };
}

/** The stored breakdown of a score, as the record shows it to the office. */
function scoreItemsOf(criteria: unknown) {
  return scoreCriteriaSchema.parse(criteria).items.map((item) => ({
    key: item.key,
    ...(item.label?.bn && item.label.en ? { label: { bn: item.label.bn, en: item.label.en } } : {}),
    input: item.input ?? null,
    max_points: item.max_points,
    points: item.points,
  }));
}

const VERSION_SELECT = {
  id: true,
  formId: true,
  versionNo: true,
  status: true,
  publishedAt: true,
} satisfies Prisma.FormVersionSelect;

const PROJECT_SELECT = {
  id: true,
  status: true,
  applyFrom: true,
  applyTo: true,
  perVolunteerLimit: true,
  workflowSnapshot: true,
  workflowDefinition: { select: { key: true, definition: true } },
} satisfies Prisma.ProjectSelect;

const ROW_SELECT = {
  id: true,
  appNo: true,
  projectId: true,
  formVersionId: true,
  beneficiaryId: true,
  beneficiary: { select: { name: true } },
  candidateBeneficiaryId: true,
  ownerVolunteerId: true,
  createdByUserId: true,
  createdBy: true,
  submittedBy: true,
  status: true,
  stage: true,
  outcome: true,
  flags: true,
  districtId: true,
  unionId: true,
  submittedAt: true,
  reviewedAt: true,
  approvedAt: true,
  decisionComment: true,
  rejectionMessage: true,
  identityKind: true,
  nisabValue: true,
  zakatDecision: true,
  totalScore: true,
  applicationScoresApplication: { select: { criteria: true } },
  updatedAt: true,
  project: { select: PROJECT_SELECT },
} satisfies Prisma.ApplicationSelect;

type Row = Prisma.ApplicationGetPayload<{ select: typeof ROW_SELECT }>;

type Person = {
  beneficiaryId: string | null;
  identityKind: 'nid' | 'birth_reg' | null;
  number: string | null;
  answers: Answer[];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const definitionKeys = (definition: FormDefinition) =>
  definition.sections.flatMap((s) => s.fields.map((f) => f.fieldKey));
const statusSchema = z.enum(APPLICATION_STATES);
const identityKindSchema = z.enum(['nid', 'birth_reg']).nullable();

/**
 * The applications of the core cycle (docs/architecture/WORKFLOW_ENGINE.md, section 3): a draft
 * is made on the project's published application form by a volunteer, a team member (under their
 * lead) or an official; the person comes from the number in the identity answer and never from an
 * id the client sends; a known person's identity answers are locked to the profile; the edits and
 * the deletion follow the state; every state change goes through the engine. A volunteer on the
 * blocklist reaches nothing.
 */
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: Env,
    private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly identity: BeneficiaryIdentityService,
    private readonly family: BeneficiaryFamilyService,
    private readonly nisab: NisabService,
    private readonly workflow: WorkflowEngine,
    private readonly submission: SubmissionWriter,
    private readonly scoring: ScoringService,
    private readonly unlocks: UnlocksService,
  ) {}

  async create(
    viewer: ApplicationViewer,
    projectId: string,
    body: ApplicationCreate,
  ): Promise<Replayable<ApplicationRead>> {
    if (body.projectId !== projectId)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'projectId', code: 'validation.failed' },
      ]);
    const actor = viewer.principal.userId;
    if (await this.blockedCaller(this.prisma, viewer.principal))
      throw new ApiError('permission.not_found', 404);
    const project = await this.reachedProject(viewer.principal, viewer.scope, projectId);
    const earlier = await this.earlier(viewer, projectId, body.clientUuid);
    if (earlier) return { replay: true, value: earlier };
    const version = await this.prisma.formVersion.findFirst({
      where: {
        id: body.formVersionId,
        status: 'published',
        form: { projectId, kind: 'beneficiary_application' },
      },
      select: { id: true },
    });
    if (!version) throw new ApiError('application.form_not_published', 422);
    const audience = this.audienceOf(viewer);
    const definition = await readDefinition(this.prisma, version.id, audience);
    const { checked, chain } = await this.checked(definition, body.answers, audience, true);
    const access = await this.access.load(actor);
    await this.gateLookup(viewer.principal, access, projectId, definition, checked.answers);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const owner = await this.ownerFor(tx, viewer.principal, projectId);
        // one draft of an owner at a time, so parallel creates cannot pass the limit together
        if (owner.ownerVolunteerId)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`application-owner:${projectId}:${owner.ownerVolunteerId}`}))`;
        const person = await this.resolvePerson(tx, definition, checked.answers);
        await this.assertOnePerProject(tx, projectId, person, null);
        await this.assertMobile(tx, actor, checked.standard, owner.ownerUserId);
        const id = uuidv7();
        await this.runCreateGuards(tx, viewer.principal, access, {
          id,
          projectId,
          formVersionId: version.id,
          beneficiaryId: person.beneficiaryId,
          ownerVolunteerId: owner.ownerVolunteerId,
          createdByUserId: actor,
          createdBy: actor,
          submittedBy: null,
          status: 'draft',
          zakatDecision: null,
          updatedAt: this.clock.now(),
          project: { ...project, approval: null },
        });
        await assertUploadsOwn(tx, actor, null, person.answers);
        const [regionLocationId, districtId, , unionId] = chain;
        await tx.application.create({
          data: {
            id,
            projectId,
            formVersionId: version.id,
            beneficiaryId: person.beneficiaryId,
            identityKind: person.identityKind,
            ownerVolunteerId: owner.ownerVolunteerId,
            createdByUserId: actor,
            status: 'draft',
            regionLocationId,
            districtId,
            unionId,
            clientUuid: body.clientUuid,
            clientCreatedAt: body.clientCreatedAt ? new Date(body.clientCreatedAt) : null,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await writeAnswers(tx, id, version.id, person.answers, actor);
        await this.audit.record(tx, {
          action: 'application.create',
          entityType: 'application',
          entityId: id,
          clientUuid: body.clientUuid,
          new: {
            projectId,
            status: 'draft',
            beneficiaryId: person.beneficiaryId,
            ownerVolunteerId: owner.ownerVolunteerId,
          },
        });
        return id;
      });
      return { replay: false, value: await this.read(viewer, access, id) };
    } catch (error) {
      if (isVolunteerMobileRefusal(error))
        throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
      if (!isUniqueViolation(error)) throw error;
      // the same client id arrived twice at once: the first one is the answer; otherwise the
      // person already has an application in the project
      const winner = await this.earlier(viewer, projectId, body.clientUuid);
      if (winner) return { replay: true, value: winner };
      throw new ApiError('beneficiary.already_applied', 409);
    }
  }

  /**
   * The project's published application form as the caller's audience sees it: what the new
   * application screen draws. The caller must reach the project with the create permission.
   */
  async applicationForm(viewer: ApplicationViewer, projectId: string) {
    await this.reachedProject(viewer.principal, viewer.scope, projectId);
    const version = await this.prisma.formVersion.findFirst({
      where: { status: 'published', form: { projectId, kind: 'beneficiary_application' } },
      select: VERSION_SELECT,
    });
    if (!version) throw new ApiError('application.form_not_published', 422);
    const definition = await readDefinition(this.prisma, version.id, this.audienceOf(viewer));
    return versionView(version, definition);
  }

  async get(viewer: ApplicationViewer, applicationId: string): Promise<ApplicationRead> {
    return this.readReached(viewer, { id: applicationId });
  }

  async getByNumber(viewer: ApplicationViewer, appNo: string): Promise<ApplicationRead> {
    return this.readReached(viewer, { appNo });
  }

  /**
   * Edits the answers in the state's permission (a draft by its volunteer or team member, a
   * pending one by the main volunteer, one under review by the official, whose changes are logged
   * field by field). A known person's identity answers stay the profile's; a draft whose number
   * now matches a profile binds to it.
   */
  async update(
    viewer: ApplicationViewer,
    applicationId: string,
    body: ApplicationUpdate,
    ifMatch: string | undefined,
  ): Promise<ApplicationRead> {
    const actor = viewer.principal.userId;
    const access = await this.access.load(actor);
    const row = await this.reachedRow(viewer.principal, access, applicationId, 'application.view');
    const permission = EDIT_PERMISSION[row.status];
    if (!permission) throw new ApiError('application.not_editable', 409);
    await this.assertMay(viewer.principal, access, permission, applicationId);
    assertIfMatch(ifMatch, row.updatedAt);
    const audience = this.audienceOf(viewer);
    const keys = new Set(
      definitionKeys(await readDefinition(this.prisma, row.formVersionId, audience)),
    );
    const definition = await readDefinition(this.prisma, row.formVersionId, audience);
    const previous = await readAnswers(
      this.prisma,
      applicationId,
      audience === 'official'
        ? definition
        : await readDefinition(this.prisma, row.formVersionId, 'official'),
    );
    const { checked, chain } = await this.checked(
      definition,
      body.answers,
      audience,
      row.status === 'draft',
      previous,
    );
    if (!row.beneficiaryId)
      await this.gateLookup(viewer.principal, access, row.projectId, definition, checked.answers);
    try {
      await this.prisma.$transaction(async (tx) => {
        // the version and the state are read again under the lock: two edits with the same
        // version, or an edit racing a submission, must not both land
        const [locked] = await tx.$queryRaw<{ status: string; updated_at: Date }[]>`
          SELECT status, updated_at FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
        if (!locked || locked.status !== row.status)
          throw new ApiError('application.not_editable', 409);
        assertIfMatch(ifMatch, locked.updated_at);
        // one read of every stored answer: the caller's audience is compared and rewritten, the
        // other audience's answers stay as they are
        const stored = await readAnswers(
          tx,
          applicationId,
          await readDefinition(tx, row.formVersionId, 'official'),
        );
        const before = stored.filter((a) => keys.has(a.fieldKey));
        const kept = stored.filter((a) => !keys.has(a.fieldKey));
        const person = await this.resolvePerson(tx, definition, checked.answers, row.beneficiaryId);
        await this.assertOnePerProject(tx, row.projectId, person, applicationId);
        const ownerUser = row.ownerVolunteerId
          ? (
              await tx.volunteer.findUnique({
                where: { id: row.ownerVolunteerId },
                select: { userId: true },
              })
            )?.userId
          : undefined;
        await this.assertMobile(tx, actor, checked.standard, ownerUser);
        await assertUploadsOwn(tx, actor, applicationId, person.answers);
        await writeAnswers(
          tx,
          applicationId,
          row.formVersionId,
          [...kept, ...person.answers],
          actor,
        );
        const [regionLocationId, districtId, , unionId] = chain;
        const now = this.clock.now();
        await tx.application.update({
          where: { id: applicationId },
          data: {
            beneficiaryId: person.beneficiaryId,
            identityKind: person.identityKind,
            regionLocationId,
            districtId,
            unionId,
            updatedAt: now,
            updatedBy: actor,
          },
        });
        if (SCORED_WHILE.includes(row.status)) await this.scoring.compute(tx, applicationId, actor);
        const changes = changedAnswers(before, person.answers);
        if (row.status === 'under_review' && changes.length)
          await tx.fieldChange.createMany({
            data: changes.map((c) => ({
              id: uuidv7(),
              entityType: 'application',
              entityId: applicationId,
              field: c.repeatIndex ? `${c.fieldKey}[${c.repeatIndex}]` : c.fieldKey,
              oldValue: (c.old ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              newValue: (c.new ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              kind: 'review_edit',
              createdBy: actor,
            })),
          });
        await this.audit.record(tx, {
          action: 'application.update',
          entityType: 'application',
          entityId: applicationId,
          old: { status: row.status },
          new: {
            status: row.status,
            changed: changes.map((c) => c.fieldKey),
            ...(person.beneficiaryId !== row.beneficiaryId
              ? { beneficiaryId: person.beneficiaryId }
              : {}),
          },
        });
      });
    } catch (error) {
      if (isVolunteerMobileRefusal(error))
        throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
      if (isUniqueViolation(error)) throw new ApiError('beneficiary.already_applied', 409);
      throw error;
    }
    return this.read(viewer, access, applicationId);
  }

  /** A workflow action through the engine, which decides the permission, the scope and the guards. */
  async act(
    viewer: ApplicationViewer,
    applicationId: string,
    action: ApplicationAction,
    body: ApplicationActionBody,
    ifMatch: string | undefined,
  ): Promise<ApplicationRead> {
    if (await this.blockedCaller(this.prisma, viewer.principal))
      throw new ApiError('permission.not_found', 404);
    // the zakat decision comes with its own step; a value nothing records is refused, not dropped
    if (body.zakatDecision !== undefined) throw new ApiError('workflow.action_not_built', 409);
    const verifying = action === 'verify_link' || action === 'verify_create';
    const misplaced = (path: string) =>
      new ApiError('validation.failed', 422, undefined, [{ path, code: 'validation.failed' }]);
    if (body.linkBeneficiaryId !== undefined && action !== 'verify_link')
      throw misplaced('linkBeneficiaryId');
    if (body.ownerVolunteerId !== undefined && !verifying) throw misplaced('ownerVolunteerId');
    if (action === 'verify_link' && !body.linkBeneficiaryId)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'linkBeneficiaryId', code: 'validation.required' },
      ]);
    // a submission binds the person with the move (a submitted application always has one) and
    // takes its number after it; a verification does the same once its own checks pass, and a
    // public entry never rewrites a known person's contact data
    const submit = action === 'submit';
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.workflow.transition(
          tx,
          viewer.principal,
          applicationId,
          action,
          { reason: body.reason, comment: body.comment, message: body.message },
          // the version the caller saw is required: the engine checks it once the permission and
          // the scope have passed, so a hidden application still answers not-found
          ifMatch ?? '',
          submit
            ? { beforeApply: (t, app) => this.submission.bindPerson(t, viewer.principal, app.id) }
            : verifying
              ? {
                  beforeApply: async (t, app) => {
                    const owner = await this.verified(t, viewer.principal, app.id, action, body);
                    return {
                      ...(owner ? { ownerVolunteerId: owner.volunteerId } : {}),
                      ...(await this.submission.bindPerson(t, viewer.principal, app.id, {
                        writeContact: false,
                        ownerUserId: owner?.userId,
                      })),
                    };
                  },
                }
              : {},
        );
        if (submit || verifying) await this.submission.number(tx, viewer.principal, applicationId);
      });
    } catch (error) {
      // the database's own refusals at commit: the volunteer's own mobile as the person's, and
      // another live application of the person in the project meanwhile
      if (isVolunteerMobileRefusal(error))
        throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
      if (isUniqueViolationOf(error, 'applications_project_id_beneficiary_id_key'))
        throw new ApiError('beneficiary.already_applied', 409);
      // two verifications made a profile for one new number at once: the later one links instead
      if (verifying && isUniqueViolation(error))
        throw new ApiError('application.verify_identity_exists', 409);
      throw error;
    }
    const access = await this.access.load(viewer.principal.userId);
    return this.read(viewer, access, applicationId);
  }

  /** The steps of the application as the caller's audience may read them. */
  async timeline(viewer: ApplicationViewer, applicationId: string) {
    await this.readReached(viewer, { id: applicationId });
    return readTimeline(this.prisma, applicationId, this.audienceOf(viewer));
  }

  /** The activities of the application, newest first, within the caller's scope. */
  async activities(
    viewer: ApplicationViewer,
    applicationId: string,
    query: { limit: number; cursor?: string; type?: string },
  ) {
    await this.readReached(viewer, { id: applicationId });
    const binding = `applications.activities|${viewer.principal.userId}|${applicationId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const fetched = await readActivities(this.prisma, applicationId, {
      limit: query.limit + 1,
      beforeId: cursor ? String(cursor.v[0]) : undefined,
      type: query.type,
    });
    return buildPage(fetched, {
      limit: query.limit,
      sort: [{ field: 'id', direction: 'desc' as const }],
      direction: 'next',
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
  }

  /** The change log of the answers, for the office (the route's permission says who). */
  async changes(
    viewer: ApplicationViewer,
    applicationId: string,
    query: { limit: number; cursor?: string },
  ) {
    if (await this.blockedCaller(this.prisma, viewer.principal))
      throw new ApiError('permission.not_found', 404);
    const row = await this.prisma.application.findFirst({
      where: { AND: [{ id: applicationId }, applicationWhere(viewer.scope)] },
      select: { id: true },
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    const binding = `applications.changes|${viewer.principal.userId}|${applicationId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const sort = [{ field: 'id', direction: 'desc' as const }];
    const fetched = await readChanges(this.prisma, applicationId, {
      limit: query.limit + 1,
      beforeId: cursor ? String(cursor.v[0]) : undefined,
    });
    return buildPage(fetched, {
      limit: query.limit,
      sort,
      direction: 'next',
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
  }

  /** The applications of a project the caller's scope reaches, newest first. */
  async list(
    viewer: ApplicationViewer,
    projectId: string,
    query: ApplicationFilter & PageQuery & PageNumberQuery,
  ) {
    const actor = viewer.principal.userId;
    const access = await this.access.load(actor);
    const projectScope = await this.access.scopeFor(
      viewer.principal,
      access,
      'application.view',
      'project',
    );
    await this.reachedProject(viewer.principal, projectScope, projectId);
    return this.page(viewer, `applications.list|${actor}|${projectId}`, { projectId }, query);
  }

  /**
   * The caller's own applications across their projects (a volunteer's "my applications"): the
   * ones their volunteer owns and the ones they created while the owner is still their team lead
   * there, whatever else their scope reaches.
   */
  async listMine(
    viewer: ApplicationViewer,
    query: ApplicationFilter & PageQuery & PageNumberQuery,
  ) {
    const userId = viewer.principal.userId;
    return this.page(
      viewer,
      `applications.mine|${userId}`,
      { OR: ownApplicationsWhere(userId, await teamLeadsOf(this.prisma, userId)) },
      query,
    );
  }

  private async page(
    viewer: ApplicationViewer,
    binding: string,
    base: Prisma.ApplicationWhereInput,
    query: ApplicationFilter & PageQuery & PageNumberQuery,
  ) {
    // the score is the office's: a volunteer can neither read it nor learn its order
    const byScore = query.sort === '-score';
    // a cursor belongs to the order it was made in, so one order never reads another's cursor
    const sortBinding = `${binding}|${byScore ? 'score' : (query.sort ?? 'id')}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, sortBinding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const offset = pageOffset(query);
    if (byScore && this.audienceOf(viewer) !== 'official')
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'sort', code: 'validation.option_unknown' },
      ]);
    const sort = byScore ? SCORE_SORT : parseSort(query.sort, LIST_SORT_FIELDS, DEFAULT_SORT);
    const blocked = await this.blockedCaller(this.prisma, viewer.principal);
    const filter: Prisma.ApplicationWhereInput = blocked
      ? { id: { in: [] } }
      : { AND: [base, applicationWhere(viewer.scope), this.filterOf(query)] };
    const now = this.clock.now();
    const { fetched, total } = await boundedRead(this.prisma, async (tx) => ({
      fetched: await tx.application.findMany({
        where: cursor
          ? { AND: [filter, byScore ? scoreKeyset(cursor) : keysetWhere(sort, cursor)] }
          : filter,
        orderBy: byScore ? scoreOrder(direction) : orderBy(sort, direction),
        skip: offset,
        take: query.limit + 1,
        select: ROW_SELECT,
      }),
      total: query.include === 'total' ? await tx.application.count({ where: filter }) : undefined,
    }));
    const { rows, meta } = buildPage(
      fetched.map((r) => this.summaryOf(r, now)),
      {
        limit: query.limit,
        sort,
        direction,
        hadCursor: Boolean(cursor) || Boolean(offset),
        secret: this.env.CURSOR_SECRET,
        binding: sortBinding,
        total,
      },
    );
    return { rows, meta };
  }

  private filterOf(query: ApplicationFilter): Prisma.ApplicationWhereInput {
    const and: Prisma.ApplicationWhereInput[] = [];
    const states = query.status
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    and.push(states?.length ? { status: { in: states } } : { status: { notIn: HIDDEN_STATES } });
    if (query.stage) and.push({ stage: query.stage });
    if (query.districtId) and.push({ districtId: query.districtId });
    if (query.unionId) and.push({ unionId: query.unionId });
    if (query.ownerVolunteerId) and.push({ ownerVolunteerId: query.ownerVolunteerId });
    if (query.flag) and.push({ flags: { has: query.flag } });
    if (query.submittedFrom) and.push({ submittedAt: { gte: new Date(query.submittedFrom) } });
    if (query.submittedTo)
      and.push({ submittedAt: { lt: new Date(new Date(query.submittedTo).getTime() + DAY_MS) } });
    if (query.q) {
      const term = query.q.trim();
      if (term)
        and.push({
          OR: [
            { appNo: term.toUpperCase() },
            { beneficiary: { name: { contains: literalContains(term), mode: 'insensitive' } } },
          ],
        });
    }
    return { AND: and };
  }

  private summaryOf(r: Row, now: Date): ApplicationSummary {
    return {
      id: r.id,
      appNo: r.appNo,
      projectId: r.projectId,
      beneficiaryId: r.beneficiaryId,
      beneficiaryName: r.beneficiary?.name ?? null,
      ownerVolunteerId: r.ownerVolunteerId,
      status: statusSchema.parse(r.status),
      stage: r.stage,
      outcome: r.outcome,
      flags: r.flags,
      totalScore: r.totalScore === null ? null : Number(r.totalScore),
      districtId: r.districtId,
      unionId: r.unionId,
      submittedAt: iso(r.submittedAt),
      waitingDays: Math.max(0, Math.floor((now.getTime() - r.updatedAt.getTime()) / DAY_MS)),
      etag: etagOf(r.updatedAt),
    };
  }

  private audienceOf(viewer: ApplicationViewer): FormAudience {
    return viewer.fieldClasses.has(OFFICIAL_SECTION) ? 'official' : 'volunteer';
  }

  private async checked(
    definition: FormDefinition,
    raw: readonly unknown[],
    audience: Audience,
    draft: boolean,
    previous: readonly Answer[] = [],
  ) {
    const today = isoDateInDhaka(this.clock.now());
    // a read-only answer keeps the value it was first given (a date stays the day it was set)
    const checked = checkAnswers(definition, raw, {
      audience,
      today,
      draft,
      previous,
      ...(await nisabOption(this.nisab, today)),
    });
    const chain = addressOf(checked.standard);
    if (!chain || !(await isAddressChain(this.prisma, chain)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'address', code: 'validation.address_incomplete' },
      ]);
    return { checked, chain };
  }

  /** The record an earlier create with this client id made on this project by this caller, if any. */
  private async earlier(
    viewer: ApplicationViewer,
    projectId: string,
    clientUuid: string,
  ): Promise<ApplicationRead | null> {
    const row = await this.prisma.application.findUnique({
      where: { clientUuid },
      select: { id: true, projectId: true, createdByUserId: true },
    });
    if (!row) return null;
    if (row.projectId !== projectId || row.createdByUserId !== viewer.principal.userId)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'clientUuid', code: 'validation.failed' },
      ]);
    // a create replayed after the application moved to another volunteer reads nothing
    const userId = viewer.principal.userId;
    const own = await this.prisma.application.count({
      where: {
        AND: [
          { id: row.id },
          { OR: ownApplicationsWhere(userId, await teamLeadsOf(this.prisma, userId)) },
        ],
      },
    });
    if (!own) throw new ApiError('permission.not_found', 404);
    const access = await this.access.load(userId);
    return this.read(viewer, access, row.id);
  }

  /**
   * A number that names a known person goes through the lookup of the beneficiary service, so an
   * application draft reveals no more than the lookup does: the same scope, the same daily limit
   * outside the caller's area, the same audit entry, and nothing for a blocked person.
   */
  private async gateLookup(
    principal: Principal,
    access: EffectiveAccess,
    projectId: string,
    definition: FormDefinition,
    answers: Answer[],
  ): Promise<void> {
    const field = fieldByColumn(definition, IDENTITY_COLUMN);
    const number = field ? textOf(answers, field.fieldKey) : null;
    if (!number || !IDENTITY_NUMBER.test(number)) return;
    const permission = 'beneficiary.lookup';
    if (!holdsPermission(permission, access.grants)) {
      this.access.denied(principal.userId, permission, 'project');
      throw new ApiError('permission.denied', 403);
    }
    const scope = await this.access.scopeFor(principal, access, permission, 'project');
    const kind = identityColumn(number);
    const found = await this.identity.lookup(
      { principal, scope },
      { projectId, ...(kind === 'nid' ? { nid: number } : { birthReg: number }) },
    );
    if (found.found && found.blocked) throw new ApiError('beneficiary.blocked', 409);
  }

  /** Whose application a draft is: the volunteer's own, a team member's lead's, nobody's for an official. */
  private async ownerFor(
    tx: Tx,
    principal: Principal,
    projectId: string,
  ): Promise<{ ownerVolunteerId: string | null; ownerUserId: string | undefined }> {
    if (principal.kind !== 'volunteer') return { ownerVolunteerId: null, ownerUserId: undefined };
    const own = await tx.volunteer.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!own) throw new ApiError('permission.not_found', 404);
    if (!principal.roles.includes(TEAM_MEMBER_ROLE))
      return { ownerVolunteerId: own.id, ownerUserId: principal.userId };
    const membership = await tx.volunteerTeam.findFirst({
      where: {
        projectId,
        memberVolunteerId: own.id,
        removedAt: null,
        consentStatus: 'accepted',
        leadVolunteer: {
          projectVolunteersVolunteer: { some: { ...WORKING_ASSIGNMENT, projectId } },
        },
      },
      select: { leadVolunteerId: true, leadVolunteer: { select: { userId: true } } },
    });
    if (!membership) throw new ApiError('application.team_lead_missing', 409);
    return {
      ownerVolunteerId: membership.leadVolunteerId,
      ownerUserId: membership.leadVolunteer.userId,
    };
  }

  /**
   * The person behind the number in the identity answer: a live profile binds the application and
   * locks the identity answers to its values; a blocked person is refused; no profile leaves the
   * number in the answer for the submission to create one. An application already bound keeps its
   * person: the number of its answer cannot name another.
   */
  private async resolvePerson(
    tx: Tx,
    definition: FormDefinition,
    answers: Answer[],
    boundTo: string | null = null,
  ): Promise<Person> {
    const field = fieldByColumn(definition, IDENTITY_COLUMN);
    const number = field ? textOf(answers, field.fieldKey) : null;
    const locked = (path: string) =>
      new ApiError('validation.failed', 422, undefined, [
        { path, code: 'beneficiary.locked_field' },
      ]);
    if (!number) {
      if (boundTo) throw locked(field!.fieldKey);
      return { beneficiaryId: null, identityKind: null, number: null, answers };
    }
    if (!IDENTITY_NUMBER.test(number))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: field!.fieldKey, code: 'beneficiary.identity_missing' },
      ]);
    const kind = identityColumn(number);
    const holder = await tx.beneficiary.findFirst({
      where: kind === 'nid' ? { nid: number } : { birthReg: number },
      select: { id: true, mergedIntoId: true },
    });
    const live = holder
      ? holder.mergedIntoId
        ? await this.identity.liveOf(tx, holder.id)
        : holder.id
      : null;
    if (boundTo && live !== boundTo) throw locked(field!.fieldKey);
    if (!live) return { beneficiaryId: null, identityKind: kind, number, answers };
    await this.identity.assertMayApply(tx, live);
    const profile = await tx.beneficiary.findUniqueOrThrow({
      where: { id: live },
      select: { nid: true, birthReg: true, name: true, fatherOrHusbandName: true },
    });
    const values: Record<(typeof LOCKED_COLUMNS)[number], string> = {
      [IDENTITY_COLUMN]: profile.nid ?? profile.birthReg ?? number,
      name: profile.name,
      father_or_husband_name: profile.fatherOrHusbandName,
    };
    const lockedKeys = new Map(
      LOCKED_COLUMNS.flatMap((column) => {
        const f = fieldByColumn(definition, column);
        return f ? [[f.fieldKey, values[column]] as const] : [];
      }),
    );
    const rest = answers.filter((a) => !lockedKeys.has(a.fieldKey));
    const own = [...lockedKeys].map(([fieldKey, v]) => ({
      fieldKey,
      repeatIndex: 0,
      value: { t: 'short_text' as const, v },
    }));
    return {
      beneficiaryId: live,
      identityKind: profile.nid ? 'nid' : 'birth_reg',
      number: values[IDENTITY_COLUMN],
      answers: [...rest, ...own],
    };
  }

  /**
   * One application per person per project: a known person may not have another live one (the
   * unique index holds it), and before the profile exists the same number may not be drafted
   * twice; the number is locked for the transaction, so two drafts at once cannot both pass.
   */
  private async assertOnePerProject(
    tx: Tx,
    projectId: string,
    person: Person,
    exceptId: string | null,
  ): Promise<void> {
    if (person.beneficiaryId) {
      const live = await tx.application.count({
        where: {
          projectId,
          beneficiaryId: person.beneficiaryId,
          status: { not: 'deleted' },
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
      });
      if (live > 0) throw new ApiError('beneficiary.already_applied', 409);
      return;
    }
    const number = person.number;
    if (!number) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`application-number:${projectId}:${number}`}))`;
    const [row] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
        FROM application_answers aa
        JOIN form_fields f ON f.id = aa.field_id
        JOIN applications a ON a.id = aa.application_id
       WHERE a.project_id = ${projectId}::uuid
         AND a.status <> 'deleted'
         AND a.id <> ${exceptId ?? '00000000-0000-0000-0000-000000000000'}::uuid
         AND f.standard_column = ${IDENTITY_COLUMN}
         AND aa.value ->> 'v' = ${number}`;
    if (Number(row?.n ?? 0) > 0) throw new ApiError('application.number_in_project', 409);
  }

  private async assertMobile(
    tx: Tx,
    actorId: string,
    standard: Record<string, unknown>,
    ownerUserId: string | undefined,
  ): Promise<void> {
    const mobile = standard.mobile;
    if (typeof mobile !== 'string' || !mobile) return;
    await this.identity.assertNotVolunteerMobile(tx, mobile, [
      actorId,
      ...(ownerUserId ? [ownerUserId] : []),
    ]);
  }

  private async runCreateGuards(
    tx: Tx,
    principal: Principal,
    access: EffectiveAccess,
    application: EngineApplication,
  ): Promise<void> {
    const ctx = new GuardContext(
      tx,
      application,
      { userId: principal.userId, kind: principal.kind, access },
      {},
      this.clock,
      'draft',
    );
    for (const name of CREATE_GUARDS)
      if ((await GUARDS[name](ctx)) !== true)
        throw new ApiError(`workflow.guard.${name.replace(/\./g, '_')}`, 409);
  }

  /**
   * The project, when the caller's project scope reaches it: a global, program, project or area
   * instance through the project filter; a SELF instance through the caller's own work on it (an
   * accepted assignment, a staff place, or a team whose lead works there). Not-found otherwise.
   */
  private async reachedProject(principal: Principal, scope: Scope, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: PROJECT_SELECT,
    });
    if (!project) throw new ApiError('permission.not_found', 404);
    const i = scope.instances;
    if (i.revokedProjectIds.includes(projectId)) throw new ApiError('permission.not_found', 404);
    const filtered = await this.prisma.project.count({
      where: { AND: [{ id: projectId }, projectWhere(scope)] },
    });
    if (filtered > 0) return project;
    if (i.self && (await this.worksOn(principal.userId, projectId))) return project;
    throw new ApiError('permission.not_found', 404);
  }

  private async worksOn(userId: string, projectId: string): Promise<boolean> {
    const [staff, assignment, member] = await Promise.all([
      this.prisma.projectStaff.count({ where: { projectId, userId, endedAt: null } }),
      this.prisma.projectVolunteer.count({
        where: { ...WORKING_ASSIGNMENT, projectId, volunteer: { userId } },
      }),
      this.prisma.volunteer.findUnique({ where: { userId }, select: { id: true } }),
    ]);
    if (staff + assignment > 0) return true;
    return member ? (await workingTeamProjects(this.prisma, member.id)).includes(projectId) : false;
  }

  /** A volunteer on the blocklist reaches no application. */
  private async blockedCaller(db: Tx | PrismaService, principal: Principal): Promise<boolean> {
    return principal.kind === 'volunteer' && isBlockedVolunteer(db, principal.userId);
  }

  /** The row the caller's scope reaches by id or number, or not-found. */
  private async readReached(
    viewer: ApplicationViewer,
    where: { id: string } | { appNo: string },
  ): Promise<ApplicationRead> {
    if (await this.blockedCaller(this.prisma, viewer.principal))
      throw new ApiError('permission.not_found', 404);
    const row = await this.prisma.application.findFirst({
      where: { AND: [where, applicationWhere(viewer.scope)] },
      select: { id: true },
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    const access = await this.access.load(viewer.principal.userId);
    return this.read(viewer, access, row.id);
  }

  /** The row, when the caller holds the permission with a scope that reaches it (404 otherwise). */
  private async reachedRow(
    principal: Principal,
    access: EffectiveAccess,
    applicationId: string,
    permission: string,
  ): Promise<Row> {
    if (await this.blockedCaller(this.prisma, principal))
      throw new ApiError('permission.not_found', 404);
    await this.assertMay(principal, access, permission, applicationId);
    return this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: ROW_SELECT,
    });
  }

  /** 403 without the permission, 404 when its scope misses the application. */
  private async assertMay(
    principal: Principal,
    access: EffectiveAccess,
    permission: string,
    applicationId: string,
  ): Promise<void> {
    await assertReachesApplication(this.access, principal, access, permission, applicationId);
  }

  /**
   * The checks of a verification, run once the engine has checked the caller: a link names the
   * live profile behind the entry's identity number, one the caller's identity scope reaches; a
   * new profile is made only when no profile holds the number; a chosen owner is an active,
   * unblocked volunteer of the project who accepted its rules and is under its limit (the limit
   * guard of the move ran before the owner was known), else the application stays the office's.
   */
  private async verified(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    action: 'verify_link' | 'verify_create',
    body: ApplicationActionBody,
  ): Promise<{ volunteerId: string; userId: string } | null> {
    const holder = await this.submission.identityHolder(tx, applicationId);
    if (action === 'verify_link') {
      if (!holder)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'linkBeneficiaryId', code: 'application.verify_no_profile' },
        ]);
      if (!(await this.identity.seesHolder(tx, principal, holder)))
        throw new ApiError('permission.not_found', 404);
      if ((await this.identity.liveOf(tx, body.linkBeneficiaryId!)) !== holder)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'linkBeneficiaryId', code: 'application.verify_other_person' },
        ]);
    } else if (holder) throw new ApiError('application.verify_identity_exists', 409);
    if (!body.ownerVolunteerId) return null;
    const { projectId, project } = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { projectId: true, project: { select: { perVolunteerLimit: true } } },
    });
    const [assignment, blocked] = await Promise.all([
      tx.projectVolunteer.findFirst({
        where: {
          ...WORKING_ASSIGNMENT,
          projectId,
          volunteerId: body.ownerVolunteerId,
          volunteer: { user: { state: 'active' } },
        },
        select: { volunteer: { select: { userId: true } } },
      }),
      tx.blocklist.count({
        where: { subjectType: 'volunteer', subjectId: body.ownerVolunteerId, active: true },
      }),
    ]);
    const unfit = (code: string) =>
      new ApiError('validation.failed', 422, undefined, [{ path: 'ownerVolunteerId', code }]);
    if (!assignment || blocked) throw unfit('application.verify_owner_unfit');
    if (project.perVolunteerLimit !== null) {
      const counts = await liveApplicationCounts(tx, [
        { projectId, ownerVolunteerId: body.ownerVolunteerId },
      ]);
      if (counts(projectId, body.ownerVolunteerId) >= project.perVolunteerLimit)
        throw unfit('application.verify_owner_full');
    }
    return { volunteerId: body.ownerVolunteerId, userId: assignment.volunteer.userId };
  }

  /** The record as the caller sees it. */
  private async read(
    viewer: ApplicationViewer,
    access: EffectiveAccess,
    applicationId: string,
  ): Promise<ApplicationRead> {
    const row = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: ROW_SELECT,
    });
    const audience = this.audienceOf(viewer);
    const definition = await readDefinition(this.prisma, row.formVersionId, audience);
    const [answers, warnings, availableActions, version] = await Promise.all([
      readAnswers(this.prisma, applicationId, definition),
      audience === 'official' && row.beneficiaryId
        ? this.family.matches(this.prisma, row.projectId, row.beneficiaryId)
        : [],
      this.availableActions(viewer.principal, access, row),
      this.prisma.formVersion.findUniqueOrThrow({
        where: { id: row.formVersionId },
        select: VERSION_SELECT,
      }),
    ]);
    return {
      application: {
        ...this.summaryOf(row, this.clock.now()),
        formVersionId: row.formVersionId,
        candidateBeneficiaryId: row.candidateBeneficiaryId,
        createdByUserId: row.createdByUserId,
        identityKind: identityKindSchema.parse(row.identityKind),
        rejectionMessage: row.rejectionMessage,
        answers: answers.map((a) => ({ ...a, repeatIndex: a.repeatIndex ?? 0 })),
        reviewedAt: iso(row.reviewedAt),
        approvedAt: iso(row.approvedAt),
        decisionComment: row.decisionComment,
        scoreItems: row.applicationScoresApplication
          ? scoreItemsOf(row.applicationScoresApplication.criteria)
          : null,
        zakat: row.nisabValue
          ? {
              nisabValue: row.nisabValue.toFixed(2),
              decision: row.zakatDecision as 'eligible' | 'not_eligible' | null,
            }
          : null,
        familyDuplicateWarnings: warnings,
        availableActions,
        decisionHints:
          audience === 'official' ? await this.decisionHints(applicationId, availableActions) : {},
        ...(await this.unlocks.forRecord(
          viewer.principal,
          access,
          applicationId,
          audience === 'official',
        )),
        form: versionView(version, definition),
      },
      updatedAt: row.updatedAt,
    };
  }

  /**
   * The comments each decision the caller may take now would ask for (a decision against the
   * score order, an approval in a full quota area), so the review screen asks before it sends.
   */
  private async decisionHints(
    applicationId: string,
    actions: readonly string[],
  ): Promise<Record<string, CommentReason[]>> {
    const hints: Record<string, CommentReason[]> = {};
    for (const action of DECISIONS)
      if (actions.includes(action)) {
        const reasons = await commentReasons(
          this.prisma,
          applicationId,
          APPLICATION_ACTIONS[action].to,
        );
        if (reasons.length) hints[action] = reasons;
      }
    return hints;
  }

  /**
   * The actions the caller may take now: each action of the table whose transition the project's
   * workflow allows from this state, under a permission the caller holds with a scope that
   * reaches the application. The guards are not run here; the engine runs them on the move.
   */
  private async availableActions(
    principal: Principal,
    access: EffectiveAccess,
    row: Row,
  ): Promise<string[]> {
    const definition: WorkflowDefinition = workflowDefinitionSchema.parse(
      row.project.workflowSnapshot ?? row.project.workflowDefinition.definition,
    );
    const reached = new Map<string, Promise<boolean>>();
    const reaches = (permission: string) => {
      if (!reached.has(permission))
        reached.set(
          permission,
          (async () => {
            if (!holdsPermission(permission, access.grants)) return false;
            const scope = await this.access.scopeFor(principal, access, permission, 'application');
            return this.access.reaches(scope, { applicationId: row.id });
          })(),
        );
      return reached.get(permission)!;
    };
    const actions: string[] = [];
    for (const [action, spec] of Object.entries(APPLICATION_ACTIONS)) {
      if ('later' in spec && spec.later) continue;
      if (!(spec.from as readonly string[]).includes(row.status)) continue;
      const transition = (definition.transitions ?? []).find(
        (t) =>
          t.to === spec.to &&
          (Array.isArray(t.from) ? t.from : [t.from]).includes(row.status) &&
          t.permission,
      );
      if (transition?.permission && (await reaches(transition.permission))) actions.push(action);
    }
    return actions;
  }
}
