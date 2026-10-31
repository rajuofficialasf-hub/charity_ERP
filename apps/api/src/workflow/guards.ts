import { answerValueSchema } from '@css/shared';
import {
  pendingSlotsOf,
  photoFieldKeys,
  slotParts,
  slotPath,
} from '../applications/pending-photos';
import { type Answer, type FormDefinition, validate } from '@css/shared/forms';
import { isoDateInDhaka } from '@css/shared/format';
import type { EffectiveAccess } from '../access/effective';
import type { Clock } from '../core/clock';
import type { Tx } from '../core/prisma.service';
import { readDefinition } from '../services/forms';
import type { BuiltGuard } from './registry';
import { NOT_COUNTED_STATES } from '../applications/limit';
import { againstScore, type CommentReason, quotaFull } from '../applications/decision-rules';

/** The application a transition is about, with what the guards read of its project. */
export interface EngineApplication {
  id: string;
  projectId: string;
  formVersionId: string;
  beneficiaryId: string | null;
  ownerVolunteerId: string | null;
  createdByUserId: string | null;
  createdBy: string | null;
  submittedBy: string | null;
  status: string;
  zakatDecision: string | null;
  updatedAt: Date;
  /** The photo slots an offline record still waits for; each counts as answered. */
  pendingPhotos?: unknown;
  project: {
    status: string;
    applyFrom: Date | null;
    applyTo: Date | null;
    perVolunteerLimit: number | null;
    /**
     * The template's approval override, when this transition's permission is the one it names:
     * only a grant carrying the condition, or one the panel or a project gave, may make the move.
     */
    approval: { permission: string; condition: string } | null;
  };
}

export interface GuardInput {
  reason?: string;
  comment?: string;
  message?: string;
}

/** What a guard may read; the answers and the definition load once, on first use. */
export class GuardContext {
  private definitionCache?: Promise<FormDefinition>;
  private answersCache?: Promise<Answer[]>;

  constructor(
    readonly tx: Tx,
    readonly application: EngineApplication,
    readonly actor: { userId: string; kind: string; access: EffectiveAccess },
    readonly input: GuardInput,
    readonly clock: Clock,
    /** The state the move reaches. */
    readonly to: string,
  ) {}

  definition(): Promise<FormDefinition> {
    this.definitionCache ??= readDefinition(this.tx, this.application.formVersionId, 'official');
    return this.definitionCache;
  }

  answers(): Promise<Answer[]> {
    this.answersCache ??= this.tx.applicationAnswer
      .findMany({
        where: { applicationId: this.application.id },
        select: { repeatIndex: true, value: true, field: { select: { fieldKey: true } } },
      })
      .then((rows) =>
        // the stored value is parsed, not trusted: a row another writer shaped wrongly fails here
        rows.map((r) => ({
          fieldKey: r.field.fieldKey,
          repeatIndex: r.repeatIndex,
          value: answerValueSchema.parse(r.value),
        })),
      );
    return this.answersCache;
  }

  /**
   * The answers checked as the actor's audience sees the form: a volunteer's check reads the
   * volunteer-visible questions and their answers only, so an official's answers in the official
   * section neither fail nor count for them.
   */
  async validation() {
    const audience =
      this.actor.kind === 'volunteer' ? ('volunteer' as const) : ('official' as const);
    const definition =
      audience === 'official'
        ? await this.definition()
        : await readDefinition(this.tx, this.application.formVersionId, audience);
    const keys = new Set(definition.sections.flatMap((s) => s.fields.map((f) => f.fieldKey)));
    const answers = (await this.answers()).filter((a) => keys.has(a.fieldKey));
    const options = { audience, today: isoDateInDhaka(this.clock.now()), previous: answers };
    const result = validate(definition, answers, options);
    // a photo still on the phone is on its way: its slot is not a missing answer; only a photo
    // question of this form may be such a slot, in the path the validator reports it by
    const photos = photoFieldKeys(definition);
    const grouped = new Set(
      definition.sections.flatMap((s) =>
        s.fields.filter((f) => f.settings?.repeat?.group).map((f) => f.fieldKey),
      ),
    );
    const pending = new Set(
      pendingSlotsOf(this.application.pendingPhotos)
        .filter((slot) => photos.has(slotParts(slot).fieldKey))
        .map((slot) => slotPath(slot, grouped.has(slotParts(slot).fieldKey))),
    );
    if (result.ok || pending.size === 0) return result;
    const errors = result.errors.filter(
      (e) => !(e.code === 'validation.required' && pending.has(e.path)),
    );
    if (errors.length) return { ok: false, errors };
    // only the waiting photos were missing: the answers pass as a draft's do, with the computed values
    return validate(definition, answers, { ...options, draft: true });
  }
}

/**
 * What a guard answers: the move may go on (`true`), is refused (`false`), or may go on only with
 * a comment that says why (a decision against the score order, an approval in a full quota).
 */
