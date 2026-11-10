import { type Response, Router } from 'express';
import type { HealthService, HealthStatus } from './service.js';

/** The probe paths, also left out of the request log (core/logging.ts). */
export const PROBE_PATHS = ['/api/v1/healthz', '/api/v1/livez', '/api/v1/readyz'] as const;

function answer(res: Response, code: number, status: HealthStatus): void {
  res
    .status(code)
    .set('Cache-Control', 'no-store')
    .type('application/health+json')
    .send(JSON.stringify({ status }));
}

/**
 * The probes in the IETF health check format, without authentication and before the rate limiters:
 * liveness never touches a dependency, so an outage elsewhere never gets a healthy API restarted;
 * readiness is what the proxy and the deploy scripts wait on.
 */
export function healthRouter(health: HealthService): Router {
  const router = Router();
  const live = (_req: unknown, res: Response) => answer(res, 200, 'pass');
  for (const path of ['/api/v1/healthz', '/api/v1/livez']) router.head(path, live).get(path, live);

  // Express passes a rejected handler to the error handler
  const ready = async (_req: unknown, res: Response) => {
    const status = await health.readiness();
    answer(res, status === 'fail' ? 503 : 200, status);
  };
  router.head('/api/v1/readyz', ready).get('/api/v1/readyz', ready);
  return router;
}
