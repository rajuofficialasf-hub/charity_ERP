import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { currentContext } from '../core/request-context';
import { ApiError } from '../i18n/api-error';

/** The rate-limit classes of API_STANDARDS 10, the same values as OpenAPI `x-rate-limit`. */
export type RateLimitClass =
  | 'login'
  | 'otp-request'
  | 'otp-verify'
  | 'password-reset'
  | 'refresh'
  | 'public-form'
  | 'default'
  | 'sync';

interface Window {
  limit: number;
  ttlMs: number;
  /** The key this window counts by. */
  key: (req: Request) => string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const field = (req: Request, ...names: string[]) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  for (const name of names) {
    // eslint-disable-next-line security/detect-object-injection -- names are fixed field names of this file
    const value = Object.hasOwn(body, name) ? body[name] : undefined;
    if (typeof value === 'string') return value.trim().toLowerCase();
  }
  return 'none';
};
const ip = (req: Request) => req.ip ?? 'unknown';
const loginId = (req: Request) => field(req, 'loginId', 'login', 'mobile', 'email');
const address = (req: Request) => field(req, 'address', 'mobile', 'email');
const session = (req: Request) => currentContext()?.deviceSessionId ?? `ip:${ip(req)}`;
/** The refresh token starts with its session id (D-070), so refreshes count per session. */
const refreshSession = (req: Request) => {
  const match = /(?:^|;\s*)css_refresh=([0-9a-f-]{36})\./.exec(req.headers.cookie ?? '');
  return match?.[1] ? `sid:${match[1]}` : `ip:${ip(req)}`;
};
const caller = (req: Request) => currentContext()?.userId ?? `ip:${ip(req)}`;

/** Limits and keys per class (API_STANDARDS 10, O-08, O-25; default and sync are proposals tuned in T3.4). */
export const RATE_LIMITS: Record<RateLimitClass, Window[]> = {
  login: [
    { limit: 10, ttlMs: MINUTE, key: (r) => `id:${loginId(r)}` },
    { limit: 100, ttlMs: HOUR, key: (r) => `id:${loginId(r)}` },
    { limit: 10, ttlMs: MINUTE, key: (r) => `ip:${ip(r)}` },
    { limit: 100, ttlMs: HOUR, key: (r) => `ip:${ip(r)}` },
  ],
  'otp-request': [
    { limit: 5, ttlMs: HOUR, key: address },
    { limit: 20, ttlMs: HOUR, key: ip },
  ],
  'otp-verify': [
    {
      limit: 5,
      ttlMs: HOUR,
      key: (r) => field(r, 'registrationId', 'loginId', 'otpId', 'requestId'),
    },
  ],
  'password-reset': [{ limit: 5, ttlMs: HOUR, key: loginId }],
  refresh: [{ limit: 60, ttlMs: HOUR, key: refreshSession }],
  'public-form': [{ limit: 20, ttlMs: HOUR, key: ip }],
  default: [{ limit: 600, ttlMs: MINUTE, key: caller }],
  sync: [{ limit: 60, ttlMs: MINUTE, key: session }],
};

export const RATE_LIMIT = 'css:rate-limit';
/** Declares the rate-limit class of a handler; routes without it use `default`. */
export const RateLimit = (cls: RateLimitClass | 'none') => SetMetadata(RATE_LIMIT, cls);

/**
 * Enforces the class of the route (SYSTEM_ARCHITECTURE 6 step 3) with @nestjs/throttler's
 * in-process counters (D-068). Every window of the class must have room; the response carries
 * RateLimit-Limit/Remaining/Reset of the tightest window, and a 429 adds Retry-After.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ThrottlerStorageService) private readonly storage: ThrottlerStorageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const cls =
      this.reflector.getAllAndOverride<RateLimitClass | 'none' | undefined>(RATE_LIMIT, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'default';
    if (cls === 'none') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const route = `${req.method} ${context.getClass().name}.${context.getHandler().name}`;
    let tightest: { limit: number; remaining: number; reset: number } | undefined;
    // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
    for (const [index, window] of RATE_LIMITS[cls].entries()) {
      const key = `${cls}:${index}:${route}:${window.key(req)}`;
      const record = await this.storage.increment(key, window.ttlMs, window.limit, 0, cls);
      const remaining = Math.max(window.limit - record.totalHits, 0);
      const reset = Math.ceil(record.timeToExpire);
      if (!tightest || remaining < tightest.remaining)
        tightest = { limit: window.limit, remaining, reset };
      if (record.totalHits > window.limit) {
        res.setHeader('Retry-After', String(reset));
        this.setHeaders(res, { limit: window.limit, remaining: 0, reset });
        throw new ApiError('rate_limit.exceeded', 429);
      }
    }
    if (tightest) this.setHeaders(res, tightest);
    return true;
  }

  private setHeaders(res: Response, h: { limit: number; remaining: number; reset: number }): void {
    res.setHeader('RateLimit-Limit', String(h.limit));
    res.setHeader('RateLimit-Remaining', String(h.remaining));
    res.setHeader('RateLimit-Reset', String(h.reset));
  }
}
