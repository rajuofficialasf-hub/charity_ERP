import { bn, en, type RestMessages } from '@css/shared/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs } from '../../test/auth';
import { AppProviders } from '../components/AppProviders';
import { forgetMessages, loadMessages, messagesFor, primeMessages } from '../i18n/locale';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { resetClientForTests } from '../api/client';
import { createQueryClient } from '../lib/query-client';
import { routes } from './index';

// The English rest part arrives when a test releases it (a slow network), else at once.
const gate = vi.hoisted(() => ({ en: undefined as Promise<void> | undefined }));
vi.mock('@css/shared/i18n/en-rest', async (importOriginal) => {
  const real = await importOriginal<{ enRest: RestMessages }>();
  return {
    get enRest() {
      return gate.en ? gate.en.then(() => real.enRest) : real.enRest;
    },
  };
});

/** Holds the English rest part back until the returned function is called. */
const holdRest = () => {
  let release = () => {};
  gate.en = new Promise<void>((resolve) => (release = resolve));
  return () => release();
};

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
    gate.en = undefined;
    forgetMessages();
    primeMessages('bn', bn);
    primeMessages('en', en);
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

  // a message key of the rest as use-intl shows a missing one, e.g. "nav.my_work"
  const KEY = /\b(nav|home)\.[a-z_]+/;

  it('shows a signed-in page only once the rest has arrived, never its keys', async () => {
    forgetMessages();
    await loadMessages('en');
    const release = holdRest();
    refreshAs(ME);
    const router = mount('/', false);
    // the shell's and the page's modules are in, and the sign-in has had its time; the rest is not
    await act(async () => {
      await Promise.all([
        import('../components/shell/AppShell'),
        import('../features/home/MyWorkPage'),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.queryAllByText(KEY)).toEqual([]);
    expect(screen.queryByRole('heading', { level: 1, name: 'My Work' })).toBeNull();
    expect(screen.queryByText('Work centre')).toBeNull();
    // the router still waits for the page
    expect(router.state.initialized).toBe(false);

    release();
    expect(await screen.findByRole('heading', { level: 1, name: 'My Work' })).toBeInTheDocument();
    expect(screen.getByText('Work centre')).toBeInTheDocument();
    expect(screen.queryAllByText(KEY)).toEqual([]);
    expect(router.state.location.pathname).toBe('/');
  });
});
