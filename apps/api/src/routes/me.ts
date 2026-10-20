import { languageRequestSchema, type LanguageRequest } from '@css/shared/auth';
import { Router } from 'express';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { ok } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

/** The signed-in user's own settings (openapi tag auth, `/me/...`). */
export function meRouter(deps: RouteDeps, c: Pick<Container, 'auth' | 'attention'>): Router {
  const router = Router();

  defineRoute<LanguageRequest>(router, deps, {
    method: 'put',
    path: '/me/language',
    status: 204,
    operationId: 'auth.me.language.set',
    tag: 'auth',
    summary: 'Set own interface language (users.language, I18N 2, O-56)',
    permission: 'authenticated',
    scope: 'self',
    allowPending: true,
    allowPasswordChange: true,
    audit: 'user.language_changed',
    idempotency: 'none',
    rateLimit: 'default',
    body: languageRequestSchema,
    responses: { 204: null, 401: null, 422: null },
    handler: ({ body, req }) => c.auth.setLanguage(principalOf(req), body.language),
  });

  defineRoute(router, deps, {
    method: 'get',
    path: '/me/attention',
    operationId: 'auth.me.attention',
    tag: 'auth',
    summary:
      'What needs the caller now, counted per kind for their own work and the records their roles reach',
    permission: 'authenticated',
    scope: 'self',
    // a pending registrant sees the corrections asked of them
    allowPending: true,
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: null, 401: null },
    handler: async ({ req }) => {
      const items = await c.attention.items(principalOf(req));
      return ok(items, { limit: items.length, nextCursor: null, prevCursor: null });
    },
  });

  return router;
}
