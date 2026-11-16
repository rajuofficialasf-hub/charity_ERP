import {
  APPLICATION_ACTIONS,
  APPLICATION_STATES,
  type ApplicationAction,
  scoreCriteriaSchema,
  uuidv7,
  type WorkflowDefinition,
  workflowDefinitionSchema,
} from '@css/shared';
import {
  type Answer,
  type Audience,
  type FormDefinition,
  identityColumn,
  type OptionalIdentity,
  optionalIdentityOf,
} from '@css/shared/forms';
import { GUARDIAN_RELATION_COLUMN } from '@css/shared/beneficiaries';
import { isoDateInDhaka } from '@css/shared/format';
import { z } from 'zod';
import { type EffectiveAccess, WORKING_ASSIGNMENT } from '../access/effective.js';
import {
  applicationWhere,
  beneficiaryRowsProjectWhere,
  holdsPermission,
  ownApplicationsWhere,
  type Scope,
  teamLeadsOf,
} from '../access/scope.js';
import type { AccessService, RequestAccess } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import { boundedRead } from '../core/bounded-read.js';
import type { Clock } from '../core/clock.js';
import {
  isUniqueViolation,
  isUniqueViolationOf,
  isVolunteerMobileRefusal,
} from '../core/db-errors.js';
import { assertIfMatch, etagOf } from '../core/etag.js';
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
} from '../core/pagination.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { literalContains } from '../core/search.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { BeneficiaryFamilyService } from '../services/beneficiary-family.js';
import type { BeneficiaryIdentityService } from '../services/beneficiary-identity.js';
import {
  type BeneficiaryMatchService,
  MATCH_NOT_OPEN,
  PICK_INVALID,
  PICK_NUMBER_CONFLICT,
  type PickedPerson,
} from '../services/beneficiary-match.js';
import { IDENTITY_RULES_SELECT, identityRulesOf } from '../services/project-identity-rules.js';
import {
  helpView,
  lockPeople,
  personApplications,
  personApplicationsWhere,
  visibleProjects,
} from '../services/help-history.js';
import { type FormAudience, readDefinition, versionView } from '../services/forms.js';
import { isAddressChain } from '../services/locations.js';
import type { NisabService } from '../services/nisab.js';
import { assertReachesApplication, isBlockedVolunteer, reachesProject } from './callers.js';
import { liveApplicationCounts } from './limit.js';
import type { MediaReferralsService } from '../services/media-referrals.js';
import type { UnlocksService } from './unlocks.js';
import type { ScoringService } from './scoring.js';
import { type CommentReason, commentReasons } from './decision-rules.js';
import { NO_PERSON_SIGNALS, type PersonSignals } from './person-signals.js';
import type { Replayable } from '../services/uploads.js';
import type { WorkflowEngine } from '../workflow/engine.js';
import { type EngineApplication, GuardContext, GUARDS } from '../workflow/guards.js';
import { pendingSlotsOf, slotParts } from './pending-photos.js';
import { lateSync, staleVersion } from '../sync/rules.js';
import { namesMatch } from '@css/shared/sync';
import { type BuiltGuard, isBuiltGuard } from '../workflow/registry.js';
import { readActivities } from './activities.js';
import { readChanges, readTimeline } from './history.js';
import { BlockedNamesakeMatch, standardOf, type SubmissionWriter } from './submission.js';
import {
  addressOf,
  assertUploadsOwn,
  changedAnswers,
  checkAnswers,
  fieldByColumn,
  IDENTITY_COLUMN,
  identityNumberIn,
  nisabOption,
  readAnswers,
  textOf,
  typedName,
  withheldFields,
  writeAnswers,
} from './answers.js';
import {
  type ApplicationActionBody,
  type ApplicationCreate,
  type ApplicationFilter,
  type ApplicationSummary,
  type ApplicationUpdate,
  type ApplicationView,
  APPLICATION_HISTORY,
  BENEFICIARY_CONTACT,
  BENEFICIARY_NID,
  BLOCKED_NAME_MATCH,
  OFFICIAL_SECTION,
} from './view.js';

export interface ApplicationViewer {
  principal: Principal;
  /** The route's scope: the applications the caller reaches, or the projects for a create. */
  scope: Scope;
  fieldClasses: ReadonlySet<string>;
}

/** What an offline record adds to a write: the photo slots the phone still holds, and the sync rules. */
export interface WriteOptions {
  pendingPhotos?: string[];
  /**
   * The record came through the offline sync (docs/architecture/OFFLINE_SYNC.md "Conflict rules at
   * sync"): the device time of its making, moved onto the server's clock, decides a late or a
   * stale record, and a known number under another name waits for the office instead of linking.
   */
  sync?: { createdAt: Date };
  /** The phone's edit won over a later server edit of the draft: what lost goes on record with the write. */
  conflict?: LastWriteConflict;
}

export interface LastWriteConflict {
  clientUpdatedAt: string;
  serverUpdatedAt: string;
  serverAnswers: Prisma.InputJsonValue;
}

/** What a read answers, with the version the next write carries back in If-Match. */
export interface ApplicationRead {
  application: ApplicationView;
  updatedAt: Date;
}

/**
 * The permission an edit needs in each state (docs/architecture/WORKFLOW_ENGINE.md, "Common
 * application cycle").
 */
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
  ...IDENTITY_RULES_SELECT,
} satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

/** The project as the guards read it, with its identity rules from its own stored settings. */
const guardedProject = (project: ProjectRow) => ({
  ...project,
  approval: null,
  identityRules: identityRulesOf(project),
});

