import type { Me, TokenPair } from '@css/shared/auth';
import { fromBase64Url } from '../offline/crypto';
import { wipeLocalData } from '../lib/wipe';

/**
 * The PWA's API client (docs/api/API_STANDARDS.md, "Request and response envelope" and
 * "Authentication headers and token refresh"; docs/architecture/AUTH.md, "Tokens and device
 * sessions" and "Devices: listing, remote revocation and local-data wipe"). The access token lives
 * only in memory; the refresh token is an HttpOnly cookie the browser sends to the refresh path,
 * and the readable css_csrf cookie is copied into X-CSRF-Token. One refresh runs at a time, across
 * tabs through the Web Locks API where the browser has it.
 */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';
/**
 * Where the API is: in development the backend on its own port (`VITE_API_BASE_URL`), in every
 * production build the site's own origin, whose server forwards /api/ to the backend. A production
 * build ignores the variable, so it never sends its cookies to an address it was built with.
 */
export function apiBase(
  env: { DEV: boolean; VITE_API_BASE_URL?: string },
  host = globalThis.location?.hostname ?? '127.0.0.1',
): string {
  // "{host}" is the page's own host, so this computer and a phone on the office network each call
  // the API of the computer they opened the app from
  const origin = env.DEV
    ? (env.VITE_API_BASE_URL ?? '').replace('{host}', host).replace(/\/+$/, '')
    : '';
  return `${origin}/api/v1`;
}
const BASE = apiBase(import.meta.env);

export interface ApiErrorDetail {
  path?: string;
  code: string;
  message: string;
  /**
   * The values a few codes name, such as the project of a merge conflict
   * (docs/api/API_STANDARDS.md, "Error-code catalogue").
   */
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
    /** The values a few codes name at the error's top level, as for a detail. */
    readonly params?: Record<string, string>,
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
    // read by hand: a schema library here would land in the login chunk for one field
    const claims: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
    if (typeof claims !== 'object' || claims === null || !('sid' in claims)) return null;
    return typeof claims.sid === 'string' ? claims.sid : null;
  } catch {
    return null;
  }
}

/** The phone's store, loaded only when a session needs it, so the login chunk stays small. */
const offlineKeys = () => import('../offline/keys');

/** A store that does not answer in time is treated as absent, so a sign-in never hangs on it. */
const STORE_WAIT_MS = 2_000;
function withinStoreWait<T>(work: Promise<T>): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), STORE_WAIT_MS)),
  ]).catch(() => null);
}

/**
 * The store work a sign-in left running in the background; a session's end waits for it, so a
 * profile written late can never outlive the wipe.
 */
let storeWork: Promise<void> = Promise.resolve();

/**
 * Opens the store's keys for the signed-in session (docs/architecture/OFFLINE_SYNC.md, local
 * storage security) and keeps the person's own profile there, so the installed app opens without
 * network. A volunteer's store goes on to hold the data set and the outbox, so their sign-in waits
 * for the key; an official's holds the profile alone, which matters
 * only at the next open without network, so their sign-in does not wait for it. A store that will
 * not open never blocks the sign-in: the next flush reports what it cannot read.
 */
async function openStoreKeys(pair: TokenPair): Promise<void> {
  const sessionId = sessionIdOf(pair.accessToken);
  if (!sessionId) return;
  const open = async () => {
    const keys = await offlineKeys();
    await keys.afterSignIn({
      sessionId,
      userId: pair.me.id,
      deviceKey: pair.deviceKey,
      previousDeviceKey: pair.previousDeviceKey,
    });
  };
  const remember = async () => {
    const { rememberMe } = await import('../offline/snapshot');
    await rememberMe(pair.me);
  };
  // the store is optional for the session; its own screens say when it is unavailable
  if (pair.me.kind === 'volunteer') {
    try {
      await open();
    } catch {
      return;
    }
    storeWork = remember().catch(() => undefined);
  } else
    storeWork = open()
      .then(remember)
      .catch(() => undefined);
}

