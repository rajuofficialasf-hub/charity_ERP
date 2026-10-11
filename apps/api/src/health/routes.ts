import { Router } from 'express';
import type { HealthService } from './service';

/**
 * Liveness and readiness probes for Caddy and the IT team's uptime check (SYSTEM_ARCHITECTURE 10).
 * Served outside the /api/v1 prefix, outside the API contract and without rate limits.
 */
export function healthRouter(health: HealthService): Router {
  const router = Router();
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'up' });
  });
  router.get('/health/ready', async (req, res, next) => {
    try {
      const { ready, checks } = await health.readiness();
      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        ...(health.authorized(req.headers.authorization) ? { checks } : {}),
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
