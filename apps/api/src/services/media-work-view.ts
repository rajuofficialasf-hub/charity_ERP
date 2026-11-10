import {
  CONTENT_TYPES,
  isSystemStage,
  nextStages,
  PUBLICATION_STATES,
  SCRIPT_STATES,
  youtubeId,
} from '@css/shared/media';
import { mediaScriptSchema } from '@css/shared';
import { z } from 'zod';
import type { EffectiveAccess } from '../access/effective.js';
import { holdsPermission, mediaReferralWhere } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import { etagOf } from '../core/etag.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';

/** Reads a referral and its work: the directors, the members of its work and the referrers. */
export const VIEW_PERMISSION = 'media.work.view';
/** Runs a work: the directors on every work, a member on the works they are on. */
export const MANAGE_PERMISSION = 'media.work.manage';
/** Writes the script. */
export const STORY_PERMISSION = 'story.manage';
/** Reads the script. */
const STORY_VIEW_PERMISSION = 'story.view';
/** The final review before publication (the Media Director by default). */
export const REVIEW_PERMISSION = 'media.publication.review';

const uuid = z.uuid();
const person = z.object({ id: uuid, name: z.string() });

/** A work as its page reads it, with what the caller may do with it now. */
export const mediaWorkView = z.object({
  id: uuid,
  title: z.string(),
  stageCode: z.string(),
  /** The stage a work on hold returns to. */
  heldStageCode: z.string().nullable(),
  contentType: z.enum(CONTENT_TYPES),
  /** Null for a caller who may not read the script. */
  script: mediaScriptSchema.nullable(),
  scriptState: z.enum(SCRIPT_STATES),
  reviewApprovedBy: person.nullable(),
  reviewApprovedAt: z.string().nullable(),
  /** What the next change carries back in If-Match. */
  version: z.string(),
  members: z.array(z.object({ userId: uuid, name: z.string(), roles: z.array(z.string()) })),
  publications: z.array(
    z.object({
      id: uuid,
      platformCode: z.string(),
      state: z.enum(PUBLICATION_STATES),
      publishedOn: z.string().nullable(),
      link: z.string().nullable(),
      note: z.string().nullable(),
      /** The video id of a YouTube link, from which alone the thumbnail is built. */
      youtubeId: z.string().nullable(),
    }),
  ),
  comments: z.array(z.object({ id: uuid, author: person, body: z.string(), at: z.string() })),
  /** The stages the caller may move it to by hand; resuming a work on hold included. */
  nextStages: z.array(z.string()),
  mayManage: z.boolean(),
  mayEditScript: z.boolean(),
  /** Adding and removing members, renaming, holding and closing: the directors only. */
  mayDirect: z.boolean(),
  mayReview: z.boolean(),
});
export type MediaWorkView = z.infer<typeof mediaWorkView>;

/** What the caller holds on one referral and its work. */
export interface WorkRights {
  view: boolean;
  manage: boolean;
  /** `media.work.manage` held at GLOBAL: the Media Director and the Assistant Director. */
  direct: boolean;
  story: boolean;
  storyView: boolean;
  review: boolean;
}

/**
 * Whether the caller holds the permission with a scope that reaches the referral: the referrals of
 * the applications the scope reaches, and for an ASSIGNED grant those whose work the caller is on.
 */
export async function reachesReferral(
  db: Tx | PrismaService,
  access: AccessService,
  principal: Principal,
  effective: EffectiveAccess,
  permission: string,
  referralId: string,
): Promise<{ reached: boolean; global: boolean }> {
  if (!holdsPermission(permission, effective.grants)) return { reached: false, global: false };
  const scope = await access.scopeFor(principal, effective, permission, 'application');
  const reached =
    (await db.mediaReferral.count({
      where: { AND: [{ id: referralId }, mediaReferralWhere(scope)] },
    })) > 0;
  return { reached, global: reached && scope.instances.global };
}

