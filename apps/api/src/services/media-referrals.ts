import { uuidv7 } from '@css/shared';
import type { Bilingual } from '@css/shared/i18n';
import {
  decisionState,
  MEDIA_PRIORITIES,
  mayDecide,
  mayResend,
  REFERABLE_APPLICATION_STATES,
  REFERRAL_STATES,
  type ReferralCreate,
  type ReferralDecisionBody,
  type ReferralState,
} from '@css/shared/media';
import { z } from 'zod';
import type { EffectiveAccess } from '../access/effective';
import { mediaReferralWhere, type Scope } from '../access/scope';
import type { AccessService } from '../access/service';
import { assertReachesApplication, reachesApplication } from '../applications/callers';
import { readAnswers } from '../applications/answers';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { isUniqueViolation } from '../core/db-errors';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseList,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { MediaEvents } from '../notifications/media-events';
import { readDefinition } from './forms';
import {
  mediaWorkView,
  reachesReferral,
  readWork,
  VIEW_PERMISSION,
  workRights,
} from './media-work-view';

/** Refers an application of the caller's program or region (a PM, an RPM). */
const REFER_PERMISSION = 'media.referral.create';
/** Decides on a referral (the Media Director and the Assistant Director). */
const DECIDE_PERMISSION = 'media.referral.decide';

/** The library question whose answer is the official's comment on the application. */
const OFFICIAL_COMMENT = 'official_comment';

const uuid = z.uuid();
const bilingual = z.object({ bn: z.string(), en: z.string() });
const person = z.object({ id: uuid, name: z.string() });

/** One step of a referral's and its work's history. */
const mediaEventView = z.object({
  id: uuid,
  kind: z.string(),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  comment: z.string().nullable(),
  actor: person,
  at: z.string(),
});

/**
 * What the Media Team may know of the person (docs/BUSINESS_RULES.md, the media team's data): the
 * names, age, mobile, address, occupation and income; never the identity numbers, ratings,
 * categories or scores.
 */
const mediaBeneficiaryView = z.object({
  name: z.string(),
  fatherOrHusbandName: z.string(),
  ageYears: z.number().int().nullable(),
  mobile: z.string(),
  address: z.object({
    divisionId: uuid,
    districtId: uuid,
    upazilaId: uuid,
    unionId: uuid,
    village: z.string(),
    postOffice: z.string().nullable(),
  }),
  occupation: bilingual.nullable(),
  monthlyIncome: z.string().nullable(),
});

const placeView = {
  program: z.object({ id: uuid, name: bilingual }),
  project: z.object({ id: uuid, name: bilingual, year: z.number().int() }),
};