/** Resolves once the store work a sign-in started in the background has finished. */
export function storeSettled(): Promise<void> {
  return storeWork;
}

/**
 * Ends the session on this device; a revoked session also wipes the local data
 * (docs/architecture/AUTH.md, "Devices: listing, remote revocation and local-data wipe").
 */
async function endSession(end: SessionEnd): Promise<void> {
  state.accessToken = null;
  state.deviceKey = null;
  state.me = null;
  // a profile still being written must land before the wipe, never after it
  await storeWork;
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
      error?: {
        code: string;
        message: string;
        details?: ApiErrorDetail[];
        requestId?: string;
        params?: Record<string, string>;
      };
    };
    if (body.error)
      return new ApiFailure(
        res.status,
        body.error.code,
        body.error.message,
        body.error.details ?? [],
        retry ? Number(retry) : undefined,
        body.error.requestId,
        body.error.params,
      );
  } catch {
    // Not an API error body (proxy or network page).
  }
  return new ApiFailure(res.status, 'server.unavailable', res.statusText);
}

const REVOKING = new Set(['auth.session_revoked', 'auth.refresh_reused']);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Signs in from the phone's own store when the server cannot be reached
 * (docs/architecture/OFFLINE_SYNC.md, offline cold start): the device-bound key opens the store
 * and the cached `me` of the last sign-in says who. There is no token yet; the first request
 * with network refreshes first. An official opens the same way, to the shell and the banner:
 * their store holds the profile alone, so every read says it needs the connection.
 */
async function signInOffline(): Promise<boolean> {
  if (state.me) return true;
  const keys = await withinStoreWait(offlineKeys());
  const opened = keys ? await withinStoreWait(keys.openOffline()) : null;
  if (!opened) return false;
  const me = await withinStoreWait(import('../offline/snapshot').then((s) => s.cachedMe()));
  if (!me || me.id !== opened.userId) return false;
  state.me = me;
  publish();
  return true;
}

/** The note of a logout the server never heard of (the network was away): finished at the next refresh. */
const LOGOUT_PENDING_KEY = 'css_logout_pending';

function noteLogoutPending(pendingCount: number | undefined): void {
  try {
    window.localStorage.setItem(LOGOUT_PENDING_KEY, JSON.stringify({ pendingCount }));
  } catch {
    // storage may be unavailable in a private window; the refresh cookie then lives on until it expires
  }
}

function pendingLogout(): { pendingCount?: number } | null {
  try {
    const raw = window.localStorage.getItem(LOGOUT_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pendingCount?: unknown };
    return typeof parsed.pendingCount === 'number' ? { pendingCount: parsed.pendingCount } : {};
  } catch {
    return null;
  }
}

