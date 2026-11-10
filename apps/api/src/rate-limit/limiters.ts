import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env';
import { ApiError } from '../i18n/api-error';
import { RATE_LIMITS, type RateLimitClass, type RateWindow } from './rate-limit';

/**
 * Limiter chains of the rate-limit classes, one chain per route (docs/api/API_STANDARDS.md, "Rate
 * limiting").
 */
export interface RateLimiters {
  for(cls: RateLimitClass | 'none', route: string): RequestHandler[];
}

/**
 * express-rate-limit with in-process counters: every window of a class must have room; the
 * tightest window is applied last so its `RateLimit-*` headers win; a 429 carries `Retry-After`
 * and the catalogue code. `RATE_LIMITS_RELAXED` multiplies every limit by 100 for the E2E run.
 * Keys are our own strings (login id, address, session, user, IP), so the library's IP
 * validations are off; the client address itself comes through `trust proxy`.
 */
export function createRateLimiters(env: Env): RateLimiters {
  const factor = env.RATE_LIMITS_RELAXED ? 100 : 1;
  const sharedLimiters = new Map<string, RequestHandler>();
  const limiter = (cls: RateLimitClass, route: string, window: RateWindow): RequestHandler =>
    rateLimit({
      windowMs: window.ttlMs,
      limit: window.limit * factor,
      standardHeaders: 'draft-6',
      legacyHeaders: false,
      keyGenerator: (req) => `${cls}:${route}:${window.key(req)}`,
      ...(window.skip ? { skip: window.skip } : {}),
      validate: {
        keyGeneratorIpFallback: false,
        trustProxy: false,
        xForwardedForHeader: false,
      },
      handler: (req, _res, next) => {
        const reset = (req as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
        const seconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60;
        next(new ApiError('rate_limit.exceeded', 429, undefined, undefined, seconds));
      },
    });
  return {
    for(cls, route) {
      if (cls === 'none') return [];
      // Every route has its own budget per key unless a window is shared by
      // the routes of its class. IP windows run first, so a
      // flood of made-up ids is refused by the address before it fills the per-id counters; the
      // tightest window runs last so its headers reach the client.
      const windows = [...RATE_LIMITS[cls]].sort(
        (a, b) => Number(b.byIp) - Number(a.byIp) || b.limit - a.limit,
      );
      return windows.map((window) => {
        if (!window.shared) return limiter(cls, route, window);
        // one middleware (and so one counter store) for every route of the class
        const key = `${cls}:${RATE_LIMITS[cls].indexOf(window)}`;
        let shared = sharedLimiters.get(key);
        if (!shared) {
          shared = limiter(cls, '*', window);
          sharedLimiters.set(key, shared);
        }
        return shared;
      });
    },
  };
}