/** A referral as the decider's queue lists it. */
export const mediaReferralSummary = z.object({
  id: uuid,
  applicationId: uuid,
  appNo: z.string().nullable(),
  state: z.enum(REFERRAL_STATES),
  priority: z.enum(MEDIA_PRIORITIES),
  beneficiaryName: z.string(),
  ...placeView,
  referredBy: person,
  referredAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type MediaReferralSummary = z.infer<typeof mediaReferralSummary>;

/** A referral with the person's allowed details, its decision, its work and its history. */
export const mediaReferralView = mediaReferralSummary.extend({
  note: z.string(),
  story: z.string().nullable(),
  decidedBy: person.nullable(),
  decisionComment: z.string().nullable(),
  beneficiary: mediaBeneficiaryView,
  /** The official's comment on the application; the scores of the official section never. */
  officialComment: z.string().nullable(),
  work: mediaWorkView.nullable(),
  history: z.array(mediaEventView),
  /** What the caller may do with it now. */
  mayDecide: z.boolean(),
  mayResend: z.boolean(),
});
export type MediaReferralView = z.infer<typeof mediaReferralView>;

/** The media state an application's record shows to its referrer and the directors. */
export const applicationMediaView = z.object({
  referralId: uuid,
  state: z.enum(REFERRAL_STATES),
  priority: z.enum(MEDIA_PRIORITIES),
  decisionComment: z.string().nullable(),
  decidedAt: z.string().nullable(),
  workStageCode: z.string().nullable(),
});
export type ApplicationMediaView = z.infer<typeof applicationMediaView>;

export const referralQuerySchema = z.strictObject({
  /** A comma list of states; the waiting ones by default. */
  state: z.string().max(100).optional(),
});
export type ReferralQuery = z.infer<typeof referralQuerySchema>;

const SUMMARY_SELECT = {
  id: true,
  applicationId: true,
  state: true,
  priority: true,
  updatedAt: true,
  decidedAt: true,
  application: { select: { appNo: true } },
  // the last send, the first one or a send after a correction
  events: {
    where: { kind: { in: ['referred', 'resent'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { kind: true, createdAt: true },
  },
  beneficiary: { select: { name: true } },
  project: {
    select: {
      id: true,
      nameBn: true,
      nameEn: true,
      year: true,
      program: { select: { id: true, nameBn: true, nameEn: true } },
    },
  },
  referredByRef: { select: { id: true, displayName: true } },
} satisfies Prisma.MediaReferralSelect;
type SummaryRow = Prisma.MediaReferralGetPayload<{ select: typeof SUMMARY_SELECT }>;

const READ_SELECT = {
  ...SUMMARY_SELECT,
  note: true,
  story: true,
  decisionComment: true,
  decidedByRef: { select: { id: true, displayName: true } },
  work: { select: { id: true } },
  application: { select: { appNo: true, formVersionId: true } },
  beneficiary: {
    select: {
      name: true,
      fatherOrHusbandName: true,
      dob: true,
      ageYears: true,
      mobile: true,
      divisionId: true,
      districtId: true,
      upazilaId: true,
      unionId: true,
      village: true,
      postOffice: true,
      occupationCode: true,
      occupationOtherText: true,
      monthlyIncome: true,
    },
  },
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      kind: true,
      fromValue: true,
      toValue: true,
      comment: true,
      createdAt: true,
      actor: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.MediaReferralSelect;
type ReadRow = Prisma.MediaReferralGetPayload<{ select: typeof READ_SELECT }>;

const name = (p: { nameBn: string; nameEn: string }): Bilingual => ({ bn: p.nameBn, en: p.nameEn });
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Whole years from the date of birth to the day, or the age the form recorded. */
function ageOn(today: Date, dob: Date | null, ageYears: number | null): number | null {
  if (!dob) return ageYears;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const before =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (before) age -= 1;
  return age;
}

/**
 * The Media Team's referrals (docs/plans/2026-10-26-1502-feat-media-team-plan.md, referral and
 * decision): a PM or an RPM refers an approved application of their scope with a priority, a note
 * and an optional story; the Media Director or the Assistant Director accepts it, which creates
 * its work, sends it back with a comment or rejects it with a reason; a referral sent back or
 * rejected may be corrected and sent again. One referral row per application carries the cycle;
 * every step writes its history row and an audit entry in one transaction, and the application's
 * own workflow never moves.
 */
export class MediaReferralsService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly events: MediaEvents,
  ) {}

  async refer(
    principal: Principal,
    applicationId: string,
    body: ReferralCreate,
  ): Promise<MediaReferralView> {
    const access = await this.access.load(principal.userId);
    await assertReachesApplication(this.access, principal, access, REFER_PERMISSION, applicationId);
    const id = await this.write(async (tx) => {
      const [application] = await tx.$queryRaw<
        { status: string; beneficiary_id: string | null; project_id: string }[]
      >`SELECT status, beneficiary_id, project_id FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
      if (
        !application?.beneficiary_id ||
        !(REFERABLE_APPLICATION_STATES as readonly string[]).includes(application.status)
      )
        throw new ApiError('media.referral_not_referable', 409);
      const existing = await tx.mediaReferral.findUnique({
        where: { applicationId },
        select: { id: true, state: true },
      });
      if (existing && !mayResend(existing.state as ReferralState))
        throw new ApiError('media.referral_open', 409);
      const content = { priority: body.priority, note: body.note, story: body.story ?? null };
      const referralId = existing?.id ?? uuidv7();
      if (existing)
        await tx.mediaReferral.update({
          where: { id: existing.id },
          data: {
            ...content,
            state: 'pending',
            // whoever sends it again hears the decision
            referredBy: principal.userId,
            decidedBy: null,
            decidedAt: null,
            decisionComment: null,
            updatedBy: principal.userId,
            updatedAt: this.clock.now(),
          },
        });
      else
        await tx.mediaReferral.create({
          data: {
            id: referralId,
            applicationId,
            beneficiaryId: application.beneficiary_id,
            projectId: application.project_id,
            referredBy: principal.userId,
            ...content,
            createdBy: principal.userId,
          },
        });
      await tx.mediaEvent.create({
        data: {
          id: uuidv7(),
          referralId,
          kind: existing ? 'resent' : 'referred',
          fromValue: existing?.state ?? null,
          toValue: 'pending',
          actorId: principal.userId,
        },
      });
      // the note and the story stay on the referral: the log keeps who sent what, when
      await this.audit.record(tx, {
        action: existing ? 'media.referral_resent' : 'media.referral_created',
        entityType: 'media_referral',
        entityId: referralId,
        new: { applicationId, priority: body.priority, state: 'pending' },
      });
      await this.events.referred(
        tx,
        { id: referralId, projectId: application.project_id },
        principal.userId,
      );
      return referralId;
    }, 'media.referral_open');
    return this.readAs(principal, access, id);
  }

  async decide(
    principal: Principal,
    referralId: string,
    body: ReferralDecisionBody,
  ): Promise<MediaReferralView> {
    const access = await this.access.load(principal.userId);
    await assertReachesApplication(
      this.access,
      principal,
      access,
      DECIDE_PERMISSION,
      await this.applicationOf(referralId),
    );
    await this.write(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { state: string; project_id: string; referred_by: string; application_id: string }[]
      >`SELECT state, project_id, referred_by, application_id FROM media_referrals WHERE id = ${referralId}::uuid FOR UPDATE`;
      if (!locked) throw new ApiError('permission.not_found', 404);
      if (!mayDecide(locked.state as ReferralState))
        throw new ApiError('media.referral_not_pending', 409);
      const state = decisionState(body.decision);
      const now = this.clock.now();
      await tx.mediaReferral.update({
        where: { id: referralId },
        data: {
          state,
          decidedBy: principal.userId,
          decidedAt: now,
          decisionComment: body.comment ?? null,
          updatedBy: principal.userId,
          updatedAt: now,
        },
      });
      let workId: string | null = null;
      if (state === 'accepted') {
        // the work starts at "accepted", named after the application until the directors rename it
        const application = await tx.application.findUniqueOrThrow({
          where: { id: locked.application_id },
          select: { appNo: true },
        });
        workId = uuidv7();
        // the stage's list key is a generated column, which the client would write
        await tx.$executeRaw`INSERT INTO media_works (id, referral_id, title, stage_code, created_by)
          VALUES (${workId}::uuid, ${referralId}::uuid, ${application.appNo ?? referralId}, 'accepted', ${principal.userId}::uuid)`;
      }
      await tx.mediaEvent.create({
        data: {
          id: uuidv7(),
          referralId,
          workId,
          kind: state,
          fromValue: 'pending',
          toValue: state,
          comment: body.comment ?? null,
          actorId: principal.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'media.referral_decided',
        entityType: 'media_referral',
        entityId: referralId,
        old: { state: 'pending' },
        new: { state, ...(workId ? { workId } : {}) },
        reason: body.comment ?? null,
      });
      await this.events.decided(
        tx,
        { id: referralId, projectId: locked.project_id, referredBy: locked.referred_by },
        body.decision,
        principal.userId,
      );
    });
    return this.readAs(principal, access, referralId);
  }

  /** One referral, for a caller whose `media.work.view` reaches it (404 otherwise). */
  async read(principal: Principal, referralId: string): Promise<MediaReferralView> {
    const access = await this.access.load(principal.userId);
    return this.readAs(principal, access, referralId);
  }

  /** The decider's queue: the waiting referrals by default, oldest first. */
  async list(principal: Principal, scope: Scope, query: ReferralQuery & PageQuery) {
    const states = parseList(query.state);
    if (states.some((s) => !(REFERRAL_STATES as readonly string[]).includes(s)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'state', code: 'validation.option_unknown' },
      ]);
    // a waiting referral last changed when it was sent; a decided one when it was decided
    const sort = parseSort(
      query.sort,
      ['updatedAt', 'id'],
      [{ field: 'updatedAt', direction: 'asc' }],
    );
    const binding = `media-referrals.list|${principal.userId}|${states.join(',')}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter: Prisma.MediaReferralWhereInput = {
      AND: [mediaReferralWhere(scope), { state: { in: states.length ? states : ['pending'] } }],
    };
    const fetched = await this.prisma.mediaReferral.findMany({
      where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
      select: SUMMARY_SELECT,
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    return { rows: rows.map((r) => this.summaryOf(r)), meta };
  }

  /**
   * The media part of an application's record: its referral for a caller whose `media.work.view`
   * reaches the application (the referrer's program or region, the directors), and whether the
   * caller may refer it now.
   */
  async forRecord(
    principal: Principal,
    access: EffectiveAccess,
    application: { id: string; status: string; beneficiaryId: string | null },
  ): Promise<{ media: ApplicationMediaView | null; mayReferToMedia: boolean }> {
    if (principal.kind === 'volunteer') return { media: null, mayReferToMedia: false };
    const [viewer, referrer] = await Promise.all([
      reachesApplication(this.access, principal, access, VIEW_PERMISSION, application.id),
      reachesApplication(this.access, principal, access, REFER_PERMISSION, application.id),
    ]);
    if (!viewer && !referrer) return { media: null, mayReferToMedia: false };
    const row = await this.prisma.mediaReferral.findUnique({
      where: { applicationId: application.id },
      select: {
        id: true,
        state: true,
        priority: true,
        decisionComment: true,
        decidedAt: true,
        work: { select: { stageCode: true } },
      },
    });
    const referable =
      application.beneficiaryId !== null &&
      (REFERABLE_APPLICATION_STATES as readonly string[]).includes(application.status);
    return {
      media:
        row && (viewer || referrer)
          ? {
              referralId: row.id,
              state: row.state as ReferralState,
              priority: row.priority as MediaReferralView['priority'],
              decisionComment: row.decisionComment,
              decidedAt: iso(row.decidedAt),
              workStageCode: row.work?.stageCode ?? null,
            }
          : null,
      mayReferToMedia: referrer && referable && (!row || mayResend(row.state as ReferralState)),
    };
  }

  /** The referral and its work as the caller sees them; 404 when nothing of theirs reaches it. */
  async readAs(
    principal: Principal,
    access: EffectiveAccess,
    referralId: string,
  ): Promise<MediaReferralView> {
    const [rights, referrer, decider] = await Promise.all([
      workRights(this.prisma, this.access, principal, access, referralId),
      this.reachedBy(principal, access, REFER_PERMISSION, referralId),
      this.reachedBy(principal, access, DECIDE_PERMISSION, referralId),
    ]);
    // the referrer and the decider read what they just wrote, whatever the panel left of the view
    if (!rights.view && !referrer && !decider) throw new ApiError('permission.not_found', 404);
    const row = await this.prisma.mediaReferral.findUniqueOrThrow({
      where: { id: referralId },
      select: READ_SELECT,
    });
    const { officialComment, occupation, monthlyIncome } = await this.fromForm(row);
    const b = row.beneficiary;
    const state = row.state as ReferralState;
    return {
      ...this.summaryOf(row),
      note: row.note,
      story: row.story,
      decidedBy: row.decidedByRef
        ? { id: row.decidedByRef.id, name: row.decidedByRef.displayName }
        : null,
      decisionComment: row.decisionComment,
      beneficiary: {
        name: b.name,
        fatherOrHusbandName: b.fatherOrHusbandName,
        ageYears: ageOn(this.clock.now(), b.dob, b.ageYears),
        mobile: b.mobile,
        address: {
          divisionId: b.divisionId,
          districtId: b.districtId,
          upazilaId: b.upazilaId,
          unionId: b.unionId,
          village: b.village,
          postOffice: b.postOffice,
        },
        occupation,
        monthlyIncome,
      },
      officialComment,
      work: row.work ? await readWork(this.prisma, row.work.id, rights) : null,
      history: row.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        fromValue: e.fromValue,
        toValue: e.toValue,
        comment: e.comment,
        actor: { id: e.actor.id, name: e.actor.displayName },
        at: e.createdAt.toISOString(),
      })),
      mayDecide: decider && mayDecide(state),
      mayResend: referrer && mayResend(state),
    };
  }

  /** Whether the caller holds the permission with a scope that reaches the referral. */
  private async reachedBy(
    principal: Principal,
    access: EffectiveAccess,
    permission: string,
    referralId: string,
  ): Promise<boolean> {
    return (
      await reachesReferral(this.prisma, this.access, principal, access, permission, referralId)
    ).reached;
  }

  private async applicationOf(referralId: string): Promise<string | null> {
    const row = await this.prisma.mediaReferral.findUnique({
      where: { id: referralId },
      select: { applicationId: true },
    });
    return row?.applicationId ?? null;
  }

  /**
   * What the application's answers add, read as the office reads the form: the official's comment
   * (the library's question, never the rest of the official section), the occupation by its
   * option's label or the text given for "other", and the monthly income; the profile's own
   * columns stand in when the form did not ask.
   */
  private async fromForm(row: ReadRow): Promise<{
    officialComment: string | null;
    occupation: Bilingual | null;
    monthlyIncome: string | null;
  }> {
    const definition = await readDefinition(this.prisma, row.application.formVersionId, 'official');
    // the questions of a repeat group describe the family members, not the person
    const fields = definition.sections
      .flatMap((s) => s.fields)
      .filter((f) => !f.settings?.repeat?.group);
    const answers = await readAnswers(this.prisma, row.applicationId, definition);
    const valueOf = (field: (typeof fields)[number] | undefined) =>
      field
        ? (answers.find((a) => a.fieldKey === field.fieldKey && (a.repeatIndex ?? 0) === 0)
            ?.value as { v?: unknown; other?: string } | undefined)
        : undefined;
    const marked = (column: string) =>
      fields.find((f) => (f.standardColumn ?? '').split(',').includes(column));

    const comment = valueOf(
      fields.find((f) => f.libraryFieldKey === OFFICIAL_COMMENT || f.fieldKey === OFFICIAL_COMMENT),
    )?.v;
    const officialComment = typeof comment === 'string' && comment.trim() ? comment : null;

    const occupationField = marked('occupation_code');
    const chosen = valueOf(occupationField);
    const code = typeof chosen?.v === 'string' ? chosen.v : row.beneficiary.occupationCode;
    const other = chosen ? chosen.other : row.beneficiary.occupationOtherText;
    let occupation: Bilingual | null = null;
    if (other?.trim()) occupation = { bn: other, en: other };
    else if (code)
      occupation = occupationField?.options?.find((o) => o.code === code)?.label ?? {
        bn: code,
        en: code,
      };

    const income = valueOf(marked('monthly_income'))?.v;
    const answered = typeof income === 'number' || (typeof income === 'string' && income.trim());
    const amount = answered ? Number(income) : row.beneficiary.monthlyIncome?.toNumber();
    const monthlyIncome = amount === undefined || Number.isNaN(amount) ? null : amount.toFixed(2);
    return { officialComment, occupation, monthlyIncome };
  }

  private summaryOf(r: SummaryRow): MediaReferralSummary {
    return {
      id: r.id,
      applicationId: r.applicationId,
      appNo: r.application.appNo,
      state: r.state as ReferralState,
      priority: r.priority as MediaReferralSummary['priority'],
      beneficiaryName: r.beneficiary.name,
      program: { id: r.project.program.id, name: name(r.project.program) },
      project: { id: r.project.id, name: name(r.project), year: r.project.year },
      referredBy: { id: r.referredByRef.id, name: r.referredByRef.displayName },
      referredAt: (
        r.events.filter((e) => e.kind === 'referred' || e.kind === 'resent').at(-1)?.createdAt ??
        r.updatedAt
      ).toISOString(),
      decidedAt: iso(r.decidedAt),
    };
  }

  private async write<T>(fn: (tx: Tx) => Promise<T>, onUnique?: string): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      if (onUnique && isUniqueViolation(error)) throw new ApiError(onUnique, 409);
      throw error;
    }
  }
}
