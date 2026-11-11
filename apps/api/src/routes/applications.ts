import { APPLICATION_ACTIONS, type ApplicationAction } from '@css/shared';
import { type Response, Router } from 'express';
import { z } from 'zod';
import {
  type ApplicationActionBody,
  applicationActionSchema,
  type ApplicationCreate,
  applicationCreateSchema,
  type ApplicationFilter,
  applicationFilterSchema,
  applicationSummary,
  type ApplicationUpdate,
  applicationUpdateSchema,
  applicationView,
} from '../applications/view.js';
import { activityView } from '../applications/activities.js';
import { type BulkReview, bulkResponse, bulkReviewSchema } from '../applications/bulk.js';
import { fieldChangeView, timelineEntry } from '../applications/history.js';
import type { ApplicationRead } from '../applications/service.js';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { etagOf } from '../core/etag.js';
import {
  type PageNumberQuery,
  type PageQuery,
  pageNumberQuery,
  pageQuery,
} from '../core/pagination.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import type { Replayable } from '../services/uploads.js';
import { versionView } from './forms.js';
import { type PullNext, pullNextSchema } from '../applications/waitlist.js';
import {
  type TransferRequest,
  transferCandidate,
  transferResult,
  transferSchema,
} from '../applications/transfers.js';
import { unlockView } from '../applications/unlocks.js';
import {
  type UnlockCancel,
  unlockCancelSchema,
  type UnlockDecisionRequest,
  unlockDecisionSchema,
  type UnlockOpen,
  unlockOpenSchema,
  type UnlockValue,
  unlockValueSchema,
} from '@css/shared/forms';

const uuid = z.uuid();
const ifMatch = [{ name: 'If-Match', required: true }];
const listQuery = pageQuery.extend(pageNumberQuery.shape).extend(applicationFilterSchema.shape);
const ACTIONS = Object.keys(APPLICATION_ACTIONS) as [ApplicationAction, ...ApplicationAction[]];

const viewerOf = (req: AuthedRequest) => ({
  principal: principalOf(req),
  scope: scopeOf(req),
  fieldClasses: req.fieldClasses ?? new Set<string>(),
});

/**
 * The applications of a project (openapi tag applications): the list within the caller's scope,
 * the draft with the person resolved on the server, the read with the actions the caller may
 * take, the edit by state and the workflow actions through the engine.
 */
