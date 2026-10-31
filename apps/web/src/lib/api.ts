import type { Me, TokenPair } from '@css/shared/auth';
import { wipeLocalData } from './wipe';

/**
 * The PWA's API client (API_STANDARDS 3, 11; AUTH.md 5, 8). The access token lives only in
 * memory; the refresh token is an HttpOnly cookie the browser sends to the refresh path, and the
 * readable css_csrf cookie is copied into X-CSRF-Token. One refresh runs at a time, across tabs
 * through the Web Locks API where the browser has it.
 */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';
const BASE = '/api/v1';

export interface ApiErrorDetail {
  path?: string;
  code: string;
  message: string;
  /** The values a few codes name, such as the project of a merge conflict (API_STANDARDS 8). */
  params?: Record<string, string>;
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
  /** The session's device key that wraps the phone's store key; memory only, like the token. */
  deviceKey: string | null;
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
  deviceKey: null,
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
  state.deviceKey = pair.deviceKey;
  state.me = pair.me;
  publish();
  return pair;
}

/** The session id claim of the access token; null for a token this server did not sign. */
function sessionIdOf(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sid?: unknown;
    };
    return typeof claims.sid === 'string' ? claims.sid : null;
  } catch {
    return null;
  }
}

/** The phone's store, loaded only when a session needs it, so the login chunk stays small. */
const offlineKeys = () => import('../offline/keys');

/**
 * Opens the store's keys for the signed-in session (OFFLINE_SYNC.md 7). A store that will not
 * open never blocks the sign-in: the next flush reports what it cannot read.
 */
async function openStoreKeys(pair: TokenPair): Promise<void> {
  const sessionId = sessionIdOf(pair.accessToken);
  if (!sessionId) return;
  try {
    const keys = await offlineKeys();
    await keys.afterSignIn({
      sessionId,
      userId: pair.me.id,
      deviceKey: pair.deviceKey,
      previousDeviceKey: pair.previousDeviceKey,
    });
  } catch {
    // the store is optional for the session; its own screens say when it is unavailable
  }
}

/** Ends the session on this device; a revoked session also wipes the local data (AUTH.md 8). */
async function endSession(end: SessionEnd): Promise<void> {
  state.accessToken = null;
  state.deviceKey = null;
  state.me = null;
  if (end !== 'expired') await wipeLocalData();
  else
    await offlineKeys()
      .then((keys) => keys.forgetKeys())
      .catch(() => undefined);
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
  if (res.ok) {
    const { data } = (await res.json()) as { data: TokenPair };
    // A login or logout happened meanwhile; this token belongs to the session before it.
    if (state.generation !== started) return null;
    accept(data);
    void openStoreKeys(data);
    return data;
  }
  const error = await failure(res);
  // Same for a failure: it is about the session before the login or logout.
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
  /** A body sent as it is (a photo); its type goes in `headers`. */
  rawBody?: ArrayBuffer;
  headers?: Record<string, string>;
  /** The answer is a file (a streamed photo), returned as a Blob instead of the `data` field. */
  blob?: boolean;
  /** Returns the whole envelope `{ data, meta }` (for `meta.etag` before an `If-Match` write). */
  envelope?: boolean;
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
      ...(options.body === undefined || options.rawBody
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {}),
      ...options.headers,
    },
    body:
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    if (options.blob) return (await res.blob()) as T;
    if (options.envelope) return (await res.json()) as T;
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
  // only a session answer ends the session (a registration draft answers registration.* codes)
  if (res.status === 401 && REVOKING.has(error.code)) await endSession('revoked');
  else if (
    res.status === 401 &&
    error.code.startsWith('auth.') &&
    error.code !== 'auth.invalid_credentials'
  )
    await endSession('expired');
  throw error;
}

/**
 * Logs in; the refresh and CSRF cookies are set by the response. The phone names the session its
 * store was keyed under, so the server can hand that key back, and tells of records it lost
 * before this login (OFFLINE_SYNC.md 7); the store's keys open once the sign-in is accepted.
 */
export async function login(loginId: string, password: string): Promise<Me> {
  const keys = await offlineKeys().catch(() => null);
  const recoverSessionId = (await keys?.storedSessionId().catch(() => null)) ?? undefined;
  const lostPending = keys?.peekLostPending();
  const pair = await api<TokenPair>(
    '/auth/login',
    {
      method: 'POST',
      body: {
        loginId,
        password,
        device: deviceInfo(),
        ...(recoverSessionId ? { recoverSessionId } : {}),
        ...(lostPending ? { lostPending } : {}),
      },
    },
    false,
  );
  state.generation += 1;
  accept(pair);
  keys?.clearLostPending();
  await openStoreKeys(pair);
  void keys?.requestPersistence();
  return pair.me;
}

/**
 * Logs out: the server revokes the session, the device wipes its data (AUTH.md 8). A stale or
 * expired access token is refreshed once first: without it the server session, and with it the
 * refresh cookie, would survive and the next page load would sign the user in again.
 */
export async function logout(pendingCount?: number): Promise<void> {
  try {
    await api<void>('/auth/logout', {
      method: 'POST',
      ...(pendingCount === undefined ? {} : { body: { pendingCount } }),
    });
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
  state.deviceKey = null;
  state.me = null;
  state.refreshing = null;
  state.listeners.clear();
  state.generation = 0;
}
