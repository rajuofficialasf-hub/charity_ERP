import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env';
import { ApiError } from '../i18n/api-error';
import { RATE_LIMITS, type RateLimitClass } from './rate-limit';

/** One limiter chain per API_STANDARDS 10 class, built once per app (NE-SEC-04, D-068). */
export interface RateLimiters {
  for(cls: RateLimitClass | 'none'): RequestHandler[];
}

/**
 * express-rate-limit with in-process counters: every window of a class must have room; the
 * tightest window is applied last so its `RateLimit-*` headers win; a 429 carries `Retry-After`
 * and the catalogue code. `RATE_LIMITS_RELAXED` multiplies every limit by 100 for the E2E run
 * (D-072). Keys are our own strings (login id, address, session, user, IP), so the library's IP
 * validations are off; the client address itself comes through `trust proxy` (D-072).
 */
export function createRateLimiters(env: Env): RateLimiters {
  const factor = env.RATE_LIMITS_RELAXED ? 100 : 1;
  const chains = new Map<RateLimitClass, RequestHandler[]>();
  for (const [cls, windows] of Object.entries(RATE_LIMITS) as [
    RateLimitClass,
    (typeof RATE_LIMITS)[RateLimitClass],
  ][]) {
    const ordered = [...windows].sort((a, b) => b.limit - a.limit);
    chains.set(
      cls,
      ordered.map((window) =>
        rateLimit({
          windowMs: window.ttlMs,
          limit: window.limit * factor,
          standardHeaders: 'draft-6',
          legacyHeaders: false,
          keyGenerator: (req) => `${cls}:${window.key(req)}`,
          validate: {
            keyGeneratorIpFallback: false,
            trustProxy: false,
            xForwardedForHeader: false,
          },
          handler: (req, _res, next) => {
            const reset = (req as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
            const seconds = reset
              ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
              : 60;
            next(new ApiError('rate_limit.exceeded', 429, undefined, undefined, seconds));
          },
        }),
      ),
    );
  }
  return { for: (cls) => (cls === 'none' ? [] : (chains.get(cls) ?? [])) };
}
