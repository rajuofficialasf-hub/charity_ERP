import express, { type Express, Router } from 'express';
import { BATCH_ENVELOPE_BYTES, BATCH_MAX_BYTES } from '@css/shared/sync';
import type { DestinationStream } from 'pino';
import { requireAccess } from './auth/require-access.js';
import type { Container } from './container.js';
import { requestContext } from './core/request-context.middleware.js';
import { healthRouter } from './health/routes.js';
import { errorHandler, notFound } from './http/errors.js';
import {
  corsAllowlist,
  originCheck,
  requestLogging,
  securityHeaders,
  trustProxySetting,
} from './http/security.js';
import type { RouteDeps } from './openapi/define-route.js';
import { RouteRegistry } from './openapi/registry.js';
import { createRateLimiters } from './rate-limit/limiters.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { sessionsRouter } from './routes/sessions.js';
import { accessRouter } from './routes/access.js';
import { usersRouter } from './routes/users.js';
import { locationsRouter } from './routes/locations.js';
import { filesRouter } from './routes/files.js';
import { uploadsRouter } from './routes/uploads.js';
import { exportsRouter } from './routes/exports.js';
import { volunteersRouter } from './routes/volunteers.js';
import { applicationsRouter } from './routes/applications.js';
import { mediaRouter } from './routes/media.js';
import { syncRouter } from './routes/sync.js';
import { beneficiariesRouter } from './routes/beneficiaries.js';
import { programsRouter } from './routes/programs.js';
import { settingsRouter } from './routes/settings.js';
import { auditRouter } from './routes/audit.js';
import { adminSystemRouter } from './routes/admin-system.js';
import { openapiRouter } from './routes/openapi.js';
import { notificationsRouter } from './routes/notifications.js';
import { sessionMonitorRouter } from './routes/session-monitor.js';
import { projectsRouter } from './routes/projects.js';
import { projectSetupRouter } from './routes/project-setup.js';
import { myProjectsRouter } from './routes/my-projects.js';
import { projectVolunteersRouter } from './routes/project-volunteers.js';
import { templatesRouter } from './routes/templates.js';
import { formsRouter } from './routes/forms.js';
import { publicRouter } from './routes/public.js';
import { registrationsRouter } from './routes/registrations.js';

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
