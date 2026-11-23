import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { ApiError } from '../i18n/api-error.js';
import type { OfficeAddresses } from './office-addresses.js';
import { RATE_LIMITS, type RateLimitClass, type RateWindow } from './rate-limit.js';

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
 * validations are off; the client address itself comes through `trust proxy`. A request from an
 * office address skips every window counted by the address; the windows of a login id, a code's
 * address, a draft, a session or a user count it as anyone's.
 */
export function createRateLimiters(
  env: Env,
  office?: Pick<OfficeAddresses, 'matches'>,
): RateLimiters {
  const factor = env.RATE_LIMITS_RELAXED ? 100 : 1;
  const sharedLimiters = new Map<string, RequestHandler>();
  const skipOf = (window: RateWindow): ((req: Request) => boolean) | undefined => {
    const own = window.skip;
    if (!window.byIp || !office) return own;
    return (req) => office.matches(req.ip) || (own?.(req) ?? false);
  };
  const limiter = (cls: RateLimitClass, route: string, window: RateWindow): RequestHandler => {
    const skip = skipOf(window);
    return rateLimit({
      windowMs: window.ttlMs,
      limit: window.limit * factor,
      standardHeaders: 'draft-6',
      legacyHeaders: false,
      keyGenerator: (req) => `${cls}:${route}:${window.key(req)}`,
      ...(skip ? { skip } : {}),
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
  };
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
