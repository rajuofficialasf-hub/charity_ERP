import { languageRequestSchema, type LanguageRequest } from '@css/shared/auth';
import { Router } from 'express';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

/** The signed-in user's own settings (openapi tag auth, `/me/...`). */
export function meRouter(deps: RouteDeps, c: Pick<Container, 'auth'>): Router {
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

  return router;
}