export function applicationsRouter(
  deps: RouteDeps,
  c: Pick<
    Container,
    'applications' | 'bulkReview' | 'idempotency' | 'transfers' | 'unlocks' | 'waitlist'
  >,
): Router {
  const router = Router();
  const op = { tag: 'applications', idempotency: 'none' as const, rateLimit: 'default' as const };
  /** The version the next write carries back in If-Match. */
  const withEtag = (result: ApplicationRead, res: Response) => {
    const etag = etagOf(result.updatedAt);
    res.setHeader('ETag', etag);
    return ok(result.application, { etag });
  };
  /** Answers 200 with `Idempotent-Replay` when the request repeated an earlier one. */
  const answer = <T>(res: Response, result: Replayable<T>): T => {
    if (result.replay) c.idempotency.markReplay(res);
    return result.value;
  };

  defineRoute<unknown, ApplicationFilter & PageQuery & PageNumberQuery, { projectId: string }>(
    router,
    deps,
    {
      ...op,
      method: 'get',
      path: '/projects/:projectId/applications',
      operationId: 'applications.application.list',
      summary:
        'Applications of a project within scope; review queue sorted by score when sort=-score',
      permission: 'application.view',
      scope: 'application',
      audit: 'none',
      sensitiveFields: ['application.official_section'],
      params: { projectId: uuid },
      query: listQuery,
      responses: { 200: z.array(applicationSummary), 400: null, 404: null },
      handler: async ({ params, query, req }) => {
        const { rows, meta } = await c.applications.list(viewerOf(req), params.projectId, query);
        return page(rows, meta);
      },
    },
  );

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/projects/:projectId/application-form',
    operationId: 'applications.applicationForm.get',
    summary:
      "The project's published application form as the caller's audience sees it, for the new application screen",
    permission: 'application.create',
    scope: 'project',
    audit: 'none',
    sensitiveFields: ['application.official_section'],
    params: { projectId: uuid },
    responses: { 200: versionView, 404: null, 422: null },
    handler: async ({ params, req }) =>
      ok(await c.applications.applicationForm(viewerOf(req), params.projectId)),
  });

  defineRoute<unknown, ApplicationFilter & PageQuery & PageNumberQuery>(router, deps, {
    ...op,
    method: 'get',
    path: '/me/applications',
    operationId: 'applications.mine.list',
    summary: "The caller's own applications across their projects, newest first",
    permission: 'application.view',
    scope: 'application',
    audit: 'none',
    sensitiveFields: ['application.official_section'],
    query: listQuery,
    responses: { 200: z.array(applicationSummary), 400: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.applications.listMine(viewerOf(req), query);
      return page(rows, meta);
    },
  });

  defineRoute<ApplicationCreate, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/applications',
    status: 201,
    operationId: 'applications.application.create',
    summary:
      'Create a draft application (same endpoint online and offline; clientUuid is the idempotency key)',
    permission: 'application.create',
    scope: 'project',
    audit: 'application.create',
    idempotency: 'clientUuid',
    sensitiveFields: ['application.official_section', 'beneficiary.nid', 'beneficiary.contact'],
    params: { projectId: uuid },
    body: applicationCreateSchema,
    responses: { 200: applicationView, 201: applicationView, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req, res }) =>
      withEtag(
        answer(res, await c.applications.create(viewerOf(req), params.projectId, body)),
        res,
      ),
  });

  defineRoute<unknown, unknown, { appNo: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/application-numbers/:appNo',
    operationId: 'applications.application.getByNumber',
    summary: 'Get an application by its human number',
    permission: 'application.view',
    scope: 'application',
    audit: 'none',
    sensitiveFields: ['application.official_section', 'beneficiary.nid', 'beneficiary.contact'],
    params: { appNo: z.string().regex(/^[A-Z]{2,8}-[0-9]{4}-[0-9]{5}$/) },
    responses: { 200: applicationView, 404: null },
    handler: async ({ params, req, res }) =>
      withEtag(await c.applications.getByNumber(viewerOf(req), params.appNo), res),
  });

  defineRoute<unknown, unknown, { applicationId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/applications/:applicationId',
    operationId: 'applications.application.get',
    summary: 'Get an application with answers, warnings and the actions the caller may perform',
    permission: 'application.view',
    scope: 'application',
    audit: 'none',
    sensitiveFields: ['application.official_section', 'beneficiary.nid', 'beneficiary.contact'],
    params: { applicationId: uuid },
    responses: { 200: applicationView, 404: null },
    handler: async ({ params, req, res }) =>
      withEtag(await c.applications.get(viewerOf(req), params.applicationId), res),
  });

  defineRoute<ApplicationUpdate, unknown, { applicationId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/applications/:applicationId',
    operationId: 'applications.application.update',
    summary:
      'Edit answers; the permission depends on the state (draft - application.edit_draft, submitted - application.edit_pending, under_review - application.review), per WORKFLOW_ENGINE section 3',
    permission: 'workflow',
    scope: 'application',
    audit: 'application.update',
    workflow: { scope: 'application', action: 'edit' },
    sensitiveFields: ['application.official_section', 'beneficiary.nid', 'beneficiary.contact'],
    headers: ifMatch,
    params: { applicationId: uuid },
    body: applicationUpdateSchema,
    responses: { 200: applicationView, 403: null, 404: null, 409: null, 412: null, 422: null },
    handler: async ({ params, body, req, res }) =>
      withEtag(
        await c.applications.update(viewerOf(req), params.applicationId, body, req.get('if-match')),
        res,
      ),
  });

  defineRoute<ApplicationActionBody, unknown, { applicationId: string; action: ApplicationAction }>(
    router,
    deps,
    {
      ...op,
      method: 'post',
      path: '/applications/:applicationId/actions/:action',
      operationId: 'applications.application.act',
      summary:
        "Perform a workflow action; the engine checks the transition's permission, guards and effects (submit, review, send_for_approval, approve, reject, waitlist, pull_from_waitlist, delete, verify_link, reject_unverified)",
      permission: 'workflow',
      scope: 'application',
      audit: 'application.<action>',
      workflow: { scope: 'application', action: 'path' },
      sensitiveFields: ['application.official_section', 'beneficiary.nid', 'beneficiary.contact'],
      headers: ifMatch,
      params: { applicationId: uuid, action: z.enum(ACTIONS) },
      body: applicationActionSchema,
      responses: { 200: applicationView, 403: null, 404: null, 409: null, 412: null, 422: null },
      handler: async ({ params, body, req, res }) =>
        withEtag(
          await c.applications.act(
            viewerOf(req),
            params.applicationId,
            params.action,
            body ?? {},
            req.get('if-match'),
          ),
          res,
        ),
    },
  );

  defineRoute<unknown, unknown, { applicationId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/applications/:applicationId/timeline',
    operationId: 'applications.timeline.list',
    summary:
      'The steps of the application in order (the audit entries of its state changes), projected per audience',
    permission: 'application.view',
    scope: 'application',
    audit: 'none',
    sensitiveFields: ['application.official_section'],
    params: { applicationId: uuid },
    responses: { 200: z.array(timelineEntry), 404: null },
    handler: async ({ params, req }) =>
      ok(await c.applications.timeline(viewerOf(req), params.applicationId)),
  });

  defineRoute<unknown, { limit: number; cursor?: string }, { applicationId: string }>(
    router,
    deps,
    {
      ...op,
      method: 'get',
      path: '/applications/:applicationId/changes',
      operationId: 'applications.change.list',
      summary: 'Change log of the application (old and new values, who, why)',
      permission: 'application.view_official_section',
      scope: 'application',
      audit: 'none',
      params: { applicationId: uuid },
      query: pageQuery.pick({ cursor: true, limit: true }),
      responses: { 200: z.array(fieldChangeView), 404: null },
      handler: async ({ params, query, req }) => {
        const { rows, meta } = await c.applications.changes(
          viewerOf(req),
          params.applicationId,
          query,
        );
        return page(rows, meta);
      },
    },
  );

  defineRoute<UnlockOpen, unknown, { applicationId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/applications/:applicationId/unlocks',
    status: 201,
    operationId: 'applications.unlock.open',
    summary:
      'Open one answer of an approved application for correction, with a reason; the identity, photos, files and calculated answers never open, and one unlock per answer waits at a time',
    permission: 'application.unlock_field',
    scope: 'application',
    audit: 'application.unlock_opened',
    params: { applicationId: uuid },
    body: unlockOpenSchema,
    responses: { 201: unlockView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.unlocks.open(principalOf(req), params.applicationId, body)),
  });

  defineRoute<UnlockValue, unknown, { unlockId: string }>(router, deps, {
    ...op,
    method: 'put',
    path: '/application-unlocks/:unlockId/value',
    operationId: 'applications.unlock.fill',
    summary:
      "Enter the new value of an open answer: the owner volunteer (application.update_unlocked_field), or an official of the unlock scope (application.unlock_field) when the application has no volunteer or the answer is the official section's",
    permission: 'workflow',
    scope: 'application',
    audit: 'application.unlock_entered',
    workflow: { scope: 'field_unlock', action: 'fill' },
    params: { unlockId: uuid },
    body: unlockValueSchema,
    responses: { 200: unlockView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.unlocks.fill(principalOf(req), params.unlockId, body)),
  });

  defineRoute<UnlockDecisionRequest, unknown, { unlockId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/application-unlocks/:unlockId/decision',
    operationId: 'applications.unlock.decide',
    summary:
      'Accept the entered value (the answer changes and locks again) or refuse it with a reason (the old value stays); never by the person who entered it',
    permission: 'application.unlock_field',
    scope: 'application',
    audit: 'application.unlock_decided',
    params: { unlockId: uuid },
    body: unlockDecisionSchema,
    responses: { 200: unlockView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.unlocks.decide(principalOf(req), params.unlockId, body)),
  });

  defineRoute<UnlockCancel, unknown, { unlockId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/application-unlocks/:unlockId/cancel',
    operationId: 'applications.unlock.cancel',
    summary: 'Cancel an unlock that waits for a step, with a reason; the old value stays',
    permission: 'application.unlock_field',
    scope: 'application',
    audit: 'application.unlock_cancelled',
    params: { unlockId: uuid },
    body: unlockCancelSchema,
    responses: { 200: unlockView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.unlocks.cancel(principalOf(req), params.unlockId, body)),
  });

  defineRoute<unknown, unknown, { projectId: string; volunteerId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/projects/:projectId/volunteers/:volunteerId/applications',
    operationId: 'applications.transfer.candidates',
    summary:
      "A volunteer's applications on the project that the caller may hand to another volunteer (the transfer's picker)",
    permission: 'application.transfer',
    scope: 'application',
    audit: 'none',
    params: { projectId: uuid, volunteerId: uuid },
    responses: { 200: z.array(transferCandidate), 403: null },
    handler: async ({ params, req }) =>
      ok(await c.transfers.candidates(principalOf(req), params.projectId, params.volunteerId)),
  });

  defineRoute<TransferRequest, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/transfers',
    operationId: 'applications.transfer.create',
    summary:
      "Hand all or chosen applications of one volunteer to another on an active project, with a reason; optionally move the old volunteer's team and assign the new volunteer in the same request",
    permission: 'application.transfer',
    scope: 'application',
    audit: 'application.transfer',
    idempotency: 'header',
    rateLimit: 'sync',
    headers: [{ name: 'Idempotency-Key', required: true }],
    params: { projectId: uuid },
    body: transferSchema,
    responses: { 200: transferResult, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req, res }) => {
      const outcome = await c.transfers.transfer(
        principalOf(req),
        params.projectId,
        req.get('idempotency-key'),
        body,
      );
      if (outcome.replay) c.idempotency.markReplay(res);
      return ok(outcome.result);
    },
  });

  defineRoute<BulkReview, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/bulk/review',
    operationId: 'applications.bulk.review',
    summary:
      'The review screen in bulk: up to 50 applications start their review or take their approval, each row on its own (API_STANDARDS section 13)',
    permission: 'workflow',
    scope: 'application',
    audit: 'application.bulk_review',
    idempotency: 'header',
    rateLimit: 'sync',
    workflow: { scope: 'application', action: 'body' },
    headers: [{ name: 'Idempotency-Key', required: true }],
    params: { projectId: uuid },
    body: bulkReviewSchema,
    responses: { 200: bulkResponse, 403: null, 404: null, 422: null },
    handler: async ({ params, body, req, res }) => {
      const outcome = await c.bulkReview.run(
        principalOf(req),
        params.projectId,
        req.get('idempotency-key'),
        body,
      );
      if (outcome.replay) c.idempotency.markReplay(res);
      return ok({ results: outcome.results });
    },
  });

  defineRoute<PullNext, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/waitlist/pull-next',
    operationId: 'applications.waitlist.pullNext',
    summary:
      'Pull the next waitlisted application of a quota area into approved: the highest score, then the earliest waitlisted',
    permission: 'application.waitlist',
    scope: 'application',
    audit: 'application.pull_from_waitlist',
    idempotency: 'header',
    rateLimit: 'sync',
    headers: [{ name: 'Idempotency-Key', required: true }],
    params: { projectId: uuid },
    body: pullNextSchema,
    responses: {
      200: z.object({ id: uuid, appNo: z.string().nullable() }),
      403: null,
      404: null,
      409: null,
      422: null,
    },
    handler: async ({ params, body, req, res }) => {
      const outcome = await c.waitlist.pullNext(
        principalOf(req),
        params.projectId,
        req.get('idempotency-key'),
        body,
      );
      if (outcome.replay) c.idempotency.markReplay(res);
      return ok(outcome.pulled);
    },
  });

  defineRoute<
    unknown,
    { limit: number; cursor?: string; type?: string },
    { applicationId: string }
  >(router, deps, {
    tag: 'activities',
    idempotency: 'none',
    rateLimit: 'default',
    method: 'get',
    path: '/applications/:applicationId/activities',
    operationId: 'activities.activity.listForApplication',
    summary: 'Activities of an application (timeline)',
    permission: 'application.view',
    scope: 'application',
    audit: 'none',
    params: { applicationId: uuid },
    query: pageQuery
      .pick({ cursor: true, limit: true })
      .extend({ type: z.string().max(40).optional() }),
    responses: { 200: z.array(activityView), 404: null },
    handler: async ({ params, query, req }) => {
      const { rows, meta } = await c.applications.activities(
        viewerOf(req),
        params.applicationId,
        query,
      );
      return page(rows, meta);
    },
  });

  return router;
}
