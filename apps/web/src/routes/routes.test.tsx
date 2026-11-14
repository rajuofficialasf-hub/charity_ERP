import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bn, en } from '@css/shared/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refreshAs } from '../../test/auth';
import { AppProviders } from '../components/AppProviders';
import { forgetMessages, loadMessages, messagesFor, primeMessages } from '../i18n/locale';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { resetClientForTests } from '../api/client';
import { createQueryClient } from '../lib/query-client';
import { routes } from './index';

function mount(path: string, gallery: boolean) {
  const router = createMemoryRouter(routes({ gallery }), { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <LocaleProvider initial="en">
        <AppProviders>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </AppProviders>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}

// The route table: a signed-out visitor lands on the login screen, the gallery exists
// only with the flag, and an unknown path shows the error boundary instead of a blank page.
describe('routes', () => {
  beforeEach(() => {
    resetClientForTests();
    refreshAs(null);
  });

  it('sends a signed-out visitor from the home page to the login screen', async () => {
    const router = mount('/', false);
    expect(await screen.findByRole('heading', { level: 2, name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sends the address of the old admin dashboard to the home page', async () => {
    const router = mount('/admin', false);
    // signed out, the home page in turn asks for the login
    expect(await screen.findByRole('heading', { level: 2, name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('has the gallery route only when enabled', () => {
    expect(routes({ gallery: true })[0]?.children?.some((r) => r.path === '/dev/asf')).toBe(true);
    expect(routes({ gallery: false })[0]?.children?.some((r) => r.path === '/dev/asf')).toBe(false);
  });

  it('shows the error boundary for an unknown path', async () => {
    mount('/no/such/page', false);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Nothing here yet');
  });
});

// Every screen but the login renders only once the rest of the catalogue is in (docs/ui/I18N.md,
// "Typed keys and loading"), so no page shows a key while its texts load.
describe('the rest of the catalogue', () => {
  beforeEach(() => {
    resetClientForTests();
    refreshAs(null);
  });
  afterEach(() => {
    forgetMessages();
    primeMessages('bn', bn);
    primeMessages('en', en);
  });

  it('loads every lazy screen through the one helper that waits for the rest', () => {
    const source = readFileSync(join(__dirname, 'index.tsx'), 'utf8');
    const imports = source.match(/import\(/g) ?? [];
    const waited = source.match(/withRest\(import\(/g) ?? [];
    expect(imports.length).toBeGreaterThan(50);
    expect(waited).toHaveLength(imports.length);
  });

  it('opens the login with the start part alone', async () => {
    forgetMessages();
    await loadMessages('en');
    mount('/login', false);
    expect(await screen.findByRole('heading', { level: 2, name: 'Log in' })).toBeInTheDocument();
    expect(messagesFor('en')).not.toHaveProperty('nav');
  });

  it('opens a lazy screen with the rest of the language shown', async () => {
    forgetMessages();
    await loadMessages('en');
    // the router asks for its first screen before the provider has shown English
    mount('/login/reset', false);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Reset password' }),
    ).toBeInTheDocument();
    expect(messagesFor('en')?.nav).toEqual(en.nav);
  });
});
