import { Router } from 'express';
import type { Env } from '../config/env';
import { buildOpenApiDocument } from '../openapi/build-document';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

/**
 * Who may read the API's description: everyone in development, tests and staging, where the web
 * app's contract test reads it, and only a signed-in person in production, so a stranger does not
 * get the map of the admin and permission routes (docs/DECISION_LOG.md, D-168).
 */
export function openApiAccess(nodeEnv: Env['NODE_ENV']): 'public' | 'authenticated' {
  return nodeEnv === 'production' ? 'authenticated' : 'public';
}

/**
 * The OpenAPI document of every registered route, built from the route registry on the first call
 * (every router is registered by then, and the registry does not change while the process runs).
 * Shapes only, never data. Register it after the other routers.
 */
export function openapiRouter(deps: RouteDeps, env: Pick<Env, 'NODE_ENV'>): Router {
  const router = Router();
  let document: ReturnType<typeof buildOpenApiDocument> | undefined;
  defineRoute(router, deps, {
    tag: 'reference',
    method: 'get',
    path: '/openapi.json',
    operationId: 'reference.openapi.get',
    summary: 'The OpenAPI document of every route, for the web app’s contract test',
    permission: openApiAccess(env.NODE_ENV),
    scope: 'system',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'reference-read',
    responses: { 200: null, 401: null, 429: null },
    handler: ({ res }) => {
      document ??= buildOpenApiDocument(deps.registry);
      res.json(document);
    },
  });
  return router;
}
