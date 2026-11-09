import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { DestinationStream } from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';
import type { Env } from '../config/env';
import { ApiError } from '../i18n/api-error';
import { loggerOptions } from '../core/logging';

/**
 * One structured line per request with the request id on `X-Request-Id` (NE-LOG-01); bodies,
 * query strings, cookies and authorization never appear (NE-LOG-02, `core/logging.ts`).
 */
export function requestLogging(env: Env, stream?: DestinationStream): HttpLogger {
  return pinoHttp(loggerOptions(env, stream));
}

/** Security headers with helmet's defaults (NE-SEC-01). The API serves JSON only. */
export function securityHeaders(): RequestHandler {
  return helmet();
}

/**
 * CORS for the configured origins only, with credentials. With no origins the API is
 * same-origin only (the PWA is served by Caddy or the Vite proxy) and no allow header is sent.
 */
export function corsAllowlist(origins: readonly string[]): RequestHandler {
  return cors({ origin: [...origins], credentials: true });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A write from a browser carries its page's origin; one from another site, or from no page at
 * all, is refused before any route runs, so a cookie the browser sends along cannot be used by
 * another site. The PWA's own origin and the configured ones pass; reads need no origin. No route
 * is exempt: none is called without a browser.
 */
export function originCheck(appOrigin: string, allowed: readonly string[]): RequestHandler {
  const origins = new Set([new URL(appOrigin).origin, ...allowed]);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin !== undefined && origins.has(origin)) return next();
    req.log?.warn(
      { origin: origin ?? null, method: req.method },
      'write refused by the origin check',
    );
    next(new ApiError('client.origin_refused', 403));
  };
}

/** `trust proxy` for Express: a hop count when numeric, else a named or CIDR list (D-072). */
export function trustProxySetting(value: string): string | number | boolean {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
