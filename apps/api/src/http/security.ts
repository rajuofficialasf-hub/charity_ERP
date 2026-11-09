import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { DestinationStream } from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';
import type { Env } from '../config/env';
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

/** `trust proxy` for Express: a hop count when numeric, else a named or CIDR list (D-072). */
export function trustProxySetting(value: string): string | number | boolean {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
