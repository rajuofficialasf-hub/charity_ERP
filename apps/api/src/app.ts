import express, { type Express, Router } from 'express';
import { BATCH_ENVELOPE_BYTES, BATCH_MAX_BYTES } from '@css/shared/sync';
import type { DestinationStream } from 'pino';
import { requireAccess } from './auth/require-access';
import type { Container } from './container';
import { requestContext } from './core/request-context.middleware';
import { healthRouter } from './health/routes';
import { errorHandler, notFound } from './http/errors';
import {
  corsAllowlist,
  originCheck,
  requestLogging,
  securityHeaders,
  trustProxySetting,
} from './http/security';
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
import { uploadsRouter } from './routes/uploads';
import { exportsRouter } from './routes/exports';
import { volunteersRouter } from './routes/volunteers';
import { applicationsRouter } from './routes/applications';
import { mediaRouter } from './routes/media';
import { syncRouter } from './routes/sync';
import { beneficiariesRouter } from './routes/beneficiaries';
import { programsRouter } from './routes/programs';
import { settingsRouter } from './routes/settings';
import { auditRouter } from './routes/audit';
import { adminSystemRouter } from './routes/admin-system';
import { openapiRouter } from './routes/openapi';
import { notificationsRouter } from './routes/notifications';
import { sessionMonitorRouter } from './routes/session-monitor';
import { projectsRouter } from './routes/projects';
import { projectSetupRouter } from './routes/project-setup';
import { myProjectsRouter } from './routes/my-projects';
import { projectVolunteersRouter } from './routes/project-volunteers';
import { templatesRouter } from './routes/templates';
import { formsRouter } from './routes/forms';
import { publicRouter } from './routes/public';
import { registrationsRouter } from './routes/registrations';

export const API_PREFIX = 'api/v1';

/** Bodies above this size are refused; the sync batch route sets its own limit. */
export const JSON_BODY_LIMIT = '100kb';
/** The offline batch: the records' limit plus the margin for the envelope around them. */
export const SYNC_BODY_LIMIT = BATCH_MAX_BYTES + BATCH_ENVELOPE_BYTES;
/** The routes that read their own, larger body after the access check. */
const LARGE_BODY_PATHS = new Set(['/api/v1/sync/batch']);

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
 * Builds the Express app from its services without listening (server.ts listens; tests build it the
 * same way). The order matters (docs/architecture/SYSTEM_ARCHITECTURE.md, "Request lifecycle (exact
 * order of checks)"): client address → logging → request context → security headers → CORS → the
 * origin check of writes → JSON → health probes → /api/v1 routes → 404 → errors.
 */
export function createApp(c: Container, options: AppOptions = {}): BuiltApp {
  const app = express();
  app.set('trust proxy', trustProxySetting(c.env.TRUST_PROXY));
  app.disable('x-powered-by');
  app.use(requestLogging(c.env, options.logStream));
  app.use(securityHeaders());
  app.use(corsAllowlist(c.env.ALLOWED_ORIGINS));
  app.use(originCheck(c.env.APP_ORIGIN, c.env.ALLOWED_ORIGINS));
  // the offline batch alone may carry a megabyte of records (and its envelope), parsed by its own
  // route once the caller and the rate limit have passed; every other body is read here
  const generalJson = express.json({ limit: JSON_BODY_LIMIT });
  app.use((req, res, next) =>
    LARGE_BODY_PATHS.has(req.path) ? next() : generalJson(req, res, next),
  );
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
  api.use(sessionMonitorRouter(deps, c));
  api.use(sessionsRouter(deps, c));
  api.use(usersRouter(deps, c));
  api.use(accessRouter(deps, c));
  api.use(locationsRouter(deps, c));
  api.use(filesRouter(deps, c));
  api.use(uploadsRouter(deps, c));
  api.use(exportsRouter(deps, c));
  api.use(volunteersRouter(deps, c));
  api.use(beneficiariesRouter(deps, c));
  api.use(applicationsRouter(deps, c));
  api.use(mediaRouter(deps, c));
  api.use(syncRouter(deps, c));
  api.use(programsRouter(deps, c));
  api.use(projectsRouter(deps, c));
  api.use(projectSetupRouter(deps, c));
  api.use(myProjectsRouter(deps, c));
  api.use(projectVolunteersRouter(deps, c));
  api.use(templatesRouter(deps, c));
  api.use(formsRouter(deps, c));
  api.use(publicRouter(deps, c));
  api.use(registrationsRouter(deps, c));
  api.use(settingsRouter(deps, c));
  api.use(auditRouter(deps, c));
  api.use(adminSystemRouter(deps, c));
  api.use(notificationsRouter(deps, c));
  // last: it describes every route registered above
  api.use(openapiRouter(deps, c.env));
  for (const build of options.extraRouters ?? []) api.use(build(deps));
  app.use(`/${API_PREFIX}`, api);

  app.use(notFound);
  app.use(errorHandler(c.logger));
  return { app, registry };
}
