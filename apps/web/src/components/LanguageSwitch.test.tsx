import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../test/auth';
import { server } from '../../test/msw/server';
import { resetClientForTests } from '../lib/api';
import { LanguageSwitch } from './LanguageSwitch';

const clearLocale = () => {
  document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  window.localStorage.clear();
};

describe('LanguageSwitch (I18N 2, D-067)', () => {
  beforeEach(() => {
    resetClientForTests();
    clearLocale();
  });

  it('stores the choice on the device (cookie and localStorage) and re-renders at once', async () => {
    refreshAs(null);
    const user = userEvent.setup();
    const { container } = renderApp(<LanguageSwitch />);
    expect(screen.getByRole('radiogroup', { name: 'ভাষা' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'বাংলা' })).toBeChecked();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(document.cookie).toContain('css_locale=en');
    expect(window.localStorage.getItem('css_locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('also stores the language on the account when signed in (O-56)', async () => {
    refreshAs(ME);
    let body: unknown;
    server.use(
      http.put('*/api/v1/me/language', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp(<LanguageSwitch />);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'English' })).toBeEnabled());
    // wait for the silent refresh to sign the user in
    await waitFor(() => expect(document.cookie).toContain('css_csrf'));
    await new Promise((r) => setTimeout(r, 50));
    await user.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(body).toEqual({ language: 'en' }));
  });
});
