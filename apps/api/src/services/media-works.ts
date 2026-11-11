import { referenceListAttributesSchema, uuidv7 } from '@css/shared';
import {
  clearsReview,
  linkProblem,
  mayPublish,
  mayReview,
  type MembersBody,
  type PublicationCreate,
  type PublicationUpdate,
  publishedHasLink,
  type ReviewBody,
  type WorkUpdate,
} from '@css/shared/media';
import type { EffectiveAccess } from '../access/effective.js';
import { holdsPermission } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import { assertIfMatch } from '../core/etag.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import type { MediaEvents } from '../notifications/media-events.js';
import type { MediaReferralsService, MediaReferralView } from './media-referrals.js';
import {
  isClosedStage,
  MANAGE_PERMISSION,
  ordinaryStages,
  REVIEW_PERMISSION,
  stagesFor,
  STORY_PERMISSION,
  VIEW_PERMISSION,
  type WorkRights,
  workRights,
} from './media-work-view.js';

/** The roles whose holders may be members of a work. */
const MEDIA_ROLES = ['media_team', 'media_director', 'media_assistant_director'];

const invalid = (path: string, code: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path, code }]);

interface LockedWork {
  id: string;
  referral_id: string;
  title: string;
  stage_code: string;
  held_stage_code: string | null;
  content_type: string;
  script_state: string;
  review_approved_by: string | null;
  updated_at: Date;
}

/**
 * The kind of a platform of the list, or null for an unknown one; a new publication also needs it
 * active, while an existing one keeps the kind of the platform it was made on.
 */
async function platformKind(tx: Tx, code: string, activeOnly = true): Promise<string | null> {
  const row = await tx.referenceList.findFirst({
    where: { listKey: 'media_platform', code, ...(activeOnly ? { active: true } : {}) },
    select: { attributes: true },
  });
  if (!row) return null;
  return referenceListAttributesSchema.parse(row.attributes).kind ?? 'other';
}

/**
 * The works of the Media Team (docs/plans/2026-10-26-1502-feat-media-team-plan.md, the work): a
 * work starts when its referral is accepted and moves through the editable stages; the team moves
 * it among the ordinary stages and to "ready to publish", the directors also hold, resume, cancel
 * and close it, rename it and choose its members; the Media Director gives the final review or
 * sends it back to "in review"; the first publication marked published after the review makes the
 * work "published". Each change writes a history row and an audit entry in one transaction; the
 * application and the person are never written here. Every call answers the whole referral as
 * its page shows it.
 */
