import {
  type ReferralCreate,
  referralCreateSchema,
  type ReferralDecisionBody,
  referralDecisionSchema,
} from '@css/shared/media';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
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
export function mediaRouter(deps: RouteDeps, c: Pick<Container, 'mediaReferrals'>): Router {
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
      const { rows, meta } = await c.mediaReferrals.list(
        principalOf(req),
        scopeOf(req as AuthedRequest),
        query,
      );
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

  return router;
}
