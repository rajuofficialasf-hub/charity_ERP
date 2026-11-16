import {
  PROJECT_STATUSES,
  type ProjectSeriesCreate,
  projectSeriesCreateSchema,
  type ProjectSeriesFilter,
  projectSeriesFilterSchema,
  type ProjectSeriesUpdate,
  projectSeriesUpdateSchema,
  type SessionCreate,
  sessionCreateSchema,
} from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { etagOf } from '../core/etag.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import { projectView } from './projects.js';

const uuid = z.uuid();
const count = z.number().int();
const label = z.object({ bn: z.string(), en: z.string() });

/** The officials a card names (at most three) and how many there are. */
export const cardPeople = z.object({
  people: z.array(z.object({ id: uuid, name: z.string(), photoFileId: uuid.nullable() })),
  total: count,
});

/** A project series as a card: counts, and the caller's own work only where the caller has any. */
const seriesCard = z.object({
  id: uuid,
  programId: uuid,
  code: z.string(),
  name: label,
  description: label.nullable(),
  sessionCount: count,
  beneficiaries: count,
  current: z
    .object({
      id: uuid,
      sessionLabel: z.string(),
      periodFrom: z.string(),
      periodTo: z.string(),
      status: z.enum(PROJECT_STATUSES),
      applyTo: z.string().nullable(),
      daysLeft: count.nullable(),
      target: count.nullable(),
      approved: count,
      applications: count,
      rpms: cardPeople,
      volunteers: count,
      districts: count,
    })
    .nullable(),
  todo: z
    .object({
      reviewsWaiting: count,
      waitlisted: count,
      budgetPlanned: z.string().nullable().optional(),
    })
    .optional(),
  canCreate: z.boolean(),
});

/** A series with its program and its sessions, newest first. */
const seriesDetail = seriesCard.extend({
  program: z.object({ id: uuid, name: label }),
  sessions: z.array(
    z.object({
      id: uuid,
      year: count,
      sessionLabel: z.string(),
      periodFrom: z.string(),
      periodTo: z.string(),
      status: z.enum(PROJECT_STATUSES),
      applications: count,
      approved: count,
      canOpen: z.boolean(),
    }),
  ),
});

const viewerOf = (req: AuthedRequest) => ({ principal: principalOf(req), scope: scopeOf(req) });
const withEtag = (
  res: { setHeader: (k: string, v: string) => void },
  r: { series: unknown; updatedAt: Date },
) => {
  const etag = etagOf(r.updatedAt);
  res.setHeader('ETag', etag);
  return ok(r.series, { etag });
};

/**
 * Project series (openapi tag project-series): every official who holds the overview reads the
 * projects as cards and one project with its sessions; whoever may create a project in a program
 * creates and renames its series.
 */
export function projectSeriesRouter(
  deps: RouteDeps,
  c: Pick<Container, 'projectSeries' | 'idempotency'>,
): Router {
  const router = Router();
  const op = { tag: 'project-series', scope: 'program', idempotency: 'none' as const };
  // the cards count across every session of every series: the budget of the nationwide lists
  const read = {
    ...op,
    permission: 'project.overview.view',
    audit: 'none',
    rateLimit: 'list' as const,
  };
  const write = { ...op, permission: 'project.create', rateLimit: 'default' as const };

  defineRoute<unknown, ProjectSeriesFilter>(router, deps, {
    ...read,
    method: 'get',
    path: '/project-series',
    operationId: 'projectSeries.series.list',
    summary: 'Project series as cards with counts, of one program or of all; not paginated',
    query: projectSeriesFilterSchema,
    responses: { 200: z.array(seriesCard), 401: null, 403: null, 422: null, 429: null, 503: null },
    handler: async ({ query, req }) => {
      // the whole list at once, in the list envelope every list answers with
      const rows = await c.projectSeries.list(viewerOf(req), query);
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<ProjectSeriesCreate>(router, deps, {
    ...write,
    method: 'post',
    path: '/project-series',
    status: 201,
    operationId: 'projectSeries.series.create',
    summary: 'Create a project series in a program of the caller',
    audit: 'project_series.create',
    body: projectSeriesCreateSchema,
    responses: { 201: seriesDetail, 401: null, 403: null, 409: null, 422: null },
    handler: async ({ body, req, res }) =>
      withEtag(res, await c.projectSeries.create(viewerOf(req), body)),
  });

  defineRoute<unknown, unknown, { seriesId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/project-series/:seriesId',
    operationId: 'projectSeries.series.get',
    summary: 'A project series with its sessions, newest first',
    params: { seriesId: uuid },
    responses: { 200: seriesDetail, 401: null, 403: null, 404: null, 429: null, 503: null },
    handler: async ({ params, req, res }) =>
      withEtag(res, await c.projectSeries.get(viewerOf(req), params.seriesId)),
  });

  defineRoute<ProjectSeriesUpdate, unknown, { seriesId: string }>(router, deps, {
    ...write,
    method: 'patch',
    path: '/project-series/:seriesId',
    operationId: 'projectSeries.series.update',
    summary: 'Rename a project series or change its description; its sessions are renamed with it',
    audit: 'project_series.update',
    params: { seriesId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: projectSeriesUpdateSchema,
    responses: {
      200: seriesDetail,
      401: null,
      403: null,
      404: null,
      412: null,
      422: null,
    },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.projectSeries.update(viewerOf(req), params.seriesId, body, req.get('if-match')),
      ),
  });

  defineRoute<SessionCreate, unknown, { seriesId: string }>(router, deps, {
    ...write,
    method: 'post',
    path: '/project-series/:seriesId/sessions',
    status: 201,
    operationId: 'projectSeries.session.create',
    summary:
      'Start a new session of a project series as a draft that copies the setup of an earlier session',
    audit: 'project.create',
    idempotency: 'header',
    headers: [{ name: 'Idempotency-Key', required: true }],
    params: { seriesId: uuid },
    body: sessionCreateSchema,
    responses: {
      200: projectView,
      201: projectView,
      401: null,
      403: null,
      404: null,
      409: null,
      422: null,
    },
    handler: async ({ body, params, req, res }) => {
      const made = await c.projectSeries.newSession(
        viewerOf(req),
        params.seriesId,
        req.get('idempotency-key'),
        body,
      );
      // a repeat of the request answers the session it made the first time
      if (made.replay) c.idempotency.markReplay(res);
      const etag = etagOf(made.updatedAt);
      res.setHeader('ETag', etag);
      return ok(made.project, { etag });
    },
  });

  return router;
}
