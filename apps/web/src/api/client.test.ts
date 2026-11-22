import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, pair } from '../../test/auth';
import { server } from '../../test/msw/server';
import { closeOfflineDb, OFFLINE_DB_NAME, offlineDb } from '../offline/db';
import {
  afterSignIn,
  clearLostPending,
  currentDataKey,
  forgetKeys,
  noteLostPending,
  storedSessionId,
} from '../offline/keys';
import { cachedMe, rememberMe } from '../offline/snapshot';
import {
  api,
  ApiFailure,
  currentMe,
  login,
  logout,
  onSessionChange,
  refreshSession,
  resetClientForTests,
  storeSettled,
  apiBase,
} from './client';

// The PWA's API client (docs/api/API_STANDARDS.md, "Authentication headers and token refresh";
// docs/architecture/AUTH.md, "Tokens and device sessions" and "Devices: listing, remote revocation
// and local-data wipe").
beforeEach(() => {
  resetClientForTests();
  document.cookie = 'css_csrf=nonce.mac; path=/';
});
afterEach(async () => {
  document.cookie = 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  forgetKeys();
  clearLostPending();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

/** The store opens for a volunteer's session only; an official keeps nothing on the device. */
const VOLUNTEER = { ...ME, kind: 'volunteer' as const };
const SESSION_A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const SESSION_B = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02';
/** A token shaped like the server's, carrying only the session claim. */
const tokenOf = (sessionId: string) => `h.${btoa(JSON.stringify({ sid: sessionId }))}.s`;

describe('the API address', () => {
  it('is the backend of VITE_API_BASE_URL in dev and always the own origin in a production build', () => {
    expect(apiBase({ DEV: true, VITE_API_BASE_URL: 'http://127.0.0.1:4000' })).toBe(
      'http://127.0.0.1:4000/api/v1',
    );
    expect(apiBase({ DEV: true, VITE_API_BASE_URL: 'http://127.0.0.1:4000/' })).toBe(
      'http://127.0.0.1:4000/api/v1',
    );
    expect(apiBase({ DEV: true })).toBe('/api/v1');
    // {host} is the page's own host, so a phone on the office network calls the same computer
    expect(apiBase({ DEV: true, VITE_API_BASE_URL: 'http://{host}:4000' }, '10.11.115.50')).toBe(
      'http://10.11.115.50:4000/api/v1',
    );
    // a production build never sends its cookies to an address it was built with
    expect(apiBase({ DEV: false, VITE_API_BASE_URL: 'https://other.example.org' })).toBe('/api/v1');
  });

  it('sends the cookies with an api() call, as the API may sit on its own port', async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.get('*/api/v1/public/settings', ({ request }) => {
        credentials = request.credentials;
        return HttpResponse.json({ data: {} });
      }),
    );
    await api('/public/settings');
    expect(credentials).toBe('include');
  });
});

