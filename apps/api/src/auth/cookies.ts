import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.js';

/** Cookie names and paths of the session (openapi `refreshCookie`). */
export const REFRESH_COOKIE = 'css_refresh';
export const CSRF_COOKIE = 'css_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const REFRESH_PATH = '/api/v1/auth/refresh';

/** Cookies of a request, parsed without a library (names and values are URL-encoded tokens). */
export function readCookies(req: Request): Map<string, string> {
  const header = req.headers.cookie;
  const result = new Map<string, string>();
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      result.set(name, decodeURIComponent(value));
    } catch {
      // A malformed cookie is ignored like a missing one.
    }
  }
  return result;
}

function options(env: Env, path: string, httpOnly: boolean, expires?: Date): CookieOptions {
  return {
    httpOnly,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: 'strict',
    path,
    ...(expires ? { expires } : {}),
  };
}

/**
 * Sets the refresh cookie (HttpOnly, scoped to the refresh path) and the readable CSRF cookie the
 * PWA copies into `X-CSRF-Token`; both live as long as the refresh token can
 * (docs/architecture/AUTH.md, "Tokens and device sessions").
 */
export function setSessionCookies(
  res: Response,
  env: Env,
  refreshToken: string,
  csrfToken: string,
  expires: Date,
): void {
  res.cookie(REFRESH_COOKIE, refreshToken, options(env, REFRESH_PATH, true, expires));
  res.cookie(CSRF_COOKIE, csrfToken, options(env, '/', false, expires));
}

/** Removes both cookies (logout, revoked or invalid session). */
export function clearSessionCookies(res: Response, env: Env): void {
  res.clearCookie(REFRESH_COOKIE, options(env, REFRESH_PATH, true));
  res.clearCookie(CSRF_COOKIE, options(env, '/', false));
}