/** The caller's rights on one referral's work. */
export async function workRights(
  db: Tx | PrismaService,
  access: AccessService,
  principal: Principal,
  effective: EffectiveAccess,
  referralId: string,
): Promise<WorkRights> {
  const reach = (permission: string) =>
    reachesReferral(db, access, principal, effective, permission, referralId);
  const [view, manage, story, storyView, review] = await Promise.all([
    reach(VIEW_PERMISSION),
    reach(MANAGE_PERMISSION),
    reach(STORY_PERMISSION),
    reach(STORY_VIEW_PERMISSION),
    reach(REVIEW_PERMISSION),
  ]);
  return {
    view: view.reached,
    manage: manage.reached,
    direct: manage.global,
    story: story.reached,
    storyView: storyView.reached || story.reached,
    review: review.reached,
  };
}

/** The active ordinary stages of the list, in their order. */
export async function ordinaryStages(db: Tx | PrismaService): Promise<string[]> {
  const rows = await db.referenceList.findMany({
    where: { listKey: 'media_stage', active: true, isSystem: false },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: { code: true },
  });
  return rows.map((r) => r.code).filter((code) => !isSystemStage(code));
}

const FINAL_STAGES = ['done', 'cancelled'];

/** The stages the caller may move the work to now, resuming a work on hold included. */
export function stagesFor(
  work: { stageCode: string; heldStageCode: string | null },
  ordinary: readonly string[],
  rights: WorkRights,
): string[] {
  if (!rights.manage) return [];
  const next = nextStages(work.stageCode, ordinary, rights.direct);
  return work.stageCode === 'on_hold' && rights.direct && work.heldStageCode
    ? [work.heldStageCode, ...next]
    : next;
}

/** Whether nothing more is done on the work but comments. */
export const isClosedStage = (stage: string) => FINAL_STAGES.includes(stage);

/** One work as the caller reads it. */
export async function readWork(
  db: Tx | PrismaService,
  workId: string,
  rights: WorkRights,
): Promise<MediaWorkView> {
  const work = await db.mediaWork.findUniqueOrThrow({
    where: { id: workId },
    select: {
      id: true,
      title: true,
      stageCode: true,
      heldStageCode: true,
      contentType: true,
      script: true,
      scriptState: true,
      reviewApprovedAt: true,
      reviewApprovedByRef: { select: { id: true, displayName: true } },
      updatedAt: true,
      members: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { userId: true, roles: true, user: { select: { displayName: true } } },
      },
      publications: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          platformCode: true,
          state: true,
          publishedOn: true,
          link: true,
          note: true,
        },
      },
      comments: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, displayName: true } },
        },
      },
    },
  });
  const closed = isClosedStage(work.stageCode);
  // only a manager of an open work moves it
  const ordinary = rights.manage && !closed ? await ordinaryStages(db) : [];
  return {
    id: work.id,
    title: work.title,
    stageCode: work.stageCode,
    heldStageCode: work.heldStageCode,
    contentType: z.enum(CONTENT_TYPES).parse(work.contentType),
    script: rights.storyView ? mediaScriptSchema.parse(work.script) : null,
    scriptState: z.enum(SCRIPT_STATES).parse(work.scriptState),
    reviewApprovedBy: work.reviewApprovedByRef
      ? { id: work.reviewApprovedByRef.id, name: work.reviewApprovedByRef.displayName }
      : null,
    reviewApprovedAt: work.reviewApprovedAt?.toISOString() ?? null,
    version: etagOf(work.updatedAt),
    members: work.members.map((m) => ({
      userId: m.userId,
      name: m.user.displayName,
      roles: m.roles,
    })),
    publications: work.publications.map((p) => ({
      id: p.id,
      platformCode: p.platformCode,
      state: z.enum(PUBLICATION_STATES).parse(p.state),
      publishedOn: p.publishedOn?.toISOString().slice(0, 10) ?? null,
      link: p.link,
      note: p.note,
      youtubeId: p.link ? youtubeId(p.link) : null,
    })),
    comments: work.comments.map((c) => ({
      id: c.id,
      author: { id: c.author.id, name: c.author.displayName },
      body: c.body,
      at: c.createdAt.toISOString(),
    })),
    nextStages: closed ? [] : stagesFor(work, ordinary, rights),
    mayManage: rights.manage && !closed,
    mayEditScript: rights.story && !closed,
    mayDirect: rights.direct && !closed,
    mayReview: rights.review && work.stageCode === 'ready_to_publish',
  };
}
