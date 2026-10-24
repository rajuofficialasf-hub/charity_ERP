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
} from '../applications/view';
import { fieldChangeView, timelineEntry } from '../applications/history';
import type { ApplicationRead } from '../applications/service';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { etagOf } from '../core/etag';
import { type PageQuery, pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import type { Replayable } from '../services/uploads';

const uuid = z.uuid();
const ifMatch = [{ name: 'If-Match', required: true }];
const listQuery = pageQuery.extend(applicationFilterSchema.shape);
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
  c: Pick<Container, 'applications' | 'idempotency'>,
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

  defineRoute<unknown, ApplicationFilter & PageQuery, { projectId: string }>(router, deps, {
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
    sensitiveFields: ['application.official_section', 'beneficiary.nid'],
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
    summary: 'Get an application by its human number (O-03)',
    permission: 'application.view',
    scope: 'application',
    audit: 'none',
    sensitiveFields: ['application.official_section', 'beneficiary.nid'],
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
    sensitiveFields: ['application.official_section', 'beneficiary.nid'],
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
    sensitiveFields: ['application.official_section', 'beneficiary.nid'],
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
      sensitiveFields: ['application.official_section', 'beneficiary.nid'],
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

  return router;
}
