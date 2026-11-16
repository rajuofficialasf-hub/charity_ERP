import {
  type ProgramCreate,
  programCreateSchema,
  type ProgramPm,
  programPmSchema,
  type ProgramUpdate,
  programUpdateSchema,
} from '@css/shared/projects';
import { type CoverSet, coverSetSchema } from '@css/shared/files';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { etagOf } from '../core/etag.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import { cardPeople, coverView } from './project-series.js';

const uuid = z.uuid();
const programView = z.object({
  id: uuid,
  code: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  description: z.object({ bn: z.string(), en: z.string() }).nullable(),
  pmUserId: uuid.nullable(),
  pmName: z.string().nullable(),
  active: z.boolean(),
});
const count = z.number().int();
/** A program as a card: counts, and the caller's own work only where the caller has any. */
const programCard = z.object({
  id: uuid,
  code: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  description: z.object({ bn: z.string(), en: z.string() }).nullable(),
  coverFileId: uuid.nullable(),
  active: z.boolean(),
  pm: z.object({ id: uuid, name: z.string() }).nullable(),
  rpms: cardPeople,
  projects: count,
  runningProjects: count,
  beneficiaries: count,
  applications: count,
  volunteers: count,
  todo: z.object({ reviewsWaiting: count, waitlisted: count }).optional(),
  canCreate: z.boolean(),
});
const programOp = {
  tag: 'programs',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/**
 * Programs (openapi tag programs): officials read the programs in their scope;
 * the Department Head creates, renames, deactivates and activates them, assigns their PM and sets
 * their cover photo.
 */
export function programsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'programs' | 'programCards' | 'covers'>,
): Router {
  const router = Router();
  const withEtag = (
    res: { setHeader: (k: string, v: string) => void },
    r: { program: unknown; updatedAt: Date },
  ) => {
    const etag = etagOf(r.updatedAt);
    res.setHeader('ETag', etag);
    return ok(r.program, { etag });
  };

  defineRoute(router, deps, {
    ...programOp,
    method: 'get',
    path: '/programs',
    operationId: 'programs.program.list',
    summary: 'Programs in the caller scope (officials only); not paginated',
    permission: 'program.view',
    scope: 'program',
    audit: 'none',
    responses: { 200: z.array(programView), 401: null, 403: null },
    handler: async ({ req }) => {
      // the whole list at once, in the list envelope every list answers with
      const rows = await c.programs.list(scopeOf(req));
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute(router, deps, {
    ...programOp,
    method: 'get',
    path: '/program-cards',
    operationId: 'programs.program.cards',
    summary: 'Every program as a card with counts only (officials who hold the overview)',
    permission: 'project.overview.view',
    scope: 'program',
    audit: 'none',
    // the cards count across every session of every program: the budget of the nationwide lists
    rateLimit: 'list',
    responses: { 200: z.array(programCard), 401: null, 403: null, 429: null, 503: null },
    handler: async ({ req }) => {
      const authed = req as AuthedRequest;
      const rows = await c.programCards.list({
        principal: principalOf(authed),
        scope: scopeOf(authed),
      });
      // the whole list at once, in the list envelope every list answers with
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<ProgramCreate>(router, deps, {
    ...programOp,
    method: 'post',
    path: '/programs',
    status: 201,
    operationId: 'programs.program.create',
    summary: 'Create a program (Department Head)',
    permission: 'program.create',
    scope: 'global',
    audit: 'program.create',
    body: programCreateSchema,
    responses: { 201: programView, 401: null, 403: null, 409: null, 422: null },
    handler: async ({ body, req, res }) =>
      withEtag(res, await c.programs.create(principalOf(req), body)),
  });

  defineRoute<unknown, unknown, { programId: string }>(router, deps, {
    ...programOp,
    method: 'get',
    path: '/programs/:programId',
    operationId: 'programs.program.get',
    summary: 'Get a program',
    permission: 'program.view',
    scope: 'program',
    audit: 'none',
    params: { programId: uuid },
    responses: { 200: programView, 401: null, 403: null, 404: null },
    handler: async ({ params, req, res }) =>
      withEtag(res, await c.programs.get(scopeOf(req), params.programId)),
  });

  defineRoute<ProgramUpdate, unknown, { programId: string }>(router, deps, {
    ...programOp,
    method: 'patch',
    path: '/programs/:programId',
    operationId: 'programs.program.update',
    summary: 'Rename a program, describe it, deactivate it or activate it again (never deleted)',
    permission: 'program.update',
    scope: 'global',
    audit: 'program.update',
    params: { programId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: programUpdateSchema,
    responses: {
      200: programView,
      401: null,
      403: null,
      404: null,
      409: null,
      412: null,
      422: null,
    },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.programs.update(
          principalOf(req),
          scopeOf(req),
          params.programId,
          body,
          req.get('if-match'),
        ),
      ),
  });

  defineRoute<CoverSet, unknown, { programId: string }>(router, deps, {
    ...programOp,
    method: 'put',
    path: '/programs/:programId/cover',
    operationId: 'programs.program.setCover',
    summary:
      "Set a program's cover photo from the caller's own finished cover upload; the earlier cover's file is kept",
    permission: 'program.update',
    scope: 'global',
    audit: 'program.cover_changed',
    params: { programId: uuid },
    body: coverSetSchema,
    responses: { 200: coverView, 401: null, 403: null, 404: null, 422: null },
    handler: ({ body, params, req }) =>
      c.covers.set(
        { principal: principalOf(req), scope: scopeOf(req) },
        'program',
        params.programId,
        body.fileId,
      ),
  });

  defineRoute<ProgramPm, unknown, { programId: string }>(router, deps, {
    ...programOp,
    method: 'post',
    path: '/programs/:programId/pm',
    operationId: 'programs.program.assignPm',
    summary: 'Assign the Program Manager',
    permission: 'program.assign_pm',
    scope: 'global',
    audit: 'program.assign_pm',
    params: { programId: uuid },
    body: programPmSchema,
    responses: { 200: programView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.programs.assignPm(principalOf(req), scopeOf(req), params.programId, body.pmUserId),
      ),
  });

  return router;
}
