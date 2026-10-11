import { expectNoAxeViolations } from '@css/ui/testing';
import { bn, en } from '@css/shared/i18n';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('shows the system name (UX-09) without accessibility violations', async () => {
    const { container } = render(
      <NextIntlClientProvider locale="bn" messages={bn}>
        <HomePage />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'চ্যারিটি ও সোশ্যাল সার্ভিস' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows the English name when the language is en', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <HomePage />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Charity & Social Service' }),
    ).toBeInTheDocument();
  });
});
