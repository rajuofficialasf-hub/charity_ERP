import {
  type ProgramCreate,
  programCreateSchema,
  type ProgramPm,
  programPmSchema,
  type ProgramUpdate,
  programUpdateSchema,
} from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { etagOf } from '../core/etag.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const uuid = z.uuid();
const programView = z.object({
  id: uuid,
  code: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  pmUserId: uuid.nullable(),
  pmName: z.string().nullable(),
  active: z.boolean(),
});
const programOp = {
  tag: 'programs',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/**
 * Programs (openapi tag programs): officials read the programs in their scope;
 * the Department Head creates, renames, deactivates and activates them and assigns their PM.
 */
export function programsRouter(deps: RouteDeps, c: Pick<Container, 'programs'>): Router {
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
    summary: 'Rename a program, deactivate it or activate it again (never deleted)',
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
