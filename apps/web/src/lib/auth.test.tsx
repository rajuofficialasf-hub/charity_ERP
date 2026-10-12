import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ME, pair } from '../../test/auth';
import { server } from '../../test/msw/server';
import { login, logout, refreshSession, resetClientForTests } from './api';
import { AuthProvider } from './auth';
import { createQueryClient } from './query-client';

// The session holder empties the server-data cache between sessions (AUTH.md 8; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, C12 review).
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
});