export type GuardResult = boolean | { comment: CommentReason };
export type Guard = (ctx: GuardContext) => Promise<GuardResult>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const IDENTITY_NUMBER = /^(\d{10}|\d{13}|\d{17})$/;
const IDENTITY_COLUMN = 'nid_or_birth_reg';

/**
 * The number the identity question holds, read from its answer directly so a missing answer
 * elsewhere does not hide the identity's own refusal.
 */
async function identityNumber(ctx: GuardContext): Promise<string | null> {
  const definition = await ctx.definition();
  const field = definition.sections
    .flatMap((s) => s.fields)
    .find((f) => f.standardColumn === IDENTITY_COLUMN);
  if (!field) return null;
  const answer = (await ctx.answers()).find((a) => a.fieldKey === field.fieldKey);
  const value = (answer?.value as { v?: unknown } | undefined)?.v;
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * One function per built guard of the catalogue (docs/architecture/WORKFLOW_ENGINE.md, "Guard
 * catalogue"); each answers whether the move may happen and never changes anything.
 */
export const GUARDS: Record<BuiltGuard, Guard> = {
  'project.active': async (ctx) => ctx.application.project.status === 'active',
  'project.not_closed': async (ctx) =>
    !['closed', 'cancelled'].includes(ctx.application.project.status),
  // an unset date leaves that side open, as the public link reads the window
  'deadline.open': async (ctx) => {
    const today = isoDateInDhaka(ctx.clock.now());
    const from = day(ctx.application.project.applyFrom);
    const to = day(ctx.application.project.applyTo);
    return (from === null || from <= today) && (to === null || today <= to);
  },
  'limit.not_exceeded': async (ctx) => {
    const { ownerVolunteerId, projectId, id } = ctx.application;
    const limit = ctx.application.project.perVolunteerLimit;
    if (!ownerVolunteerId || limit === null) return true;
    // every live application of the owner but this one, drafts included
    const others = await ctx.tx.application.count({
      where: {
        projectId,
        ownerVolunteerId,
        id: { not: id },
        status: { notIn: NOT_COUNTED_STATES },
      },
    });
    return others < limit;
  },
  'identity.present': async (ctx) => {
    const number = await identityNumber(ctx);
    return number !== null && IDENTITY_NUMBER.test(number);
  },
  'mandatory_fields.present': async (ctx) => (await ctx.validation()).ok,
  'beneficiary.not_blocked': async (ctx) => {
    if (!ctx.application.beneficiaryId) return true;
    const person = await ctx.tx.beneficiary.findUnique({
      where: { id: ctx.application.beneficiaryId },
      select: { isBlocked: true },
    });
    return person !== null && !person.isBlocked;
  },
  'volunteer.not_blocked': async (ctx) => {
    if (!ctx.application.ownerVolunteerId) return true;
    const blocked = await ctx.tx.blocklist.count({
      where: {
        subjectType: 'volunteer',
        subjectId: ctx.application.ownerVolunteerId,
        active: true,
      },
    });
    return blocked === 0;
  },
  'consent.accepted': async (ctx) => {
    if (!ctx.application.ownerVolunteerId) return true;
    const assignment = await ctx.tx.projectVolunteer.findFirst({
      where: {
        projectId: ctx.application.projectId,
        volunteerId: ctx.application.ownerVolunteerId,
        endedAt: null,
      },
      select: { consentStatus: true },
    });
    return assignment?.consentStatus === 'accepted';
  },
  // nobody decides on an application they brought (docs/DECISION_LOG.md, the application cycle)
  'actor.not_creator': async (ctx) => {
    const { createdByUserId, createdBy, submittedBy } = ctx.application;
    const me = ctx.actor.userId;
    return createdByUserId !== me && createdBy !== me && submittedBy !== me;
  },
  // the template's approval override (house construction: the PM gives the final approval); a
  // role's own grant without the condition does not reach it, a grant through the panel or a
  // project does (docs/architecture/WORKFLOW_ENGINE.md, "Exceptions and overrides")
  'approver.has_permission': async (ctx) => {
    const approval = ctx.application.project.approval;
    if (!approval) return true;
    return ctx.actor.access.grants.some(
      (g) =>
        g.permission === approval.permission &&
        (g.condition === approval.condition ||
          g.source === 'global_role' ||
          g.source === 'panel_grant' ||
          g.source === 'project_grant'),
    );
  },
  // a decision against the score order inside the quota area asks for a comment; it is never refused
  'score.comment_if_against_order': async (ctx) =>
    (await againstScore(ctx.tx, ctx.application.id, ctx.to)) ? { comment: 'against_score' } : true,
  // an approval in a full quota area asks for a comment; a quota never refuses a decision
  'quota.comment_if_full': async (ctx) =>
    ctx.to === 'approved' && (await quotaFull(ctx.tx, ctx.application.id))
      ? { comment: 'quota_full' }
      : true,
  'zakat.eligible_if_zakat_fund': async (ctx) => {
    const zakat = await ctx.tx.fundSource.count({
      where: { projectId: ctx.application.projectId, source: 'zakat' },
    });
    return zakat === 0 || ctx.application.zakatDecision === 'eligible';
  },
};
