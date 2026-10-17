import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { useTranslations } from 'use-intl';
import { PUBLIC_SETTINGS } from '../../test/msw/handlers';
import { server } from '../../test/msw/server';
import { createQueryClient } from '../lib/query-client';
import { LocaleProvider } from './LocaleProvider';

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
