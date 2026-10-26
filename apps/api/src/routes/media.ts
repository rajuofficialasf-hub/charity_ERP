import {
  commentSchema,
  type MembersBody,
  membersSchema,
  type PublicationCreate,
  publicationCreateSchema,
  type PublicationUpdate,
  publicationUpdateSchema,
  type ReferralCreate,
  referralCreateSchema,
  type ReferralDecisionBody,
  referralDecisionSchema,
  type ReviewBody,
  reviewSchema,
  type WorkUpdate,
  workUpdateSchema,
} from '@css/shared/media';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { type PageQuery, pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import {
  mediaReferralSummary,
  mediaReferralView,
  type ReferralQuery,
  referralQuerySchema,
} from '../services/media-referrals';

const uuid = z.uuid();

/**
 * The Media Team (openapi tag media): the referral of an approved application by a PM or an RPM,
 * the decider's queue, the referral with the person's allowed details, and the decision that
 * starts a work. The application's own workflow never moves here.
 */
export function mediaRouter(
  deps: RouteDeps,
  c: Pick<Container, 'mediaReferrals' | 'mediaWorks'>,
): Router {
  const router = Router();
  const op = { tag: 'media', idempotency: 'none' as const, rateLimit: 'default' as const };

  defineRoute<ReferralCreate, unknown, { applicationId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/applications/:applicationId/media-referral',
    status: 201,
    operationId: 'media.referral.create',
    summary:
      'Refer an approved application to the Media Team with a priority, a note and an optional story, or send a referral that was sent back or rejected again',
    permission: 'media.referral.create',
    scope: 'application',
    audit: 'media.referral_created',
    params: { applicationId: uuid },
    body: referralCreateSchema,
    responses: { 201: mediaReferralView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.mediaReferrals.refer(principalOf(req), params.applicationId, body)),
  });

  defineRoute<unknown, ReferralQuery & PageQuery>(router, deps, {
    ...op,
    method: 'get',
    path: '/media-referrals',
    operationId: 'media.referral.list',
    summary: "The decider's queue: the referrals waiting for a decision by default, oldest first",
    permission: 'media.referral.decide',
    scope: 'application',
    audit: 'none',
    query: pageQuery.extend(referralQuerySchema.shape),
    responses: { 200: z.array(mediaReferralSummary), 400: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.mediaReferrals.list(principalOf(req), scopeOf(req), query);
      return page(rows, meta);
    },
  });

  defineRoute<unknown, unknown, { referralId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/media-referrals/:referralId',
    operationId: 'media.referral.get',
    summary:
      "A referral with the person's allowed details, the official's comment, its decision, its work and its history",
    permission: 'media.work.view',
    scope: 'application',
    audit: 'none',
    params: { referralId: uuid },
    responses: { 200: mediaReferralView, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.mediaReferrals.read(principalOf(req), params.referralId)),
  });

  defineRoute<ReferralDecisionBody, unknown, { referralId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/media-referrals/:referralId/decision',
    operationId: 'media.referral.decide',
    summary:
      'Accept a waiting referral (its work starts), send it back with a comment, or reject it with a reason',
    permission: 'media.referral.decide',
    scope: 'application',
    audit: 'media.referral_decided',
    params: { referralId: uuid },
    body: referralDecisionSchema,
    responses: { 200: mediaReferralView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.mediaReferrals.decide(principalOf(req), params.referralId, body)),
  });

  const work = { workId: uuid };
  const answers = { 200: mediaReferralView, 403: null, 404: null, 409: null, 422: null };

  defineRoute<WorkUpdate, unknown, { workId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/media-works/:workId',
    operationId: 'media.work.update',
    summary:
      'Move a work to another stage, or change its title, content type or script; the stage rules decide who may move it where',
    permission: 'media.work.manage',
    scope: 'application',
    audit: 'media.work_changed',
    params: work,
    headers: [{ name: 'If-Match', required: true }],
    body: workUpdateSchema,
    responses: { ...answers, 412: null },
    handler: async ({ params, body, req }) =>
      ok(await c.mediaWorks.update(principalOf(req), params.workId, body, req.get('if-match'))),
  });

  defineRoute<MembersBody, unknown, { workId: string }>(router, deps, {
    ...op,
    method: 'put',
    path: '/media-works/:workId/members',
    operationId: 'media.work.members',
    summary:
      'Set the whole team of a work, each member with one or more production roles; the directors only',
    permission: 'media.work.manage',
    scope: 'application',
    audit: 'media.members_changed',
    params: work,
    body: membersSchema,
    responses: answers,
    handler: async ({ params, body, req }) =>
      ok(await c.mediaWorks.setMembers(principalOf(req), params.workId, body)),
  });

  defineRoute<PublicationCreate, unknown, { workId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/media-works/:workId/publications',
    status: 201,
    operationId: 'media.publication.create',
    summary:
      "Add a publication of a work on a platform; its link must be on the platform's own host, and published only after the final review",
    permission: 'media.work.manage',
    scope: 'application',
    audit: 'media.publication_added',
    params: work,
    body: publicationCreateSchema,
    responses: { 201: mediaReferralView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.mediaWorks.addPublication(principalOf(req), params.workId, body)),
  });

  defineRoute<PublicationUpdate, unknown, { publicationId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/media-publications/:publicationId',
    operationId: 'media.publication.update',
    summary: "Change a publication's state, date, link or note",
    permission: 'media.work.manage',
    scope: 'application',
    audit: 'media.publication_changed',
    params: { publicationId: uuid },
    body: publicationUpdateSchema,
    responses: answers,
    handler: async ({ params, body, req }) =>
      ok(await c.mediaWorks.updatePublication(principalOf(req), params.publicationId, body)),
  });

  defineRoute<ReviewBody, unknown, { workId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/media-works/:workId/final-review',
    operationId: 'media.work.review',
    summary:
      'The final review of a work ready to publish: approve it, or send it back to the team with a comment',
    permission: 'media.publication.review',
    scope: 'application',
    audit: 'media.review_decided',
    params: work,
    body: reviewSchema,
    responses: answers,
    handler: async ({ params, body, req }) =>
      ok(await c.mediaWorks.review(principalOf(req), params.workId, body)),
  });

  defineRoute<{ body: string }, unknown, { workId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/media-works/:workId/comments',
    status: 201,
    operationId: 'media.work.comment',
    summary: 'Add a comment to a work, for everyone who reads it',
    permission: 'media.work.view',
    scope: 'application',
    audit: 'media.comment_added',
    params: work,
    body: commentSchema,
    responses: { 201: mediaReferralView, 403: null, 404: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.mediaWorks.comment(principalOf(req), params.workId, body.body)),
  });

  return router;
}
