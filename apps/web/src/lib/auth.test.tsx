import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ME, pair } from '../../test/auth';
import { server } from '../../test/msw/server';
import { login, logout, refreshSession, resetClientForTests } from '../api/client';
import { AuthProvider } from './auth';
import { createQueryClient } from './query-client';

// The session holder empties the server-data cache between sessions (docs/architecture/AUTH.md,
// "Devices: listing, remote revocation and local-data wipe").
beforeEach(() => {
  resetClientForTests();
  document.cookie = 'css_csrf=nonce.mac; path=/';
});
afterEach(() => {
  document.cookie = 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

function mount() {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>{null}</AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe('AuthProvider and the query cache', () => {
  it('keeps the cache over a token refresh and empties it at logout', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: pair(), meta: {} })),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ data: pair(ME, 'access-2'), meta: {} }),
      ),
      http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    await login('head@example.org', 'secret 123');
    const client = mount();
    client.setQueryData(['files', 'nid-photo'], 'data:image/png;base64,AA==');
    await refreshSession();
    expect(client.getQueryData(['files', 'nid-photo'])).toBeDefined();
    await logout();
    await waitFor(() => expect(client.getQueryData(['files', 'nid-photo'])).toBeUndefined());
  });

  it('empties the cache when another user signs in', async () => {
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        const body = (await request.json()) as { loginId: string };
        return HttpResponse.json({
          data: pair(body.loginId === 'a' ? ME : { ...ME, id: 'other-user' }),
          meta: {},
        });
      }),
    );
    await login('a', 'secret 123');
    const client = mount();
    client.setQueryData(['admin', 'registrations'], [{ userId: 'x' }]);
    await login('b', 'secret 123');
    await waitFor(() => expect(client.getQueryData(['admin', 'registrations'])).toBeUndefined());
  });

  it('drops the cached answers when the permissions of the same user change, not otherwise', async () => {
    let refreshed = { ...ME, permissionVersion: 1 };
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair({ ...ME, permissionVersion: 1 }), meta: {} }),
      ),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ data: pair(refreshed, 'access-2'), meta: {} }),
      ),
    );
    await login('head@example.org', 'secret 123');
    const client = mount();
    client.setQueryData(['admin', 'registrations'], [{ userId: 'x' }]);
    // the same version: the cache stays
    await refreshSession();
    expect(client.getQueryData(['admin', 'registrations'])).toBeDefined();
    // another version of the same user: the cache goes
    refreshed = { ...ME, permissionVersion: 2 };
    await refreshSession();
    await waitFor(() => expect(client.getQueryData(['admin', 'registrations'])).toBeUndefined());
  });
});