export class MediaWorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly events: MediaEvents,
    private readonly referrals: MediaReferralsService,
  ) {}

  async update(
    principal: Principal,
    workId: string,
    body: WorkUpdate,
    ifMatch: string | undefined,
  ): Promise<MediaReferralView> {
    const { access, referralId, rights } = await this.reach(principal, workId, MANAGE_PERMISSION);
    const scriptChange = body.script !== undefined || body.scriptState !== undefined;
    if (scriptChange && !rights.story) this.deny(principal, STORY_PERMISSION);
    if (body.title !== undefined && !rights.direct) this.deny(principal, MANAGE_PERMISSION);
    await this.prisma.$transaction(async (tx) => {
      const work = await this.locked(tx, workId);
      assertIfMatch(ifMatch, work.updated_at);
      this.assertOpen(work);
      const data: Record<string, unknown> = { updatedBy: principal.userId };
      const steps: { kind: string; from?: string | null; to?: string | null }[] = [];
      if (body.title !== undefined && body.title !== work.title) {
        data.title = body.title;
        steps.push({ kind: 'title_changed' });
      }
      if (body.contentType !== undefined && body.contentType !== work.content_type) {
        data.contentType = body.contentType;
        steps.push({ kind: 'content_type_changed', from: work.content_type, to: body.contentType });
      }
      if (scriptChange) {
        if (body.script !== undefined) data.script = body.script;
        if (body.scriptState !== undefined) data.scriptState = body.scriptState;
        steps.push({
          kind: 'script_changed',
          from: work.script_state,
          to: body.scriptState ?? null,
        });
      }
      let readyForReview = false;
      let withdrawn = false;
      if (body.stageCode !== undefined) {
        const to = body.stageCode;
        const allowed = stagesFor(
          { stageCode: work.stage_code, heldStageCode: work.held_stage_code },
          await ordinaryStages(tx),
          rights,
        );
        if (!allowed.includes(to)) throw new ApiError('media.stage_not_allowed', 409);
        data.stageCode = to;
        if (work.stage_code === 'on_hold') {
          data.heldStageCode = null;
          steps.push({ kind: to === 'cancelled' ? 'cancelled' : 'resumed', from: 'on_hold', to });
        } else if (to === 'on_hold') {
          data.heldStageCode = work.stage_code;
          steps.push({ kind: 'held', from: work.stage_code, to });
        } else
          steps.push({
            kind: to === 'cancelled' ? 'cancelled' : 'stage_changed',
            from: work.stage_code,
            to,
          });
        // a work sent back to the team needs the final review again
        if (clearsReview(to)) withdrawn = true;
        readyForReview = to === 'ready_to_publish';
      }
      // what the director approved is what goes out: a later change of the content asks again
      if (
        work.stage_code === 'ready_to_publish' &&
        (scriptChange || data.contentType !== undefined || data.title !== undefined)
      )
        withdrawn = true;
      if (withdrawn && work.review_approved_by) {
        data.reviewApprovedBy = null;
        data.reviewApprovedAt = null;
      }
      const approvalKept = work.review_approved_by !== null && !withdrawn;
      if (!steps.length) throw new ApiError('media.unchanged', 422);
      await tx.mediaWork.update({ where: { id: workId }, data });
      for (const step of steps) await this.event(tx, principal, work, step);
      await this.audit.record(tx, {
        action: 'media.work_changed',
        entityType: 'media_work',
        entityId: workId,
        old: { stage: work.stage_code, contentType: work.content_type },
        new: { changes: steps.map((s) => s.kind), stage: data.stageCode ?? work.stage_code },
      });
      if (readyForReview && !approvalKept)
        await this.events.reviewWaiting(tx, workId, principal.userId);
    });
    return this.referrals.readAs(principal, access, referralId);
  }

  /** The whole team of a work: only a director adds or removes members. */
  async setMembers(
    principal: Principal,
    workId: string,
    body: MembersBody,
    ifMatch: string | undefined,
  ): Promise<MediaReferralView> {
    const { access, referralId, rights } = await this.reach(principal, workId, MANAGE_PERMISSION);
    if (!rights.direct) this.deny(principal, MANAGE_PERMISSION);
    await this.prisma.$transaction(async (tx) => {
      const work = await this.locked(tx, workId);
      // the whole team is replaced: a team another director saved meanwhile is not overwritten
      assertIfMatch(ifMatch, work.updated_at);
      this.assertOpen(work);
      const ids = body.members.map((m) => m.userId);
      const fit = await tx.user.findMany({
        where: {
          id: { in: ids },
          kind: 'staff',
          state: 'active',
          userRolesUser: { some: { roleKey: { in: MEDIA_ROLES }, revokedAt: null } },
        },
        select: { id: true },
      });
      const fitIds = new Set(fit.map((u) => u.id));
      const unfit = body.members.findIndex((m) => !fitIds.has(m.userId));
      if (unfit >= 0) throw invalid(`members.${unfit}.userId`, 'media.member_not_media');
      const roles = await tx.referenceList.findMany({
        where: { listKey: 'media_role', active: true },
        select: { code: true },
      });
      const known = new Set(roles.map((r) => r.code));
      const before = await tx.mediaWorkMember.findMany({
        where: { workId },
        select: { userId: true, roles: true },
      });
      const was = new Map(before.map((m) => [m.userId, m.roles]));
      // a role taken out of the list stays with a member who already holds it here
      for (const [i, m] of body.members.entries())
        if (m.roles.some((r) => !known.has(r) && !(was.get(m.userId) ?? []).includes(r)))
          throw invalid(`members.${i}.roles`, 'media.role_unknown');
      const same =
        before.length === body.members.length &&
        body.members.every(
          (m) => [...(was.get(m.userId) ?? [])].sort().join() === [...m.roles].sort().join(),
        );
      if (same) throw new ApiError('media.unchanged', 422);
      await tx.mediaWorkMember.deleteMany({ where: { workId, userId: { notIn: ids } } });
      for (const m of body.members)
        await tx.mediaWorkMember.upsert({
          where: { workId_userId: { workId, userId: m.userId } },
          create: {
            id: uuidv7(),
            workId,
            userId: m.userId,
            roles: m.roles,
            createdBy: principal.userId,
          },
          update: { roles: m.roles, updatedBy: principal.userId },
        });
      // the work's version moves with its team
      await tx.mediaWork.update({ where: { id: workId }, data: { updatedBy: principal.userId } });
      await this.event(tx, principal, work, { kind: 'members_changed' });
      await this.audit.record(tx, {
        action: 'media.members_changed',
        entityType: 'media_work',
        entityId: workId,
        old: { members: before.map((m) => ({ userId: m.userId, roles: m.roles })) },
        new: { members: body.members },
      });
      const added = ids.filter((id) => !was.has(id));
      if (added.length) await this.events.membersAdded(tx, workId, added, principal.userId);
    });
    return this.referrals.readAs(principal, access, referralId);
  }

  async addPublication(
    principal: Principal,
    workId: string,
    body: PublicationCreate,
  ): Promise<MediaReferralView> {
    const { access, referralId } = await this.reach(principal, workId, MANAGE_PERMISSION);
    await this.prisma.$transaction(async (tx) => {
      const work = await this.locked(tx, workId);
      this.assertOpen(work);
      const kind = await platformKind(tx, body.platformCode);
      if (!kind) throw invalid('platformCode', 'media.platform_unknown');
      this.assertLink(body.link, kind);
      if (body.state === 'published') this.assertPublishable(work);
      const id = uuidv7();
      // the platform's list key is a generated column, which the client would write
      await tx.$executeRaw`INSERT INTO media_publications (id, work_id, platform_code, state, published_on, link, note, created_by)
        VALUES (${id}::uuid, ${workId}::uuid, ${body.platformCode}, ${body.state},
          ${body.publishedOn ?? null}::date, ${body.link ?? null}, ${body.note ?? null}, ${principal.userId}::uuid)`;
      await this.event(tx, principal, work, {
        kind: 'publication_added',
        to: `${body.platformCode}:${body.state}`,
      });
      await this.audit.record(tx, {
        action: 'media.publication_added',
        entityType: 'media_work',
        entityId: workId,
        new: { publicationId: id, platform: body.platformCode, state: body.state },
      });
      if (body.state === 'published') await this.published(tx, principal, work);
    });
    return this.referrals.readAs(principal, access, referralId);
  }

  async updatePublication(
    principal: Principal,
    publicationId: string,
    body: PublicationUpdate,
  ): Promise<MediaReferralView> {
    // the work is found through the publication before its scope is checked
    const owner = await this.prisma.mediaPublication.findUnique({
      where: { id: publicationId },
      select: { workId: true },
    });
    if (!owner) throw new ApiError('permission.not_found', 404);
    const { access, referralId } = await this.reach(principal, owner.workId, MANAGE_PERMISSION);
    await this.prisma.$transaction(async (tx) => {
      const work = await this.locked(tx, owner.workId);
      this.assertOpen(work);
      const stored = await tx.mediaPublication.findUniqueOrThrow({
        where: { id: publicationId },
        select: { platformCode: true, state: true, link: true, publishedOn: true, note: true },
      });
      const merged = {
        state: body.state ?? stored.state,
        link: body.link !== undefined ? body.link : stored.link,
        publishedOn:
          body.publishedOn !== undefined
            ? body.publishedOn
            : (stored.publishedOn?.toISOString().slice(0, 10) ?? null),
      };
      if (!publishedHasLink(merged)) throw invalid('link', 'validation.required');
      if (body.link !== undefined)
        this.assertLink(body.link, (await platformKind(tx, stored.platformCode, false)) ?? 'other');
      const nowPublished = merged.state === 'published' && stored.state !== 'published';
      if (
        stored.state === 'published' &&
        merged.state !== 'published' &&
        work.stage_code !== 'ready_to_publish'
      ) {
        const others = await tx.mediaPublication.count({
          where: { workId: work.id, state: 'published', id: { not: publicationId } },
        });
        if (!others) throw new ApiError('media.publication_last', 409);
      }
      if (nowPublished) this.assertPublishable(work);
      await tx.mediaPublication.update({
        where: { id: publicationId },
        data: {
          state: merged.state,
          link: merged.link,
          publishedOn: merged.publishedOn ? new Date(`${merged.publishedOn}T00:00:00Z`) : null,
          // an emptied note is cleared (null)
          ...(body.note !== undefined ? { note: body.note } : {}),
          updatedBy: principal.userId,
        },
      });
      await this.event(tx, principal, work, {
        kind: 'publication_changed',
        from: `${stored.platformCode}:${stored.state}`,
        to: `${stored.platformCode}:${merged.state}`,
      });
      await this.audit.record(tx, {
        action: 'media.publication_changed',
        entityType: 'media_work',
        entityId: work.id,
        old: { publicationId, state: stored.state, link: stored.link },
        new: { publicationId, state: merged.state, link: merged.link },
      });
      if (nowPublished) await this.published(tx, principal, work);
    });
    return this.referrals.readAs(principal, access, referralId);
  }

  /** The final review at "ready to publish": approved, or sent back to "in review" with a comment. */
  async review(
    principal: Principal,
    workId: string,
    body: ReviewBody,
    ifMatch: string | undefined,
  ): Promise<MediaReferralView> {
    const { access, referralId } = await this.reach(principal, workId, REVIEW_PERMISSION);
    await this.prisma.$transaction(async (tx) => {
      const work = await this.locked(tx, workId);
      // the approval is of the version the director read
      assertIfMatch(ifMatch, work.updated_at);
      if (!mayReview(work.stage_code) || (body.decision === 'approve' && work.review_approved_by))
        throw new ApiError('media.review_not_ready', 409);
      const approve = body.decision === 'approve';
      await tx.mediaWork.update({
        where: { id: workId },
        data: approve
          ? {
              reviewApprovedBy: principal.userId,
              reviewApprovedAt: this.clock.now(),
              updatedBy: principal.userId,
            }
          : {
              stageCode: 'in_review',
              reviewApprovedBy: null,
              reviewApprovedAt: null,
              updatedBy: principal.userId,
            },
      });
      await this.event(tx, principal, work, {
        kind: approve ? 'review_approved' : 'review_sent_back',
        from: work.stage_code,
        to: approve ? work.stage_code : 'in_review',
        comment: body.comment ?? null,
      });
      await this.audit.record(tx, {
        action: 'media.review_decided',
        entityType: 'media_work',
        entityId: workId,
        old: { stage: work.stage_code },
        new: { decision: body.decision, stage: approve ? work.stage_code : 'in_review' },
        reason: body.comment ?? null,
      });
    });
    return this.referrals.readAs(principal, access, referralId);
  }

  async comment(principal: Principal, workId: string, body: string): Promise<MediaReferralView> {
    const { access, referralId } = await this.reach(principal, workId, VIEW_PERMISSION);
    await this.prisma.$transaction(async (tx) => {
      const id = uuidv7();
      await tx.mediaComment.create({
        data: { id, workId, authorId: principal.userId, body },
      });
      await this.audit.record(tx, {
        action: 'media.comment_added',
        entityType: 'media_work',
        entityId: workId,
        new: { commentId: id },
      });
    });
    return this.referrals.readAs(principal, access, referralId);
  }

  /**
   * The caller's rights on the work: 403 without the route's permission, 404 when its scope misses
   * the work (a member on another work, a referrer of another region).
   */
  private async reach(
    principal: Principal,
    workId: string,
    permission: string,
  ): Promise<{ access: EffectiveAccess; referralId: string; rights: WorkRights }> {
    const access = await this.access.load(principal.userId);
    if (!holdsPermission(permission, access.grants)) this.deny(principal, permission);
    const work = await this.prisma.mediaWork.findUnique({
      where: { id: workId },
      select: { referralId: true },
    });
    if (!work) throw new ApiError('permission.not_found', 404);
    const rights = await workRights(this.prisma, this.access, principal, access, work.referralId);
    const held =
      permission === VIEW_PERMISSION
        ? rights.view
        : permission === REVIEW_PERMISSION
          ? rights.review
          : rights.manage;
    if (!held) throw new ApiError('permission.not_found', 404);
    return { access, referralId: work.referralId, rights };
  }

  private deny(principal: Principal, permission: string): never {
    this.access.denied(principal.userId, permission, 'application');
    throw new ApiError('permission.denied', 403);
  }

  private async locked(tx: Tx, workId: string): Promise<LockedWork> {
    const [work] = await tx.$queryRaw<LockedWork[]>`
      SELECT id, referral_id, title, stage_code, held_stage_code, content_type, script_state,
             review_approved_by, updated_at
        FROM media_works WHERE id = ${workId}::uuid FOR UPDATE`;
    if (!work) throw new ApiError('permission.not_found', 404);
    return work;
  }

  /** A done or cancelled work takes only comments. */
  private assertOpen(work: LockedWork): void {
    if (isClosedStage(work.stage_code)) throw new ApiError('media.work_closed', 409);
  }

  private assertLink(link: string | null | undefined, kind: string): void {
    if (link === undefined || link === null) return;
    const problem = linkProblem(link, kind);
    if (problem) throw invalid('link', `media.${problem}`);
  }

  private assertPublishable(work: LockedWork): void {
    if (!mayPublish(work.stage_code, work.review_approved_by !== null))
      throw new ApiError('media.publish_before_review', 409);
  }

  /** The first publication after the final review makes the work "published" and tells the referrer. */
  private async published(tx: Tx, principal: Principal, work: LockedWork): Promise<void> {
    if (work.stage_code !== 'ready_to_publish') return;
    await tx.mediaWork.update({
      where: { id: work.id },
      data: { stageCode: 'published', updatedBy: principal.userId },
    });
    await this.event(tx, principal, work, {
      kind: 'stage_changed',
      from: work.stage_code,
      to: 'published',
    });
    await this.events.published(tx, work.id, principal.userId);
  }

  private async event(
    tx: Tx,
    principal: Principal,
    work: LockedWork,
    step: { kind: string; from?: string | null; to?: string | null; comment?: string | null },
  ): Promise<void> {
    await tx.mediaEvent.create({
      data: {
        id: uuidv7(),
        referralId: work.referral_id,
        workId: work.id,
        kind: step.kind,
        fromValue: step.from ?? null,
        toValue: step.to ?? null,
        comment: step.comment ?? null,
        actorId: principal.userId,
      },
    });
  }
}