const ROW_SELECT = {
  id: true,
  appNo: true,
  projectId: true,
  formVersionId: true,
  beneficiaryId: true,
  // the numbers and the mobile only say whether the profile has them; they never leave here.
  // The relation of the father's or husband's name leaves on the record, under its class
  beneficiary: {
    select: { name: true, nid: true, birthReg: true, mobile: true, guardianRelationCode: true },
  },
  applicantName: true,
  candidateBeneficiaryId: true,
  ownerVolunteerId: true,
  createdByUserId: true,
  createdBy: true,
  submittedBy: true,
  status: true,
  stage: true,
  outcome: true,
  flags: true,
  pendingPhotos: true,
  clientCreatedAt: true,
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

/** More own applications than a volunteer can have: a safety cap on the id list of a snapshot. */
const OWN_IDS_MAX = 10_000;

type Person = {
  beneficiaryId: string | null;
  identityKind: 'nid' | 'birth_reg' | 'none' | null;
  number: string | null;
  answers: Answer[];
  /**
   * The profile the office compares the person with, the application unbound until then: the
   * number's holder when the typed names did not match it (a sync record), or the person of an
   * expired pick token.
   */
  candidate?: string | null;
  /**
   * An identity number the answers of a person bound without a document carry and no profile
   * holds: it stays in the application, and only one application of the project may carry it.
   */
  looseNumber?: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const definitionKeys = (definition: FormDefinition) =>
  definition.sections.flatMap((s) => s.fields.map((f) => f.fieldKey));
const statusSchema = z.enum(APPLICATION_STATES);
const identityKindSchema = z.enum(['nid', 'birth_reg', 'none']).nullable();

/**
 * The applications of the core cycle: a draft is made on the project's published application form
 * by a volunteer, a team member (under their lead) or an official; the person comes from the number
 * in the identity answer and never from an id the client sends; a known person's identity answers
 * are locked to the profile; the edits and the deletion follow the state; every state change goes
 * through the engine. A volunteer on the blocklist reaches nothing.
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
    private readonly media: MediaReferralsService,
    private readonly signals: PersonSignals,
    private readonly match: BeneficiaryMatchService,
  ) {}

  async create(
    viewer: ApplicationViewer,
    projectId: string,
    body: ApplicationCreate,
    options: WriteOptions = {},
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
    const version = await this.versionFor(projectId, body.formVersionId, options.sync);
    const held: string[] = [...version.flags];
    // a record made while the window was open and synced after it closed waits for the office
    if (options.sync && lateSync(options.sync.createdAt, this.clock.now(), project.applyTo))
      held.push('late_sync');
    const audience = this.audienceOf(viewer);
    const definition = await readDefinition(this.prisma, version.id, audience);
    const rules = identityRulesOf(project);
    const { checked, chain } = await this.checked(
      definition,
      body.answers,
      audience,
      true,
      optionalIdentityOf(rules, audience),
    );
    const access = await this.access.load(actor);
    // a person picked from the name lookup: only where the project lets the document stay empty,
    // and only with the token that lookup gave this caller here
    if (body.pickToken && rules.document !== 'optional') throw new ApiError(MATCH_NOT_OPEN, 422);
    const picked = body.pickToken
      ? this.match.pickedPerson(viewer.principal, projectId, body.pickToken)
      : null;
    await this.gateLookup(viewer.principal, access, projectId, definition, checked.answers);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const owner = await this.ownerFor(tx, viewer.principal, projectId);
        // one draft of an owner at a time, so parallel creates cannot pass the limit together
        if (owner.ownerVolunteerId)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`application-owner:${projectId}:${owner.ownerVolunteerId}`}))`;
        const person = picked
          ? await this.pickedPerson(tx, definition, checked.answers, picked)
          : await this.resolvePerson(tx, definition, checked.answers, null, {
              nameMatch: options.sync !== undefined,
            });
        if (person.candidate) held.push('existing_identity');
        // an entry that waits for the office anyway says so when its person, for whom a
        // verification would make a new profile, looks like a blocked one
        const namesake =
          held.length && !person.beneficiaryId && !person.candidate
            ? await this.submission.blockedLookalike(tx, checked.standard, rules.document)
            : null;
        if (namesake) held.push(BLOCKED_NAME_MATCH);
        const candidate = person.candidate ?? namesake;
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
          pendingPhotos: options.pendingPhotos ?? [],
          flags: held,
          clientCreatedAt: options.sync?.createdAt ?? null,
          project: guardedProject(project),
        });
        const status = held.length ? 'needs_verification' : 'draft';
        await assertUploadsOwn(tx, actor, null, person.answers);
        const [regionLocationId, districtId, , unionId] = chain;
        await tx.application.create({
          data: {
            id,
            projectId,
            formVersionId: version.id,
            beneficiaryId: person.beneficiaryId,
            candidateBeneficiaryId: candidate,
            // an entry held at its creation is named by what was typed until the office links it
            applicantName: held.length ? typedName(checked.standard) : null,
            identityKind: person.identityKind,
            ownerVolunteerId: owner.ownerVolunteerId,
            createdByUserId: actor,
            status,
            flags: held,
            ...(held.length ? { submittedAt: this.clock.now() } : {}),
            regionLocationId,
            districtId,
            unionId,
            clientUuid: body.clientUuid,
            clientCreatedAt: body.clientCreatedAt ? new Date(body.clientCreatedAt) : null,
            pendingPhotos: options.pendingPhotos ?? [],
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
            status,
            flags: held,
            beneficiaryId: person.beneficiaryId,
            candidateBeneficiaryId: candidate,
            ownerVolunteerId: owner.ownerVolunteerId,
            // how the person was found: picked from the name lookup, or the lookup was left out
            // on a phone without network, so the office compares the person at the send; an
            // expired pick binds nobody and the office compares the person it named
            ...(picked ? { pickedByName: true } : {}),
            ...(picked?.expired ? { pickExpired: true } : {}),
            ...(body.nameLookupSkipped ? { nameLookupSkipped: true } : {}),
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
    options: WriteOptions = {},
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
      // the rule of the project as it stands now, never one the request or the draft carries
      optionalIdentityOf(identityRulesOf(row.project), audience),
      previous,
    );
    if (!row.beneficiaryId)
      await this.gateLookup(viewer.principal, access, row.projectId, definition, checked.answers);
    try {
      await this.prisma.$transaction(async (tx) => {
        // the version and the state are read again under the lock: two edits with the same
        // version, or an edit racing a submission, must not both land; the person first, as every
        // writer of a person's applications takes them (`lockPeople`)
        if (row.beneficiaryId) await lockPeople(tx, [row.beneficiaryId]);
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
        const person = await this.resolvePerson(
          tx,
          definition,
          checked.answers,
          row.beneficiaryId,
          {
            // also one an official completed with its document later: its answers still carry no
            // number, and the volunteer who edits it need not know the one the office added
            boundWithoutNumber:
              row.identityKind === 'none' ||
              (row.beneficiaryId !== null && !identityNumberIn(definition, before)),
            boundKind: row.identityKind as Person['identityKind'],
            keptNumber: identityNumberIn(definition, before),
          },
        );
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
            ...(options.pendingPhotos
              ? {
                  pendingPhotos: await mergedSlots(
                    tx,
                    applicationId,
                    options.pendingPhotos,
                    person.answers,
                  ),
                }
              : {}),
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
        if (options.conflict)
          await this.audit.record(tx, {
            action: 'sync.conflict_last_write',
            entityType: 'application',
            entityId: applicationId,
            new: { kept: 'client', ...options.conflict },
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

  /**
   * Holds a draft for the office instead of submitting it: a send made while the window was open
   * that arrives after it closed (docs/architecture/OFFLINE_SYNC.md "Conflict rules at sync").
   * The send's permission and every guard of the submit move but the window run first, so only a
   * record that could have gone in time waits; the window is then judged at the send's device time.
   */
  async holdForVerification(
    viewer: ApplicationViewer,
    applicationId: string,
    ifMatch: string | undefined,
    flags: readonly string[],
    sentAt: Date,
  ): Promise<ApplicationRead> {
    const held = await this.hold(viewer, applicationId, ifMatch, flags, sentAt);
    // a caller's own flag always holds
    if (!held) throw new ApiError('application.not_editable', 409);
    return held;
  }

  /**
   * The hold itself: the draft waits for an official's verification with the given flags, and
   * with the blocked profile its new person looks like as its candidate. Whether the person was
   * compared with the block list is read from the flag: a send abandoned for such a match hands
   * the flag and the matched profile in, and every other entry is compared here. The send's
   * permission and every guard of the submit move run first (the window only for a send that is
   * not a late one), so a record waits only where it could have been sent. Null when there is
   * nothing to hold it for, and nothing is written then.
   */
  private async hold(
    viewer: ApplicationViewer,
    applicationId: string,
    ifMatch: string | undefined,
    flags: readonly string[],
    sentAt: Date,
    /** The blocked profile a send was abandoned for; given with its flag. */
    matched?: string,
  ): Promise<ApplicationRead | null> {
    const actor = viewer.principal.userId;
    const access = await this.access.load(actor);
    const row = await this.reachedRow(viewer.principal, access, applicationId, 'application.view');
    if (row.status !== 'draft') throw new ApiError('application.not_editable', 409);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: row.projectId },
      select: PROJECT_SELECT,
    });
    const definition = workflowDefinitionSchema.parse(
      project.workflowSnapshot ?? project.workflowDefinition.definition,
    );
    const submit = (definition.transitions ?? []).find(
      (t) => t.from === 'draft' && t.to === 'submitted',
    );
    if (!submit?.permission) throw new ApiError('workflow.transition_not_allowed', 409);
    await this.assertMay(viewer.principal, access, submit.permission, applicationId);
    assertIfMatch(ifMatch, row.updatedAt);
    const now = this.clock.now();
    // a draft made online carries no device time: the send's stands for it
    const madeAt = row.clientCreatedAt ?? sentAt;
    const late = flags.includes('late_sync');
    const done = await this.prisma.$transaction(async (tx) => {
      // the entry waits without a profile: the lists name it by the typed name meanwhile
      const { standard } = await standardOf(tx, applicationId, row.formVersionId);
      const compared = [...row.flags, ...flags].includes(BLOCKED_NAME_MATCH);
      const namesake = compared
        ? (matched ?? null)
        : row.beneficiaryId
          ? null
          : await this.submission.blockedLookalike(tx, standard, identityRulesOf(project).document);
      const held = [
        ...new Set([...row.flags, ...flags, ...(namesake ? [BLOCKED_NAME_MATCH] : [])]),
      ];
      if (!held.length) return false;
      await this.runGuards(
        tx,
        viewer.principal,
        access,
        {
          id: row.id,
          projectId: row.projectId,
          formVersionId: row.formVersionId,
          beneficiaryId: row.beneficiaryId,
          ownerVolunteerId: row.ownerVolunteerId,
          createdByUserId: row.createdByUserId,
          createdBy: row.createdBy,
          submittedBy: row.submittedBy,
          status: row.status,
          zakatDecision: row.zakatDecision,
          updatedAt: row.updatedAt,
          pendingPhotos: row.pendingPhotos,
          flags: held,
          clientCreatedAt: madeAt,
          project: guardedProject(project),
        },
        // a late send was made inside the window; every other one is judged by the window now
        (submit.guards ?? []).filter(isBuiltGuard).filter((g) => !late || g !== 'deadline.open'),
        'submitted',
      );
      await tx.application.update({
        where: { id: applicationId },
        data: {
          status: 'needs_verification',
          applicantName: typedName(standard),
          flags: held,
          ...(namesake ? { candidateBeneficiaryId: namesake } : {}),
          clientCreatedAt: madeAt,
          submittedAt: now,
          updatedAt: now,
          updatedBy: actor,
        },
      });
      await this.audit.record(tx, {
        action: 'application.held_for_verification',
        entityType: 'application',
        entityId: applicationId,
        old: { status: row.status },
        new: {
          status: 'needs_verification',
          flags: held,
          sentAt: sentAt.toISOString(),
          ...(namesake ? { candidateBeneficiaryId: namesake } : {}),
        },
      });
      return true;
    });
    return done ? this.read(viewer, access, applicationId) : null;
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
    // a pull of one chosen application is the waitlist's own step: it needs the waitlist
    // permission besides the approval its transition asks for (permissions.yaml)
    if (action === 'pull_from_waitlist') {
      const access = await this.access.load(viewer.principal.userId);
      if (!holdsPermission('application.waitlist', access.grants)) {
        this.access.denied(viewer.principal.userId, 'application.waitlist', 'application');
        throw new ApiError('permission.denied', 403);
      }
    }
    try {
      await this.move(viewer, applicationId, action, body, ifMatch);
    } catch (error) {
      if (!(error instanceof BlockedNamesakeMatch)) throw error;
      // an official was about to make a profile for an entry that waits for another reason, and
      // its person looks like a blocked one. Nothing of the move stays; the entry keeps waiting,
      // now with the matched profile to compare, and the official is told to compare first
      if (action === 'verify_create') {
        await this.markBlockedMatch(viewer.principal, applicationId, error.beneficiaryId);
        throw new ApiError('application.verify_blocked_match', 409);
      }
      // the send would have made a profile for a person who looks like a blocked one. Its
      // transaction has rolled back, so nothing of it stays; the entry waits for an official
      // instead, under the send's own permission and guards, with the matched profile to compare
      const held = await this.hold(
        viewer,
        applicationId,
        ifMatch ?? '',
        [BLOCKED_NAME_MATCH],
        this.clock.now(),
        error.beneficiaryId,
      );
      // the flag always holds
      if (!held) throw new ApiError('application.not_editable', 409);
      return held;
    }
    const access = await this.access.load(viewer.principal.userId);
    return this.read(viewer, access, applicationId);
  }

  /**
   * An entry that waits for verification gains the flag of a person who looks like a blocked one
   * and that profile as its candidate. The caller has passed the verification's own permission,
   * scope and version check inside the move that found the match; an entry that left the queue
   * meanwhile, or carries the flag already, is left as it is.
   */
  private async markBlockedMatch(
    principal: Principal,
    applicationId: string,
    beneficiaryId: string,
  ): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      // one writer of the entry's flags at a time
      const [row] = await tx.$queryRaw<{ status: string; flags: string[] }[]>`
        SELECT status, flags FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
      if (row?.status !== 'needs_verification' || row.flags.includes(BLOCKED_NAME_MATCH)) return;
      const flags = [...row.flags, BLOCKED_NAME_MATCH];
      await tx.application.update({
        where: { id: applicationId },
        data: {
          flags,
          candidateBeneficiaryId: beneficiaryId,
          updatedAt: now,
          updatedBy: principal.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'application.blocked_match_found',
        entityType: 'application',
        entityId: applicationId,
        old: { flags: row.flags },
        new: { flags, candidateBeneficiaryId: beneficiaryId },
      });
    });
  }

  /**
   * The move of an action in one transaction. A submission binds the person with the move (a
   * submitted application always has one) and takes its number after it; a verification does the
   * same once its own checks pass, and a public entry never rewrites a known person's contact
   * data. A move whose new person looks like a blocked one raises `BlockedNamesakeMatch` out of
   * the transaction: a send always, a verification unless the entry already carries the flag of
   * that match, which says the official has seen it and decides it is another person.
   */
  private async move(
    viewer: ApplicationViewer,
    applicationId: string,
    action: ApplicationAction,
    body: ApplicationActionBody,
    ifMatch: string | undefined,
  ): Promise<void> {
    const submit = action === 'submit';
    const verifying = action === 'verify_link' || action === 'verify_create';
    try {
      await this.prisma.$transaction(async (tx) => {
        // the decisions of a project run one after another, as the pulls do, so the score order
        // and a full quota are read as the last decision left them
        if ((DECISIONS as readonly string[]).includes(action)) {
          const row = await tx.application.findUnique({
            where: { id: applicationId },
            select: { projectId: true },
          });
          if (row)
            await tx.$queryRaw`SELECT 1 AS held FROM pg_advisory_xact_lock(hashtextextended(${`waitlist:${row.projectId}`}, 0))`;
        }
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
            ? {
                beforeApply: (t, app, movedAt) =>
                  this.submission.bindPerson(t, viewer.principal, app.id, movedAt),
              }
            : verifying
              ? {
                  beforeApply: async (t, app, movedAt) => {
                    const { owner, linkBeneficiaryId } = await this.verified(
                      t,
                      viewer.principal,
                      app.id,
                      action,
                      body,
                    );
                    return {
                      ...(owner ? { ownerVolunteerId: owner.volunteerId } : {}),
                      ...(await this.submission.bindPerson(t, viewer.principal, app.id, movedAt, {
                        writeContact: false,
                        ownerUserId: owner?.userId,
                        linkBeneficiaryId,
                        // the official has seen the match only where the entry shows it
                        compared: (app.flags ?? []).includes(BLOCKED_NAME_MATCH),
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
   * The query of a project's list as `list` reads it, for an export: the same reach of the
   * project, the same filter inside the caller's scope and the same order, built with the caller's
   * access of this moment. A blocked caller's query matches nothing, as the list shows nothing.
   */
  async listQuery(
    viewer: ApplicationViewer,
    projectId: string,
    query: ApplicationFilter & { sort?: string },
    loaded?: RequestAccess,
  ): Promise<{ where: Prisma.ApplicationWhereInput; byScore: boolean }> {
    // the caller's access of the same moment as its other checks, when it has it already
    const access = loaded ?? (await this.access.load(viewer.principal.userId));
    const projectScope = await this.access.scopeFor(
      viewer.principal,
      access,
      'application.view',
      'project',
    );
    await this.reachedProject(viewer.principal, projectScope, projectId);
    const byScore = this.byScore(viewer, query.sort);
    return { where: await this.listFilter(viewer, { projectId }, query), byScore };
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

  /**
   * The caller's own applications changed at or after a time (all of them without one), oldest
   * change first and at most `limit`; `afterId` names the last row of the page before, and the
   * database positions the next page after it by its own stamp and id, so rows changed in the
   * same moment (a bulk review) page through too. With them come the ids of every own application
   * the server still lists, so the phone's copy drops what left (a transfer, a deletion). Both
   * reads see one snapshot of the database. A blocked volunteer has none.
   */
  async listMineSince(
    viewer: ApplicationViewer,
    window: { since?: Date; afterId?: string },
    limit: number,
  ): Promise<{ changed: ApplicationSummary[]; ids: string[]; hasMore: boolean }> {
    const userId = viewer.principal.userId;
    if (await this.blockedCaller(this.prisma, viewer.principal))
      return { changed: [], ids: [], hasMore: false };
    const own: Prisma.ApplicationWhereInput = {
      AND: [
        { OR: ownApplicationsWhere(userId, await teamLeadsOf(this.prisma, userId)) },
        applicationWhere(viewer.scope),
        { status: { not: 'deleted' } },
      ],
    };
    const now = this.clock.now();
    const [rows, ids] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        // at or after: the phone's time has milliseconds, the rows microseconds, so the first row
        // of a window may come again, never go missing
        where: window.since ? { AND: [own, { updatedAt: { gte: window.since } }] } : own,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        ...(window.afterId ? { cursor: { id: window.afterId }, skip: 1 } : {}),
        take: limit + 1,
        select: ROW_SELECT,
      }),
      this.prisma.application.findMany({
        where: own,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: OWN_IDS_MAX,
      }),
    ]);
    const hasMore = rows.length > limit;
    return {
      changed: rows.slice(0, limit).map((r) => this.summaryOf(r, now, viewer)),
      ids: ids.map((r) => r.id),
      hasMore,
    };
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
    this.byScore(viewer, query.sort);
    const sort = byScore ? SCORE_SORT : parseSort(query.sort, LIST_SORT_FIELDS, DEFAULT_SORT);
    const filter = await this.listFilter(viewer, base, query);
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
      fetched.map((r) => this.summaryOf(r, now, viewer)),
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

  /** Whether a list is read in the score order; that order is the office's alone. */
  private byScore(viewer: ApplicationViewer, sort: string | undefined): boolean {
    const byScore = sort === '-score';
    if (byScore && this.audienceOf(viewer) !== 'official')
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'sort', code: 'validation.option_unknown' },
      ]);
    return byScore;
  }

  /** The rows of a list: the base, inside the caller's scope, filtered; none for a blocked caller. */
  private async listFilter(
    viewer: ApplicationViewer,
    base: Prisma.ApplicationWhereInput,
    query: ApplicationFilter,
  ): Promise<Prisma.ApplicationWhereInput> {
    if (await this.blockedCaller(this.prisma, viewer.principal)) return { id: { in: [] } };
    return {
      AND: [
        base,
        applicationWhere(viewer.scope),
        this.filterOf(query, this.audienceOf(viewer) === 'official'),
      ],
    };
  }

  private filterOf(query: ApplicationFilter, official: boolean): Prisma.ApplicationWhereInput {
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
    // a flag only the office reads selects nothing for anyone else, so its filter tells nothing
    if (query.flag)
      and.push(
        official || !OFFICE_FLAGS.includes(query.flag)
          ? { flags: { has: query.flag } }
          : { id: { in: [] } },
      );
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

  /**
   * The row of a list. What only the office may know stays with the office: the flag of a match
   * with a blocked person; and whether the person's profile has an identity document or a mobile
   * is told only to a viewer who holds the class of that fact (`sees` adds the volunteer who
   * brought the application, on its record).
   */
  private summaryOf(
    r: Row,
    now: Date,
    viewer: ApplicationViewer,
    sees: { document?: boolean; contact?: boolean } = {},
  ): ApplicationSummary {
    const official = this.audienceOf(viewer) === 'official';
    const document = sees.document ?? viewer.fieldClasses.has(BENEFICIARY_NID);
    const contact = sees.contact ?? viewer.fieldClasses.has(BENEFICIARY_CONTACT);
    return {
      id: r.id,
      appNo: r.appNo,
      projectId: r.projectId,
      beneficiaryId: r.beneficiaryId,
      beneficiaryName: r.beneficiary?.name ?? r.applicantName ?? null,
      hasDocument:
        r.beneficiary && document
          ? r.beneficiary.nid !== null || r.beneficiary.birthReg !== null
          : null,
      hasMobile: r.beneficiary && contact ? r.beneficiary.mobile !== null : null,
      ownerVolunteerId: r.ownerVolunteerId,
      status: statusSchema.parse(r.status),
      stage: r.stage,
      outcome: r.outcome,
      flags: official ? r.flags : r.flags.filter((f) => !OFFICE_FLAGS.includes(f)),
      totalScore: r.totalScore === null ? null : Number(r.totalScore),
      districtId: r.districtId,
      unionId: r.unionId,
      submittedAt: iso(r.submittedAt),
      waitingDays: Math.max(0, Math.floor((now.getTime() - r.updatedAt.getTime()) / DAY_MS)),
      pendingPhotos: pendingSlotsOf(r.pendingPhotos).length,
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
    optionalIdentity: OptionalIdentity,
    previous: readonly Answer[] = [],
  ) {
    const today = isoDateInDhaka(this.clock.now());
    // a read-only answer keeps the value it was first given (a date stays the day it was set)
    const checked = checkAnswers(definition, raw, {
      audience,
      today,
      draft,
      optionalIdentity,
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
    const number = identityNumberIn(definition, answers);
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

  /**
   * The version a new record is written under: the published one; through sync also a retired one
   * the phone still had, kept as the record's own version, and flagged for the office when the
   * record was made after the newer version came.
   */
  private async versionFor(
    projectId: string,
    formVersionId: string,
    sync: WriteOptions['sync'],
  ): Promise<{ id: string; flags: string[] }> {
    const version = await this.prisma.formVersion.findFirst({
      where: { id: formVersionId, form: { projectId, kind: 'beneficiary_application' } },
      select: { id: true, status: true, formId: true },
    });
    if (!version) throw new ApiError('application.form_not_published', 422);
    if (version.status === 'published') return { id: version.id, flags: [] };
    if (!sync || version.status !== 'retired')
      throw new ApiError('application.form_not_published', 422);
    const successor = await this.prisma.formVersion.findFirst({
      where: { formId: version.formId, status: 'published' },
      select: { publishedAt: true },
    });
    const stale = staleVersion(sync.createdAt, successor?.publishedAt ?? null);
    return { id: version.id, flags: stale ? ['stale_form_version'] : [] };
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
   * person: the number of its answer cannot name another, and one bound without a number (a
   * person without a document) stays without one, with the names its profile holds.
   */
  private async resolvePerson(
    tx: Tx,
    definition: FormDefinition,
    answers: Answer[],
    boundTo: string | null = null,
    options: {
      nameMatch?: boolean;
      boundWithoutNumber?: boolean;
      /** The identity kind the bound application has now (a document an official added since). */
      boundKind?: Person['identityKind'];
      /** The number the stored answers already carry. */
      keptNumber?: string | null;
    } = {},
  ): Promise<Person> {
    const field = fieldByColumn(definition, IDENTITY_COLUMN);
    const number = identityNumberIn(definition, answers);
    const locked = (path: string) =>
      new ApiError('validation.failed', 422, undefined, [
        { path, code: 'beneficiary.locked_field' },
      ]);
    if (boundTo && options.boundWithoutNumber) {
      // a number is added to such a profile by an official who compared the two, never by an edit;
      // one the application already carries (given when its person was picked by name) stays in
      // its answers and never reaches the profile, and is still no other person's
      const profile = await tx.beneficiary.findUniqueOrThrow({
        where: { id: boundTo },
        select: { name: true, fatherOrHusbandName: true, nid: true, birthReg: true },
      });
      if (
        number &&
        number !== options.keptNumber &&
        number !== profile.nid &&
        number !== profile.birthReg
      )
        throw locked(field!.fieldKey);
      const looseNumber = await this.numberBeside(tx, definition, answers, boundTo);
      return {
        beneficiaryId: boundTo,
        identityKind: options.boundKind ?? 'none',
        number: null,
        looseNumber,
        answers: lockedTo(definition, answers, {
          name: profile.name,
          father_or_husband_name: profile.fatherOrHusbandName,
        }),
      };
    }
    if (!number) {
      if (boundTo) throw locked(field!.fieldKey);
      return { beneficiaryId: null, identityKind: null, number: null, answers };
    }
    if (!IDENTITY_NUMBER.test(number))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: field!.fieldKey, code: 'beneficiary.identity_missing' },
      ]);
    const kind = identityColumn(number);
    const live = await this.liveHolderOf(tx, number);
    if (boundTo && live !== boundTo) throw locked(field!.fieldKey);
    if (!live) return { beneficiaryId: null, identityKind: kind, number, answers };
    // the block refuses a new application only: an edit of one already bound to this person goes
    // on, and a draft of a blocked person is still refused when it is sent
    // (docs/BUSINESS_RULES.md, the blocklist rules)
    if (live !== boundTo) await this.identity.assertMayApply(tx, live);
    const profile = await tx.beneficiary.findUniqueOrThrow({
      where: { id: live },
      select: { nid: true, birthReg: true, name: true, fatherOrHusbandName: true },
    });
    // a record typed by hand offline: the names must be the profile's, else the office looks
    if (options.nameMatch && !boundTo) {
      const typed = (column: string) => {
        const f = fieldByColumn(definition, column);
        return f ? textOf(answers, f.fieldKey) : null;
      };
      if (
        !namesMatch(typed('name'), profile.name) ||
        !namesMatch(typed('father_or_husband_name'), profile.fatherOrHusbandName)
      )
        return { beneficiaryId: null, identityKind: kind, number, answers, candidate: live };
    }
    return {
      beneficiaryId: live,
      identityKind: profile.nid ? 'nid' : 'birth_reg',
      number,
      answers: lockedTo(definition, answers, {
        // the number the volunteer typed: a birth registration never turns into the profile's NID
        [IDENTITY_COLUMN]: number,
        name: profile.name,
        father_or_husband_name: profile.fatherOrHusbandName,
      }),
    };
  }

  /** The live profile that holds an identity number, following merges; null when none does. */
  private async liveHolderOf(tx: Tx, number: string): Promise<string | null> {
    const holder = await tx.beneficiary.findFirst({
      where: identityColumn(number) === 'nid' ? { nid: number } : { birthReg: number },
      select: { id: true, mergedIntoId: true },
    });
    if (!holder) return null;
    return holder.mergedIntoId ? this.identity.liveOf(tx, holder.id) : holder.id;
  }

  /**
   * The identity number typed beside a person bound or picked without a document. One another
   * live profile holds (a blocked one too) would put this person's application under another
   * person's number: 409. One the person's own profile holds is theirs. One nobody holds stays in
   * the application's answers and is answered as its loose number, never written onto the profile.
   */
  private async numberBeside(
    tx: Tx,
    definition: FormDefinition,
    answers: Answer[],
    personId: string,
  ): Promise<string | null> {
    const number = identityNumberIn(definition, answers);
    if (!number) return null;
    if (!IDENTITY_NUMBER.test(number))
      throw new ApiError('validation.failed', 422, undefined, [
        {
          path: fieldByColumn(definition, IDENTITY_COLUMN)!.fieldKey,
          code: 'beneficiary.identity_missing',
        },
      ]);
    const holder = await this.liveHolderOf(tx, number);
    if (holder && holder !== personId) throw new ApiError(PICK_NUMBER_CONFLICT, 409);
    return holder ? null : number;
  }

  /**
   * The person picked from the name lookup, followed to the profile kept by any merge since the
   * pick (422 when the token's profile is gone). Blocked people are refused as on every new
   * application. A good token binds the application at once, without a document, the name and the
   * father's or husband's name locked to the profile's, as a known person's are. An expired token
   * binds nobody: the application waits for the office with the person as its candidate, as an
   * entry whose number names a profile its typed names do not match. A number the answers carry
   * must be no other person's; it stays in them and is never written onto the profile: an official
   * attaches a document after comparing the two.
   */
  private async pickedPerson(
    tx: Tx,
    definition: FormDefinition,
    answers: Answer[],
    pick: PickedPerson,
  ): Promise<Person> {
    if (!(await this.identity.liveOf(tx, pick.beneficiaryId)))
      throw new ApiError(PICK_INVALID, 422);
    // the gate locks the merge chain, so the profile read after it stays the kept one
    await this.identity.assertMayApply(tx, pick.beneficiaryId);
    const beneficiaryId = await this.identity.liveOf(tx, pick.beneficiaryId);
    if (!beneficiaryId) throw new ApiError(PICK_INVALID, 422);
    const looseNumber = await this.numberBeside(tx, definition, answers, beneficiaryId);
    if (pick.expired) {
      const number = identityNumberIn(definition, answers);
      return {
        beneficiaryId: null,
        identityKind: number ? identityColumn(number) : null,
        number,
        answers,
        candidate: beneficiaryId,
      };
    }
    const profile = await tx.beneficiary.findUniqueOrThrow({
      where: { id: beneficiaryId },
      select: { name: true, fatherOrHusbandName: true },
    });
    return {
      beneficiaryId,
      identityKind: 'none',
      number: null,
      looseNumber,
      answers: lockedTo(definition, answers, {
        name: profile.name,
        father_or_husband_name: profile.fatherOrHusbandName,
      }),
    };
  }

  /**
   * One application per person per project: a known person may not have another live one (the
   * unique index holds it), and a number no profile holds may not be drafted twice, neither
   * before its profile exists nor beside a person picked without a document; the number is locked
   * for the transaction, so two drafts at once cannot both pass.
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
    }
    // a known person's number is theirs; a number nobody holds is once per project
    const number = person.beneficiaryId ? person.looseNumber : person.number;
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
    await this.runGuards(tx, principal, access, application, CREATE_GUARDS, 'draft');
  }

  /** The named built guards against the application, as the engine runs them for a move to `to`. */
  private async runGuards(
    tx: Tx,
    principal: Principal,
    access: EffectiveAccess,
    application: EngineApplication,
    names: readonly BuiltGuard[],
    to: string,
  ): Promise<void> {
    const ctx = new GuardContext(
      tx,
      application,
      { userId: principal.userId, kind: principal.kind, access },
      {},
      this.clock,
      to,
    );
    for (const name of names)
      if ((await GUARDS[name](ctx)) !== true)
        throw new ApiError(`workflow.guard.${name.replace(/\./g, '_')}`, 409);
  }

  /**
   * Whether the caller may edit the record in its state: the state's permission within the
   * caller's reach, and never for a blocked caller.
   */
  async mayEdit(
    viewer: ApplicationViewer,
    applicationId: string,
    status: string,
  ): Promise<boolean> {
    const permission = EDIT_PERMISSION[status];
    if (!permission) return false;
    if (await this.blockedCaller(this.prisma, viewer.principal)) return false;
    const access = await this.access.load(viewer.principal.userId);
    try {
      await this.assertMay(viewer.principal, access, permission, applicationId);
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return false;
      throw error;
    }
  }

  /**
   * The project, when the caller's project scope reaches it (`reachesProject`). Not-found
   * otherwise.
   */
  private async reachedProject(principal: Principal, scope: Scope, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: PROJECT_SELECT,
    });
    if (!project || !(await reachesProject(this.prisma, principal, scope, projectId)))
      throw new ApiError('permission.not_found', 404);
    return project;
  }

  /** A volunteer on the blocklist reaches no application. */
  /** Whether the caller is a volunteer on the blocklist, who no longer sees their applications. */
  isBlocked(principal: Principal): Promise<boolean> {
    return this.blockedCaller(this.prisma, principal);
  }

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
   * live profile behind the entry's identity number, or, for an entry without a number, the
   * profile the entry waits with as its candidate; either way one the caller's identity scope
   * reaches; a new profile is made only when no profile holds the number; a chosen owner is an
   * active, unblocked volunteer of the project who accepted its rules and is under its limit (the
   * limit guard of the move ran before the owner was known), else the application stays the
   * office's. Answers the owner and, for a link without a number, the profile to bind.
   */
  private async verified(
    tx: Tx,
    principal: Principal,
    applicationId: string,
    action: 'verify_link' | 'verify_create',
    body: ApplicationActionBody,
  ): Promise<{
    owner: { volunteerId: string; userId: string } | null;
    linkBeneficiaryId?: string;
  }> {
    const { number, holder } = await this.submission.identityHolder(tx, applicationId);
    let linkBeneficiaryId: string | undefined;
    if (action === 'verify_link') {
      const target = number ? holder : await this.candidateOf(tx, applicationId);
      if (!target)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'linkBeneficiaryId', code: 'application.verify_no_profile' },
        ]);
      if (!(await this.identity.seesHolder(tx, principal, target)))
        throw new ApiError('permission.not_found', 404);
      if ((await this.identity.liveOf(tx, body.linkBeneficiaryId!)) !== target)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'linkBeneficiaryId', code: 'application.verify_other_person' },
        ]);
      if (!number) linkBeneficiaryId = target;
    } else if (holder) throw new ApiError('application.verify_identity_exists', 409);
    if (!body.ownerVolunteerId) return { owner: null, linkBeneficiaryId };
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
      // the same lock as the owner's own creates, so two verifications never both take the last place
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`application-owner:${projectId}:${body.ownerVolunteerId}`}))`;
      const counts = await liveApplicationCounts(tx, [
        { projectId, ownerVolunteerId: body.ownerVolunteerId },
      ]);
      if (counts(projectId, body.ownerVolunteerId) >= project.perVolunteerLimit)
        throw unfit('application.verify_owner_full');
    }
    return {
      owner: { volunteerId: body.ownerVolunteerId, userId: assignment.volunteer.userId },
      linkBeneficiaryId,
    };
  }

  /** The live profile an entry waits with as its candidate, or null. */
  private async candidateOf(tx: Tx, applicationId: string): Promise<string | null> {
    const row = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { candidateBeneficiaryId: true },
    });
    return row.candidateBeneficiaryId ? this.identity.liveOf(tx, row.candidateBeneficiaryId) : null;
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
    const [read, warnings, signals, availableActions, version, mine] = await Promise.all([
      readAnswers(this.prisma, applicationId, definition),
      audience === 'official' && row.beneficiaryId
        ? this.family.matches(this.prisma, row.projectId, row.beneficiaryId)
        : [],
      audience === 'official' && row.beneficiaryId
        ? this.signals.forPerson(this.prisma, viewer.principal, access, row.beneficiaryId)
        : NO_PERSON_SIGNALS,
      this.availableActions(viewer.principal, access, row),
      this.prisma.formVersion.findUniqueOrThrow({
        where: { id: row.formVersionId },
        select: VERSION_SELECT,
      }),
      this.bringsIt(viewer.principal, row),
    ]);
    // Another volunteer on the project (a paid volunteer, a Local দায়ী) and the Procurement Team
    // read the application without the person's identity number and mobile unless their role holds
    // those classes (docs/BUSINESS_RULES.md, field-level protection); the volunteer who brings it
    // typed them and reads them.
    // whose number it is hides with the number, and every question of such a column hides
    const hidden = mine ? new Set<string>() : withheldFields(definition, viewer.fieldClasses);
    const answers = read.filter((a) => !hidden.has(a.fieldKey));
    // the volunteer who brings the application typed the number and the mobile, or left them out
    const seesDocument = mine || viewer.fieldClasses.has(BENEFICIARY_NID);
    const seesContact = mine || viewer.fieldClasses.has(BENEFICIARY_CONTACT);
    // ...but of the profile, only what the class gives: without it, the volunteer who brings the
    // application reads whether it carries a number or a mobile from what they typed, so a person
    // picked by name never tells them whether the profile holds a document or a mobile
    const typed = (has: boolean) => (row.beneficiary ? has : null);
    const mobileField = fieldByColumn(definition, 'mobile');
    const fromAnswers = {
      ...(mine && !viewer.fieldClasses.has(BENEFICIARY_NID)
        ? { hasDocument: typed(identityNumberIn(definition, read) !== null) }
        : {}),
      ...(mine && !viewer.fieldClasses.has(BENEFICIARY_CONTACT)
        ? { hasMobile: typed(!!mobileField && textOf(read, mobileField.fieldKey) !== null) }
        : {}),
    };
    const identityKind = identityKindSchema.parse(row.identityKind);
    // the profile a person without a document was compared with is the office's to know
    const blockedMatch = row.flags.includes(BLOCKED_NAME_MATCH);
    // whose name stands beside the person: the profile's, else this application's own answer
    const relationField = fieldByColumn(definition, GUARDIAN_RELATION_COLUMN);
    const relationAnswer = read.find((a) => a.fieldKey === relationField?.fieldKey)?.value;
    const guardianRelationCode =
      row.beneficiary?.guardianRelationCode ??
      (relationAnswer?.t === 'single_select' || relationAnswer?.t === 'radio'
        ? relationAnswer.v
        : null);
    return {
      application: {
        ...this.summaryOf(row, this.clock.now(), viewer, {
          document: seesDocument,
          contact: seesContact,
        }),
        ...fromAnswers,
        formVersionId: row.formVersionId,
        candidateBeneficiaryId:
          audience === 'official' || !blockedMatch ? row.candidateBeneficiaryId : null,
        createdByUserId: row.createdByUserId,
        clientCreatedAt: iso(row.clientCreatedAt),
        // that an application carries no document is told like the document itself
        identityKind: identityKind === 'none' && !seesDocument ? null : identityKind,
        guardianRelationCode,
        // the message for the volunteer reaches the one who brings it and the office, never the
        // other volunteers of the project
        rejectionMessage: audience === 'official' || mine ? row.rejectionMessage : null,
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
        ...signals,
        availableActions,
        decisionHints:
          audience === 'official' ? await this.decisionHints(applicationId, availableActions) : {},
        ...(await this.unlocks.forRecord(
          viewer.principal,
          access,
          applicationId,
          audience === 'official',
        )),
        ...(await this.media.forRecord(viewer.principal, access, {
          id: applicationId,
          status: row.status,
          beneficiaryId: row.beneficiaryId,
        })),
        mayAddIdentity: await this.mayAddIdentity(viewer, access, row, definition, read),
        helpedBefore: await this.helpedBefore(viewer, applicationId, row.beneficiaryId),
        form: versionView(version, definition),
      },
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Whether the office may add the identity number the application carries to its person's
   * profile, which has none (docs/BUSINESS_RULES.md, "Beneficiary identity and master"): an
   * official whose correction-approval scope and identity-number scope both reach the profile, as
   * the write itself asks.
   */
  private async mayAddIdentity(
    viewer: ApplicationViewer,
    access: EffectiveAccess,
    row: Row,
    definition: FormDefinition,
    answers: readonly Answer[],
  ): Promise<boolean> {
    if (this.audienceOf(viewer) !== 'official' || !viewer.fieldClasses.has(BENEFICIARY_NID))
      return false;
    if (!row.beneficiaryId || !row.beneficiary) return false;
    if (row.beneficiary.nid !== null || row.beneficiary.birthReg !== null) return false;
    if (identityNumberIn(definition, answers) === null) return false;
    const { add, nid } = await this.access.allowedOn(
      viewer.principal,
      access,
      {
        add: { permission: 'beneficiary.correction.approve', entity: 'beneficiary' },
        nid: { permission: 'beneficiary.view_nid', entity: 'beneficiary' },
      },
      { beneficiaryId: row.beneficiaryId },
    );
    return add && nid;
  }

  /**
   * How often the person was helped by their other applications (docs/BUSINESS_RULES.md,
   * "Beneficiary identity and master"), read live as the profile reads it: the same applications,
   * a merge's left-behind ones among them, and a project outside the caller's rows of a profile
   * counted but not named. Only for a caller
   * with the application history class; null before a person is bound.
   */
  private async helpedBefore(
    viewer: ApplicationViewer,
    applicationId: string,
    beneficiaryId: string | null,
  ): Promise<ApplicationView['helpedBefore']> {
    if (!beneficiaryId || !viewer.fieldClasses.has(APPLICATION_HISTORY)) return null;
    const others = (
      await personApplications(
        this.prisma,
        await personApplicationsWhere(this.prisma, beneficiaryId),
      )
    ).filter((a) => a.id !== applicationId);
    const visible = await visibleProjects(
      this.prisma,
      others,
      beneficiaryRowsProjectWhere(viewer.scope),
    );
    const year = Number(isoDateInDhaka(this.clock.now()).slice(0, 4));
    return helpView(others, visible, year);
  }

  /** Whether the caller brings the application: its main volunteer, or the user who created it. */
  private async bringsIt(
    principal: Principal,
    row: Pick<Row, 'ownerVolunteerId' | 'createdByUserId'>,
  ): Promise<boolean> {
    if (row.createdByUserId === principal.userId) return true;
    if (!row.ownerVolunteerId) return false;
    const owner = await this.prisma.volunteer.findUnique({
      where: { id: row.ownerVolunteerId },
      select: { userId: true },
    });
    return owner?.userId === principal.userId;
  }

  /**
   * The comments each decision the caller may take now would ask for (a decision against the
   * score order, an approval in a full quota area, an approval of a repeat the project holds), so
   * the review screen asks before it sends; the same functions the guards of the move read.
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

/** The flags only the office reads: a volunteer neither receives them nor filters by them. */
const OFFICE_FLAGS: readonly string[] = [BLOCKED_NAME_MATCH];

/** The answers with the questions of these identity columns set to the profile's own values. */
function lockedTo(
  definition: FormDefinition,
  answers: Answer[],
  values: Partial<Record<(typeof LOCKED_COLUMNS)[number], string>>,
): Answer[] {
  const lockedKeys = new Map(
    LOCKED_COLUMNS.flatMap((column) => {
      const f = fieldByColumn(definition, column);
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
      const value = values[column];
      return f && value !== undefined ? [[f.fieldKey, value] as const] : [];
    }),
  );
  const rest = answers.filter((a) => !lockedKeys.has(a.fieldKey));
  const own = [...lockedKeys].map(([fieldKey, v]) => ({
    fieldKey,
    repeatIndex: 0,
    value: { t: 'short_text' as const, v },
  }));
  return [...rest, ...own];
}

/**
 * The slots an edited record still waits for: the ones it names now, plus the earlier ones whose
 * question the edit did not answer with a real photo; a slot goes only when its photo arrives or
 * its question is answered.
 */
async function mergedSlots(
  tx: Tx,
  applicationId: string,
  named: readonly string[],
  answers: readonly Answer[],
): Promise<string[]> {
  const row = await tx.application.findUnique({
    where: { id: applicationId },
    select: { pendingPhotos: true },
  });
  const answered = new Set(
    answers
      .filter((a) => {
        const v = a.value as { t?: unknown; v?: unknown };
        return v && v.t === 'photo' && Array.isArray(v.v) && v.v.length > 0;
      })
      .map((a) => `${a.fieldKey}${a.repeatIndex ? `#${a.repeatIndex}` : ''}`),
  );
  const kept = pendingSlotsOf(row?.pendingPhotos).filter((slot) => {
    const { fieldKey, repeatIndex } = slotParts(slot);
    return !answered.has(`${fieldKey}${repeatIndex ? `#${repeatIndex}` : ''}`);
  });
  return [...new Set([...kept, ...named])];
}
