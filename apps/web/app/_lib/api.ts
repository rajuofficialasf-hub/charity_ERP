import type { Me, TokenPair } from '@css/shared/auth';
import { wipeLocalData } from './wipe';

/**
 * The PWA's API client (API_STANDARDS 3, 11; AUTH.md 5, 8). The access token lives only in
 * memory; the refresh token is an HttpOnly cookie the browser sends to the refresh path, and the
 * readable css_csrf cookie is copied into X-CSRF-Token. One refresh runs at a time, across tabs
 * through the Web Locks API where the browser has it.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
const BASE = '/api/v1';

export interface ApiErrorDetail {
  path?: string;
  code: string;
  message: string;
}

/** An error answer of the API: catalogue code, localized message, details and Retry-After. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly retryAfter?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

/** Why the signed-in session ended: revoked (wipe local data) or expired (keep it). */
export type SessionEnd = 'revoked' | 'expired' | 'logout';

interface State {
  accessToken: string | null;
  me: Me | null;
  refreshing: Promise<TokenPair | null> | null;
  listeners: Set<(me: Me | null, end?: SessionEnd) => void>;
  /** Counts logins and logouts; a refresh that started before one never ends the newer session. */
  generation: number;
}

// One state per page, even when the bundler instantiates this module in more than one chunk
// (Next dev loads the layout's and the page's client chunks separately).
const STATE_KEY = Symbol.for('css.erp.auth-client');
const holder = globalThis as typeof globalThis & { [STATE_KEY]?: State };
// eslint-disable-next-line security/detect-object-injection -- a fixed registered symbol, not input
const state: State = (holder[STATE_KEY] ??= {
  accessToken: null,
  me: null,
  refreshing: null,
  listeners: new Set(),
  generation: 0,
});

function publish(end?: SessionEnd): void {
  for (const listener of state.listeners) listener(state.me, end);
}

/** Subscribes to sign-in and sign-out; returns the unsubscribe function. */
export function onSessionChange(listener: (me: Me | null, end?: SessionEnd) => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function currentMe(): Me | null {
  return state.me;
}

function accept(pair: TokenPair): TokenPair {
  state.accessToken = pair.accessToken;
  state.me = pair.me;
  publish();
  return pair;
}

/** Ends the session on this device; a revoked session also wipes the local data (AUTH.md 8). */
async function endSession(end: SessionEnd): Promise<void> {
  state.accessToken = null;
  state.me = null;
  if (end !== 'expired') await wipeLocalData();
  publish(end);
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function language(): string {
  return document.documentElement.lang === 'en' ? 'en' : 'bn';
}

async function failure(res: Response): Promise<ApiFailure> {
  const retry = res.headers.get('Retry-After');
  try {
    const body = (await res.json()) as {
      error?: { code: string; message: string; details?: ApiErrorDetail[]; requestId?: string };
    };
    if (body.error)
      return new ApiFailure(
        res.status,
        body.error.code,
        body.error.message,
        body.error.details ?? [],
        retry ? Number(retry) : undefined,
        body.error.requestId,
      );
  } catch {
    // Not an API error body (proxy or network page).
  }
  return new ApiFailure(res.status, 'server.unavailable', res.statusText);
}

const REVOKING = new Set(['auth.session_revoked', 'auth.refresh_reused']);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function refreshOnce(): Promise<TokenPair | null> {
  // Without the CSRF cookie there is no session on this device: nothing to ask the server.
  if (!readCookie('css_csrf')) return null;
  const started = state.generation;
  const attempt = () =>
    fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-CSRF-Token': readCookie('css_csrf') ?? '',
        'X-Client-Version': APP_VERSION,
        'Accept-Language': language(),
      },
    });
  let res = await attempt();
  // Another tab may have rotated the token a moment ago; its new cookie is already here.
  if (res.status === 401) {
    const first = await failure(res.clone());
    if (first.code === 'auth.refresh_invalid') {
      await pause(400);
      res = await attempt();
    }
  }
  if (res.ok) return accept(((await res.json()) as { data: TokenPair }).data);
  const error = await failure(res);
  // A login or logout happened meanwhile; this answer is about the session before it.
  if (state.generation !== started) return null;
  if (REVOKING.has(error.code)) await endSession('revoked');
  else if (res.status === 401 || error.code === 'auth.account_blocked') await endSession('expired');
  else throw error;
  return null;
}

/**
 * A new access token from the refresh cookie, or null when there is no valid session. Parallel
 * callers share one request; tabs take turns through a Web Lock.
 */
export function refreshSession(): Promise<TokenPair | null> {
  state.refreshing ??= (async () => {
    try {
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      return locks ? await locks.request('css-auth-refresh', refreshOnce) : await refreshOnce();
    } finally {
      state.refreshing = null;
    }
  })();
  return state.refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Calls the API with the access token. An expired or stale token is refreshed once and the call
 * retried; a revoked session wipes local data; any other failure is thrown as ApiFailure.
 */
export async function api<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      'Accept-Language': language(),
      'X-Client-Version': APP_VERSION,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return ((await res.json()) as { data: T }).data;
  }
  const error = await failure(res);
  if (
    res.status === 401 &&
    retry &&
    ['auth.token_expired', 'auth.token_stale'].includes(error.code)
  ) {
    if (await refreshSession()) return api<T>(path, options, false);
  }
  if (res.status === 401 && REVOKING.has(error.code)) await endSession('revoked');
  else if (res.status === 401 && error.code !== 'auth.invalid_credentials')
    await endSession('expired');
  throw error;
}

/** Logs in; the refresh and CSRF cookies are set by the response. */
export async function login(loginId: string, password: string): Promise<Me> {
  const pair = await api<TokenPair>(
    '/auth/login',
    {
      method: 'POST',
      body: { loginId, password, device: deviceInfo() },
    },
    false,
  );
  state.generation += 1;
  return accept(pair).me;
}

/** Logs out: the server revokes the session, the device wipes its data (AUTH.md 8). */
export async function logout(): Promise<void> {
  try {
    await api<void>('/auth/logout', { method: 'POST' }, false);
  } finally {
    state.generation += 1;
    await endSession('logout');
  }
}

/** The device facts sent at login; staff on a computer get the idle timeout (O-25, D-070). */
export function deviceInfo(): {
  name: string;
  platform: 'android' | 'ios' | 'desktop' | 'other';
  appVersion: string;
} {
  const ua = navigator.userAgent;
  const platform = /Android/i.test(ua)
    ? 'android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'ios'
      : /Windows|Macintosh|Linux|CrOS/i.test(ua)
        ? 'desktop'
        : 'other';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const desktopOs = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : 'Linux';
  const os =
    platform === 'android'
      ? 'Android'
      : platform === 'ios'
        ? 'iOS'
        : platform === 'desktop'
          ? desktopOs
          : '';
  return { name: `${browser}${os ? ` · ${os}` : ''}`, platform, appVersion: APP_VERSION };
}

/** Test hook: forget the in-memory session. */
export function resetClientForTests(): void {
  state.accessToken = null;
  state.me = null;
  state.refreshing = null;
  state.listeners.clear();
  state.generation = 0;
}