function clearLogoutPending(): void {
  try {
    window.localStorage.removeItem(LOGOUT_PENDING_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Finishes a logout the network cut short: the device was wiped, but the server session and the
 * refresh cookie lived on, and a refresh would have signed the next person in. The cookie buys one
 * token, which revokes the session; the person stays signed out either way.
 */
async function finishLogout(
  attempt: () => Promise<Response>,
  note: { pendingCount?: number },
): Promise<void> {
  const res = await attempt();
  if (res.status >= 400 && res.status < 500) {
    // the session is gone or the cookie no longer opens it: nothing left to revoke
    clearLogoutPending();
    return;
  }
  if (!res.ok) return;
  const { data } = (await res.json()) as { data: TokenPair };
  const done = await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${data.accessToken}`,
      'Content-Type': 'application/json',
      'X-Client-Version': APP_VERSION,
      'Accept-Language': language(),
    },
    body: JSON.stringify(note.pendingCount === undefined ? {} : note),
  });
  if (done.ok || done.status === 401) clearLogoutPending();
}

async function refreshOnce(): Promise<TokenPair | null> {
  // Without the CSRF cookie there is no session on this device: nothing to ask the server.
  if (!readCookie('css_csrf')) return null;
  const started = state.generation;
  const attempt = () =>
    fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': readCookie('css_csrf') ?? '',
        'X-Client-Version': APP_VERSION,
        'Accept-Language': language(),
      },
    });
  const unfinished = pendingLogout();
  if (unfinished) {
    await finishLogout(attempt, unfinished);
    return null;
  }
  let res: Response;
  try {
    res = await attempt();
  } catch (error) {
    // no answer from the network at all: the session is not gone, and a volunteer's phone
    // opens from its own store meanwhile
    await signInOffline();
    throw error;
  }
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
    // the ring opens before the session is published, so a flush that follows finds the key
    await openStoreKeys(data);
    if (state.generation !== started) {
      await offlineKeys()
        .then((keys) => keys.forgetKeys())
        .catch(() => undefined);
      return null;
    }
    return accept(data);
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

/** A file the API sent to be saved, with the name it named it by, if any. */
export interface SavedFile {
  blob: Blob;
  fileName: string | null;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** A body sent as it is (a photo); its type goes in `headers`. */
  rawBody?: ArrayBuffer;
  headers?: Record<string, string>;
  /** The answer is a file (a streamed photo), returned as a Blob instead of the `data` field. */
  blob?: boolean;
  /** The answer is a file to save: its Blob and the name the server gives it (`SavedFile`). */
  file?: boolean;
  /** Returns the whole envelope `{ data, meta }` (for `meta.etag` before an `If-Match` write). */
  envelope?: boolean;
  /** Gives the request up when it aborts (a caller's time limit); the call then rejects. */
  signal?: AbortSignal;
}

/**
 * Calls the API with the access token. An expired or stale token is refreshed once and the call
 * retried; a revoked session wipes local data; any other failure is thrown as ApiFailure.
 */
export async function api<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  // a session opened from the phone's store has no token: the first request with network
  // refreshes first, and one still without network fails on the way as every request does
  if (retry && state.me && !state.accessToken) await refreshSession().catch(() => undefined);
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
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
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    if (options.blob) return (await res.blob()) as T;
    if (options.file) {
      const saved: SavedFile = {
        blob: await res.blob(),
        fileName:
          /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? null,
      };
      return saved as T;
    }
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
 * before this login (docs/architecture/OFFLINE_SYNC.md, local storage security); the store's
 * keys open before the sign-in is published.
 */
export async function login(loginId: string, password: string): Promise<Me> {
  const keys = await withinStoreWait(offlineKeys());
  const recoverSessionId = keys ? await withinStoreWait(keys.storedSessionId()) : null;
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
  keys?.clearLostPending();
  await openStoreKeys(pair);
  accept(pair);
  void keys?.requestPersistence();
  return pair.me;
}

/**
 * Logs out: the server revokes the session, the device wipes its data. A stale or expired access
 * token is refreshed once first: without it the server session, and with it the refresh cookie,
 * would survive and the next page load would sign the user in again.
 */
export async function logout(pendingCount?: number): Promise<void> {
  // a refresh already on its way finishes first: its new cookie lands before the logout clears it,
  // and the logout goes out with the newest token, so it is never refused as stale
  await state.refreshing?.catch(() => undefined);
  try {
    await api<void>('/auth/logout', {
      method: 'POST',
      ...(pendingCount === undefined ? {} : { body: { pendingCount } }),
    });
  } catch (error) {
    // the server never heard of the logout: the next refresh finishes it instead of signing in
    noteLogoutPending(pendingCount);
    throw error;
  } finally {
    state.generation += 1;
    await endSession('logout');
  }
}

/** The device facts sent at login; staff on a computer get the idle timeout. */
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
  clearLogoutPending();
  state.accessToken = null;
  state.deviceKey = null;
  state.me = null;
  state.refreshing = null;
  state.listeners.clear();
  state.generation = 0;
  storeWork = Promise.resolve();
}
