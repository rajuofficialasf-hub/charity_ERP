import express, { type Express, Router } from 'express';
import type { DestinationStream } from 'pino';
import type { Container } from './container';
import { RequestContextMiddleware } from './core/request-context.middleware';
import { healthRouter } from './health/routes';
import { errorHandler, notFound } from './http/errors';
import { corsAllowlist, requestLogging, securityHeaders, trustProxySetting } from './http/security';

export const API_PREFIX = 'api/v1';

/** Bodies above this size are refused (NE-REQ-02); the sync batch route sets its own limit. */
export const JSON_BODY_LIMIT = '100kb';

export interface AppOptions {
  /** Test hook: where log lines go (default stdout). */
  logStream?: DestinationStream;
  /** Routers mounted under /api/v1 after the built-in ones (test probes). */
  extraRouters?: Router[];
}

/**
 * Builds the Express app from its services without listening (server.ts listens; tests build it
 * the same way). The order matters (SYSTEM_ARCHITECTURE 6): client address → logging → request
 * context → security headers → CORS → JSON → health probes → /api/v1 routes → 404 → errors.
 */
export function createApp(c: Container, options: AppOptions = {}): Express {
  const app = express();
  app.set('trust proxy', trustProxySetting(c.env.TRUST_PROXY));
  app.disable('x-powered-by');
  app.use(requestLogging(c.env, options.logStream));
  app.use((req, res, next) => new RequestContextMiddleware().use(req, res, next));
  app.use(securityHeaders());
  app.use(corsAllowlist(c.env.CORS_ORIGINS));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  // Probes come before the limiters, so a busy client cannot make the API look down.
  app.use(healthRouter(c.health));

  const api = Router();
  for (const router of options.extraRouters ?? []) api.use(router);
  app.use(`/${API_PREFIX}`, api);

  app.use(notFound);
  app.use(errorHandler(c.logger));
  return app;
}
