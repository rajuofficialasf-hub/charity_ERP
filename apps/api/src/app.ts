import express, { type Express, Router } from 'express';
import type { DestinationStream } from 'pino';
import { requireAccess } from './auth/require-access';
import type { Container } from './container';
import { requestContext } from './core/request-context.middleware';
import { healthRouter } from './health/routes';
import { errorHandler, notFound } from './http/errors';
import { corsAllowlist, requestLogging, securityHeaders, trustProxySetting } from './http/security';
import type { RouteDeps } from './openapi/define-route';
import { RouteRegistry } from './openapi/registry';
import { createRateLimiters } from './rate-limit/limiters';
import { authRouter } from './routes/auth';
import { meRouter } from './routes/me';
import { sessionsRouter } from './routes/sessions';
import { accessRouter } from './routes/access';
import { usersRouter } from './routes/users';
import { locationsRouter } from './routes/locations';
import { filesRouter } from './routes/files';

export const API_PREFIX = 'api/v1';

/** Bodies above this size are refused (NE-REQ-02); the sync batch route sets its own limit. */
export const JSON_BODY_LIMIT = '100kb';

export interface AppOptions {
  /** Test hook: where log lines go (default stdout). */
  logStream?: DestinationStream;
  /** Routers mounted under /api/v1 after the built-in ones (test probes), built with the route deps. */
  extraRouters?: ((deps: RouteDeps) => Router)[];
}

/** The app plus the registry its routes were declared in (OpenAPI generation, drift test). */
export interface BuiltApp {
  app: Express;
  registry: RouteRegistry;
}

/**
 * Builds the Express app from its services without listening (server.ts listens; tests build it
 * the same way). The order matters (SYSTEM_ARCHITECTURE 6): client address → logging → request
 * context → security headers → CORS → JSON → health probes → /api/v1 routes → 404 → errors.
 */
export function createApp(c: Container, options: AppOptions = {}): BuiltApp {
  const app = express();
  app.set('trust proxy', trustProxySetting(c.env.TRUST_PROXY));
  app.disable('x-powered-by');
  app.use(requestLogging(c.env, options.logStream));
  app.use(securityHeaders());
  app.use(corsAllowlist(c.env.CORS_ORIGINS));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  // The request context opens after the body is read: body-parser continues from the socket's
  // events, which would leave an AsyncLocalStorage context opened earlier behind. Body-parser
  // errors render with the X-Request-Id header instead of the context.
  app.use(requestContext());
  // Probes come before the limiters, so a busy client cannot make the API look down.
  app.use(healthRouter(c.health));

  const registry = new RouteRegistry();
  const deps: RouteDeps = {
    registry,
    limiters: createRateLimiters(c.env),
    logger: c.logger,
    permissions: c.accessRegistry,
    access: requireAccess({
      tokens: c.tokens,
      sessions: c.sessions,
      access: c.access,
      clock: c.clock,
      logger: c.logger,
    }),
  };
  const api = Router();
  api.use(authRouter(deps, c));
  api.use(meRouter(deps, c));
  api.use(sessionsRouter(deps, c));
  api.use(usersRouter(deps, c));
  api.use(accessRouter(deps, c));
  api.use(locationsRouter(deps, c));
  api.use(filesRouter(deps, c));
  for (const build of options.extraRouters ?? []) api.use(build(deps));
  app.use(`/${API_PREFIX}`, api);

  app.use(notFound);
  app.use(errorHandler(c.logger));
  return { app, registry };
}
