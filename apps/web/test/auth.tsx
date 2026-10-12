import type { Me, TokenPair } from '@css/shared/auth';
import type { Locale } from '@css/shared/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { createMemoryRouter, type RouteObject, RouterProvider, useLocation } from 'react-router';
import { AppProviders } from '../src/components/AppProviders';
import { LocaleProvider } from '../src/i18n/LocaleProvider';
import { AuthProvider } from '../src/lib/auth';
import { createQueryClient } from '../src/lib/query-client';
import { server } from './msw/server';

/** The current route, for assertions on navigation. */
export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/**
 * Providers of the app (catalogue, design system, session, server-data cache) around a memory
 * router with the component under test at `path` and a probe route for every other path.
 */
export function renderApp(
  ui: ReactNode,
  locale: Locale = 'bn',
  options: { path?: string; children?: RouteObject[] } = {},
) {
  const path = options.path ?? '/';
  const router = createMemoryRouter(
    [
      { path, element: ui, ...(options.children ? { children: options.children } : {}) },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [path] },
  );
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <LocaleProvider initial={locale}>
        <AppProviders>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </AppProviders>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { ...view, router };
}

export const ME: Me = {
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  displayName: 'নমুনা কর্মকর্তা',
  kind: 'staff',
  state: 'active',
  roles: ['program_manager'],
  language: 'bn',
  permissionVersion: 1,
  blockMessage: null,
  volunteerId: null,
};

export const pair = (me: Me = ME, accessToken = 'access-1'): TokenPair => ({
  accessToken,
  expiresAt: '2026-10-11T10:15:00.000Z',
  me,
});

/** API error body as the server sends it. */
export const apiError = (status: number, code: string, message: string, headers = {}) =>
  HttpResponse.json(
    { error: { code, messageKey: `errors.${code}`, message, requestId: 'req_test' } },
    { status, headers },
  );

/**
 * The refresh endpoint answers with a session (signed in) or 401 (signed out). A signed-in device
 * has the readable css_csrf cookie; without it the client does not ask the server at all.
 */
export function refreshAs(me: Me | null) {
  document.cookie = me
    ? 'css_csrf=nonce.mac; path=/'
    : 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  server.use(
    http.post('*/api/v1/auth/refresh', () =>
      me
        ? HttpResponse.json({ data: pair(me), meta: { requestId: 'req_test' } })
        : apiError(401, 'auth.refresh_invalid', 'Log in again.'),
    ),
  );
}
