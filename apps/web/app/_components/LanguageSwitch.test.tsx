import { bn } from '@css/shared/i18n';
import { expectNoAxeViolations } from '@css/ui/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from './AppProviders';
import { LanguageSwitch } from './LanguageSwitch';

const refresh = vi.fn();
const setLocaleAction = vi.fn(async (_locale: string) => {});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('./locale-action', () => ({
  setLocaleAction: (locale: string) => setLocaleAction(locale),
}));

describe('LanguageSwitch (I18N 2)', () => {
  beforeEach(() => {
    refresh.mockClear();
    setLocaleAction.mockClear();
    window.localStorage.clear();
  });

  it('stores the choice in the cookie (server action) and on the device, then re-renders', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <NextIntlClientProvider locale="bn" messages={bn}>
        <AppProviders>
          <LanguageSwitch />
        </AppProviders>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('radiogroup', { name: 'ভাষা' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'বাংলা' })).toBeChecked();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(setLocaleAction).toHaveBeenCalledWith('en');
    expect(window.localStorage.getItem('css_locale')).toBe('en');
  });
});
