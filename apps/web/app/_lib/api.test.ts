import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, pair } from '../../test/auth';
import { server } from '../../test/msw/server';
import {
  api,
  ApiFailure,
  currentMe,
  login,
  logout,
  onSessionChange,
  refreshSession,
  resetClientForTests,
} from './api';

// The PWA's API client (API_STANDARDS 11, AUTH.md 5 and 8).
beforeEach(() => {
  resetClientForTests();
  document.cookie = 'css_csrf=nonce.mac; path=/';
});
afterEach(() => {
  document.cookie = 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
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

  it('wipes local data and signs out when the session was revoked (AUTH.md 8)', async () => {
    const events: (string | undefined)[] = [];
    onSessionChange((me, ended) => events.push(me ? 'in' : ended));
    window.sessionStorage.setItem('draft', 'x');
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.get('*/api/v1/auth/me', () => apiError(401, 'auth.session_revoked', 'revoked')),
    );
    await login('a', 'b');
    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiFailure);
    expect(currentMe()).toBeNull();
    expect(window.sessionStorage.getItem('draft')).toBeNull();
    expect(events).toEqual(['in', 'revoked']);
  });

  it('keeps local data when the refresh token only expired (O-29)', async () => {
    const events: (string | undefined)[] = [];
    onSessionChange((me, ended) => events.push(me ? 'in' : ended));
    window.sessionStorage.setItem('draft', 'x');
    server.use(
      http.post('*/api/v1/auth/refresh', () => apiError(401, 'auth.refresh_invalid', 'again')),
    );
    expect(await refreshSession()).toBeNull();
    expect(window.sessionStorage.getItem('draft')).toBe('x');
    expect(events).toEqual(['expired']);
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
