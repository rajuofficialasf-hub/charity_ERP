import { QueryClientProvider } from '@tanstack/react-query';
import { bn, en, type RestMessages } from '@css/shared/i18n';
import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTranslations } from 'use-intl';
import { PUBLIC_SETTINGS } from '../../test/msw/handlers';
import { server } from '../../test/msw/server';
import { createQueryClient } from '../lib/query-client';
import {
  forgetMessages,
  loadMessages,
  loadRest,
  messagesFor,
  primeMessages,
  withRest,
} from './locale';
import { LocaleProvider, useLocaleSwitch } from './LocaleProvider';

// Each rest part arrives when a test opens its gate (a slow network), else at once.
const gate = vi.hoisted(() => ({
  bn: undefined as Promise<void> | undefined,
  en: undefined as Promise<void> | undefined,
}));
vi.mock('@css/shared/i18n/bn-rest', async (importOriginal) => {
  const real = await importOriginal<{ bnRest: RestMessages }>();
  return {
    get bnRest() {
      return gate.bn ? gate.bn.then(() => real.bnRest) : real.bnRest;
    },
  };
});
vi.mock('@css/shared/i18n/en-rest', async (importOriginal) => {
  const real = await importOriginal<{ enRest: RestMessages }>();
  return {
    get enRest() {
      return gate.en ? gate.en.then(() => real.enRest) : real.enRest;
    },
  };
});

/** Holds a language's rest part back until the returned function is called. */
const holdRest = (language: 'bn' | 'en') => {
  let open = () => {};
  gate[language] = new Promise<void>((resolve) => (open = resolve));
  return () => open();
};

function Probe() {
  const t = useTranslations('common.language');
  return <p>{t('label')}</p>;
}

const mount = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    </QueryClientProvider>,
  );

const serverDefault = (defaultLanguage: 'bn' | 'en') =>
  server.use(
    http.get('*/api/v1/public/settings', () =>
      HttpResponse.json({ data: { ...PUBLIC_SETTINGS, defaultLanguage }, meta: {} }),
    ),
  );

// A device without a language choice follows the system default language the admin sets
// (docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17); a choice always wins.
describe('the system default language', () => {
  afterEach(() => {
    document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.localStorage.clear();
  });

  it('greets a device without a choice in the default language and remembers it', async () => {
    serverDefault('en');
    mount();
    expect(await screen.findByText('Language')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('css_default_locale')).toBe('en');
    expect(window.localStorage.getItem('css_locale')).toBeNull();
  });

  it('speaks the catalogue of the language it renders when the stored value is unknown', async () => {
    serverDefault('en');
    document.cookie = 'css_locale=fr; path=/';
    mount();
    expect(await screen.findByText('Language')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the choice made on the device', async () => {
    serverDefault('en');
    window.localStorage.setItem('css_locale', 'bn');
    mount();
    expect(await screen.findByText('ভাষা')).toBeInTheDocument();
  });
});

function Switch() {
  const { setLocale } = useLocaleSwitch();
  return (
    <button type="button" onClick={() => setLocale('en')}>
      switch
    </button>
  );
}

// One language at a time (docs/ui/I18N.md): nothing renders before the first catalogue, and a
// switch shows the other language only once its catalogue has arrived, never keys.
describe('loading the catalogues', () => {
  afterEach(() => {
    document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.localStorage.clear();
    primeMessages('bn', bn);
    primeMessages('en', en);
  });

  it('renders nothing until the device language has loaded, then the page in it', async () => {
    forgetMessages();
    serverDefault('bn');
    const view = render(
      <QueryClientProvider client={createQueryClient()}>
        <LocaleProvider initial="en">
          <Probe />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(view.container).toBeEmptyDOMElement();
    expect(await screen.findByText('Language')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the shown language while the other one loads, then switches without keys', async () => {
    forgetMessages();
    primeMessages('bn', bn);
    serverDefault('bn');
    render(
      <QueryClientProvider client={createQueryClient()}>
        <LocaleProvider initial="bn">
          <Probe />
          <Switch />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText('ভাষা')).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });
    // the catalogue has not arrived yet: still Bengali, never a key
    expect(screen.queryByText('common.language.label')).toBeNull();
    expect(await screen.findByText('Language')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });
});

function SignIn() {
  const t = useTranslations('auth.login');
  return <h2>{t('title')}</h2>;
}

function Home() {
  const t = useTranslations('home.attention');
  return <h2>{t('title')}</h2>;
}

/** use-intl reports a missing text (a key shown on the screen) through console.error. */
const watchMissing = () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => errors.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
};

// Two parts per language (docs/ui/I18N.md, "Typed keys and loading"): the sign-in page renders with
// the start part alone, every other page only once the rest is in, and a switch after the rest was
// loaded waits for the new language's rest too.
describe('the start and rest parts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    gate.bn = undefined;
    gate.en = undefined;
    document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.localStorage.clear();
    forgetMessages();
    primeMessages('bn', bn);
    primeMessages('en', en);
  });

  it('shows the sign-in page with the start part, and a lazy page only after the rest', async () => {
    forgetMessages();
    serverDefault('bn');
    await loadMessages('bn');
    const open = holdRest('bn');
    const missing = watchMissing();
    const router = createMemoryRouter(
      [
        { path: '/login', element: <SignIn /> },
        {
          path: '/home',
          lazy: async () => ({ Component: (await withRest(Promise.resolve({ Home }))).Home }),
        },
      ],
      { initialEntries: ['/login'] },
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <LocaleProvider initial="bn">
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'লগইন করুন' })).toBeInTheDocument();
    expect(messagesFor('bn')).not.toHaveProperty('home');

    act(() => void router.navigate('/home'));
    // the rest is on its way: the sign-in page stays, never a key
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'লগইন করুন' })).toBeInTheDocument();
    expect(screen.queryByText(/home\.attention/)).toBeNull();

    open();
    expect(await screen.findByRole('heading', { name: 'এখন আপনার কাজ' })).toBeInTheDocument();
    expect(missing()).toEqual([]);
  });

  it('switches, once the rest was loaded, only when the new language has its rest too', async () => {
    forgetMessages();
    serverDefault('bn');
    await loadMessages('bn');
    await loadRest('bn');
    const open = holdRest('en');
    const missing = watchMissing();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <LocaleProvider initial="bn">
          <Home />
          <Switch />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'এখন আপনার কাজ' })).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });
    // the English start part is in, its rest is not: still Bengali, never a key
    await act(async () => {
      await loadMessages('en');
    });
    expect(screen.getByRole('heading', { name: 'এখন আপনার কাজ' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('bn');
    open();
    expect(
      await screen.findByRole('heading', { name: 'Needs your attention' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(missing()).toEqual([]);
  });
});
