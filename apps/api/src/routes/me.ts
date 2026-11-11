import { languageRequestSchema, type LanguageRequest } from '@css/shared/auth';
import { Router } from 'express';
import { principalOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

/** The signed-in user's own settings (openapi tag auth, `/me/...`). */
export function meRouter(
  deps: RouteDeps,
  c: Pick<Container, 'auth' | 'attention' | 'ownProfile' | 'projectsWork'>,
): Router {
  const router = Router();

  defineRoute<LanguageRequest>(router, deps, {
    method: 'put',
    path: '/me/language',
    status: 204,
    operationId: 'auth.me.language.set',
    tag: 'auth',
    summary: 'Set own interface language (users.language, I18N 2)',
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

  defineRoute(router, deps, {
    method: 'get',
    path: '/me/profile',
    operationId: 'auth.me.profile',
    tag: 'auth',
    summary: "An official's own profile: identity, workplace, contact and account",
    permission: 'authenticated',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: null, 401: null, 404: null },
    handler: async ({ req }) => ok(await c.ownProfile.read(principalOf(req))),
  });

  defineRoute(router, deps, {
    method: 'get',
    path: '/me/projects-work',
    operationId: 'auth.me.projectsWork',
    tag: 'auth',
    summary: "An official's own projects by year with the figures of their work there",
    permission: 'authenticated',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: null, 401: null, 404: null, 503: null },
    handler: async ({ req }) => ok(await c.projectsWork.own(principalOf(req))),
  });

  return router;
}