describe('API client', () => {
  it('logs in, keeps the token in memory and sends it with the language and version', async () => {
    let seen: Headers | undefined;
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.get('*/api/v1/auth/me', ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ data: ME, meta: {} });
      }),
    );
    expect(await login('head@example.org', 'secret 123')).toEqual(ME);
    expect(currentMe()).toEqual(ME);
    await api('/auth/me');
    expect(seen?.get('authorization')).toBe('Bearer access-1');
    expect(seen?.get('accept-language')).toBe('bn');
    expect(seen?.get('x-client-version')).toBeTruthy();
  });

  it('refreshes once with the CSRF cookie when the token expired, then retries', async () => {
    let calls = 0;
    let csrf: string | null = null;
    server.use(
      http.post('*/api/v1/auth/refresh', ({ request }) => {
        csrf = request.headers.get('x-csrf-token');
        return HttpResponse.json({ data: pair(ME, 'access-2'), meta: {} });
      }),
      http.get('*/api/v1/sessions', ({ request }) => {
        calls += 1;
        return request.headers.get('authorization') === 'Bearer access-2'
          ? HttpResponse.json({ data: [], meta: {} })
          : apiError(401, 'auth.token_expired', 'expired');
      }),
    );
    expect(await api('/sessions')).toEqual([]);
    expect(calls).toBe(2);
    expect(csrf).toBe('nonce.mac');
  });

  it('returns a streamed file as a Blob and, when asked, the whole envelope', async () => {
    server.use(
      http.get('*/api/v1/files/f/content', () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
      http.get('*/api/v1/users/u', () =>
        HttpResponse.json({ data: { id: 'u' }, meta: { etag: '"v1"' } }),
      ),
    );
    const file = await api<Blob>('/files/f/content', { blob: true });
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(3);
    expect(await api('/users/u', { envelope: true })).toEqual({
      data: { id: 'u' },
      meta: { etag: '"v1"' },
    });
    expect(await api('/users/u')).toEqual({ id: 'u' });
  });

  it('shares one refresh between parallel callers', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({ data: pair(), meta: {} });
      }),
    );
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(refreshes).toBe(1);
  });

  it('wipes local data and signs out when the session was revoked', async () => {
    const events: (string | undefined)[] = [];
    onSessionChange((me, ended) => events.push(me ? 'in' : ended));
    window.sessionStorage.setItem('draft', 'x');
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair(VOLUNTEER, tokenOf(SESSION_A)), meta: {} }),
      ),
      http.get('*/api/v1/auth/me', () => apiError(401, 'auth.session_revoked', 'revoked')),
    );
    await login('a', 'b');
    expect(currentDataKey()).not.toBeNull();
    await offlineDb().meta.put({ key: 'since', value: 'x' });
    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiFailure);
    expect(currentMe()).toBeNull();
    expect(window.sessionStorage.getItem('draft')).toBeNull();
    expect(currentDataKey()).toBeNull();
    expect(await Dexie.exists(OFFLINE_DB_NAME)).toBe(false);
    expect(events).toEqual(['in', 'revoked']);
  });

  it('opens the store keys for the session, asks the earlier session’s key back and reports lost records', async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return HttpResponse.json({
          data: {
            ...pair(VOLUNTEER, tokenOf(bodies.length === 1 ? SESSION_A : SESSION_B)),
            ...(body.recoverSessionId ? { previousDeviceKey: 'k'.repeat(43) } : {}),
          },
          meta: {},
        });
      }),
    );
    await login('a', 'b');
    expect(bodies[0]).not.toHaveProperty('recoverSessionId');
    expect(await storedSessionId()).toBe(SESSION_A);
    // the session expired, the app was reopened, and records were lost at an offline logout
    resetClientForTests();
    forgetKeys();
    noteLostPending({ count: 2, reason: 'logout' });
    await login('a', 'b');
    expect(bodies[1]).toMatchObject({
      recoverSessionId: SESSION_A,
      lostPending: { count: 2, reason: 'logout' },
    });
    expect(await storedSessionId()).toBe(SESSION_B);
    expect(currentDataKey()).not.toBeNull();
    expect(window.localStorage.getItem('css_lost_pending')).toBeNull();
  });

  it('keeps the store keys closed for a token without a session claim', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
    );
    await login('a', 'b');
    expect(currentDataKey()).toBeNull();
  });

  it('keeps local data, but forgets the open key, when the refresh token only expired', async () => {
    const events: (string | undefined)[] = [];
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair(VOLUNTEER, tokenOf(SESSION_A)), meta: {} }),
      ),
      http.post('*/api/v1/auth/refresh', () => apiError(401, 'auth.refresh_invalid', 'again')),
    );
    await login('a', 'b');
    expect(currentDataKey()).not.toBeNull();
    onSessionChange((me, ended) => events.push(me ? 'in' : ended));
    window.sessionStorage.setItem('draft', 'x');
    await offlineDb().meta.put({ key: 'since', value: 'x' });
    expect(await refreshSession()).toBeNull();
    expect(window.sessionStorage.getItem('draft')).toBe('x');
    expect(await offlineDb().meta.get('since')).toEqual({ key: 'since', value: 'x' });
    expect(currentDataKey()).toBeNull();
    expect(events).toEqual(['expired']);
  });

  it('opens the store keys on a refresh before it publishes the session', async () => {
    let keyWhenPublished: CryptoKey | null | undefined;
    onSessionChange((me) => {
      if (me) keyWhenPublished = currentDataKey();
    });
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ data: pair(VOLUNTEER, tokenOf(SESSION_A)), meta: {} }),
      ),
    );
    expect(await refreshSession()).not.toBeNull();
    expect(keyWhenPublished).not.toBeNull();
    expect(keyWhenPublished).toBeDefined();
    expect(await storedSessionId()).toBe(SESSION_A);
  });

  it('signs in even when the store will not open', async () => {
    const table = offlineDb().keys;
    const broken = vi.spyOn(table, 'get').mockRejectedValue(new Error('store closed'));
    try {
      server.use(
        http.post('*/api/v1/auth/login', () =>
          HttpResponse.json({ data: pair(VOLUNTEER, tokenOf(SESSION_A)), meta: {} }),
        ),
      );
      expect(await login('a', 'b')).toEqual(VOLUNTEER);
      expect(currentMe()).toEqual(VOLUNTEER);
      expect(currentDataKey()).toBeNull();
    } finally {
      broken.mockRestore();
    }
  });

  it('opens a volunteer’s session from the phone’s store when the server cannot be reached', async () => {
    // the last sign-in left the ring and the cached me; the app was closed since (no key in memory)
    await afterSignIn({ sessionId: SESSION_A, userId: VOLUNTEER.id, deviceKey: 'k'.repeat(43) });
    await rememberMe(VOLUNTEER);
    forgetKeys();
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.error()));
    const seen: unknown[] = [];
    onSessionChange((me) => seen.push(me));
    await expect(refreshSession()).rejects.toThrow();
    expect(currentMe()).toEqual(VOLUNTEER);
    expect(seen).toEqual([VOLUNTEER]);
    expect(currentDataKey()).not.toBeNull();
    // the first request with network refreshes first, then goes with the new token
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ data: pair(VOLUNTEER, tokenOf(SESSION_A)), meta: {} });
      }),
      http.get('*/api/v1/ping-sample', ({ request }) =>
        request.headers.get('authorization') === `Bearer ${tokenOf(SESSION_A)}`
          ? HttpResponse.json({ data: { pong: true }, meta: {} })
          : apiError(401, 'auth.token_missing', 'login'),
      ),
    );
    expect(await api('/ping-sample')).toEqual({ pong: true });
    expect(refreshes).toBe(1);
  });

  it('opens the store keys for an official too, with the profile alone kept on the device', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair(ME, tokenOf(SESSION_A)), meta: {} }),
      ),
    );
    // the official's sign-in does not wait for the store: the profile is there once it settles
    await login('head@example.org', 'secret 123');
    expect(currentMe()).toEqual(ME);
    await storeSettled();
    expect(await storedSessionId()).toBe(SESSION_A);
    expect(currentDataKey()).not.toBeNull();
    expect(await cachedMe()).toEqual(ME);
  });

  it('wipes an official’s profile even when the logout comes before the store has settled', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair(ME, tokenOf(SESSION_A)), meta: {} }),
      ),
      http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    await login('head@example.org', 'secret 123');
    await logout();
    expect(currentMe()).toBeNull();
    expect(await cachedMe()).toBeNull();
    expect(currentDataKey()).toBeNull();
  });

  it('opens an official’s session from the phone’s store when the server cannot be reached', async () => {
    await afterSignIn({ sessionId: SESSION_A, userId: ME.id, deviceKey: 'k'.repeat(43) });
    await rememberMe(ME);
    forgetKeys();
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.error()));
    await expect(refreshSession()).rejects.toThrow();
    expect(currentMe()).toEqual(ME);
    expect(currentDataKey()).not.toBeNull();
  });

  it('finishes a logout the network cut short at the next refresh, instead of signing in again', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.post('*/api/v1/auth/logout', () => HttpResponse.error()),
    );
    await login('a', 'b');
    await expect(logout(3)).rejects.toThrow();
    expect(currentMe()).toBeNull();
    // the network is back: the refresh cookie buys one token, which revokes the session
    let logoutBody: unknown = null;
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ data: pair(), meta: {} });
      }),
      http.post('*/api/v1/auth/logout', async ({ request }) => {
        logoutBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(await refreshSession()).toBeNull();
    expect(currentMe()).toBeNull();
    expect(logoutBody).toEqual({ pendingCount: 3 });
    // once finished, a later refresh is an ordinary one again
    expect(await refreshSession()).not.toBeNull();
    expect(refreshes).toBe(2);
  });

  it('stays signed out without network when this device holds no store', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.error()));
    await expect(refreshSession()).rejects.toThrow();
    expect(currentMe()).toBeNull();
  });

  it('sends the pending count with a logout that leaves records on the phone', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/logout', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await logout(4);
    expect(body).toEqual({ pendingCount: 4 });
  });

  it('does not ask the server without the CSRF cookie (no session on this device)', async () => {
    document.cookie = 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    const called = vi.fn();
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        called();
        return HttpResponse.json({ data: pair(), meta: {} });
      }),
    );
    expect(await refreshSession()).toBeNull();
    expect(called).not.toHaveBeenCalled();
  });

  it('a refresh that fails after a newer login does not end the new session', async () => {
    let release: () => void = () => {};
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        await new Promise<void>((r) => (release = r));
        return apiError(401, 'auth.refresh_invalid', 'again');
      }),
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
    );
    const pending = refreshSession();
    await login('a', 'b');
    release();
    // the retry after the first 401 waits as well
    await new Promise((r) => setTimeout(r, 450));
    release();
    expect(await pending).toBeNull();
    expect(currentMe()).toEqual(ME);
  });

  it('logs out on the server and wipes even when the network fails', async () => {
    const wiped = vi.fn();
    onSessionChange((_me, ended) => wiped(ended));
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.error()));
    await expect(logout()).rejects.toThrow();
    expect(wiped).toHaveBeenCalledWith('logout');
  });

  it.each(['auth.token_stale', 'auth.token_expired'])(
    'refreshes and repeats the logout when the access token is %s, so the server session ends',
    async (code) => {
      const tokens: (string | null)[] = [];
      server.use(
        http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
        http.post('*/api/v1/auth/refresh', () =>
          HttpResponse.json({ data: pair(ME, 'access-2'), meta: {} }),
        ),
        http.post('*/api/v1/auth/logout', ({ request }) => {
          const token = request.headers.get('authorization');
          tokens.push(token);
          return token === 'Bearer access-2'
            ? new HttpResponse(null, { status: 204 })
            : apiError(401, code, 'stale');
        }),
      );
      await login('a', 'b');
      await logout();
      expect(tokens).toEqual(['Bearer access-1', 'Bearer access-2']);
      expect(currentMe()).toBeNull();
    },
  );

  it('a refresh that succeeds after a logout does not sign the old session in again', async () => {
    const events: (string | undefined)[] = [];
    let release: () => void = () => {};
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
      http.post('*/api/v1/auth/refresh', async () => {
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json({ data: pair(ME, 'access-late'), meta: {} });
      }),
    );
    await login('a', 'b');
    onSessionChange((me, ended) => events.push(me ? 'in' : ended));
    const pending = refreshSession();
    await logout();
    release();
    expect(await pending).toBeNull();
    expect(currentMe()).toBeNull();
    expect(events).toEqual(['logout']);
  });

  it('a refresh that answers while the logout is on its way never signs the person in', async () => {
    const events: (string | undefined)[] = [];
    let release: () => void = () => {};
    let refreshed: () => void = () => {};
    const refreshAnswered = new Promise<void>((r) => (refreshed = r));
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.post('*/api/v1/auth/refresh', async () => {
        await new Promise<void>((r) => (release = r));
        refreshed();
        return HttpResponse.json({ data: pair(ME, 'access-late'), meta: {} });
      }),
      // the logout's answer comes only after the refresh has answered
      http.post('*/api/v1/auth/logout', async () => {
        release();
        await refreshAnswered;
        await new Promise((r) => setTimeout(r, 20));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await login('a', 'b');
    onSessionChange((me, ended) => events.push(me ? 'in' : ended));
    const pending = refreshSession();
    await logout();
    expect(await pending).toBeNull();
    expect(currentMe()).toBeNull();
    expect(events).toEqual(['logout']);
  });

  it('a refresh that succeeds after a newer login does not replace the new session', async () => {
    let release: () => void = () => {};
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.post('*/api/v1/auth/refresh', async () => {
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json({ data: pair({ ...ME, id: 'old-user' }, 'access-old'), meta: {} });
      }),
    );
    const pending = refreshSession();
    await login('a', 'b');
    release();
    expect(await pending).toBeNull();
    expect(currentMe()).toEqual(ME);
  });

  it('turns error bodies into ApiFailure with code, message and Retry-After', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(423, 'auth.account_locked', 'locked', { 'Retry-After': '900' }),
      ),
    );
    const failure = await login('a', 'b').catch((e: unknown) => e);
    expect(failure).toMatchObject({ status: 423, code: 'auth.account_locked', retryAfter: 900 });
  });
});
