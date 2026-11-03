import { bn, en } from '@css/shared/i18n';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { describe, expect, it } from 'vitest';
import { useLabels } from '@/ui/templates/asf/components/labels';
import { AppProviders } from './AppProviders';

// The root hands the asf UI system its words from the catalogue in the page language.
function Probe() {
  const labels = useLabels();
  return <p>{labels.mainNavigation}</p>;
}

describe('AppProviders', () => {
  it.each([
    ['bn', bn, 'প্রধান মেনু'],
    ['en', en, 'Main menu'],
  ] as const)('gives the asf pieces their words in %s', (locale, messages, word) => {
    render(
      <IntlProvider locale={locale} messages={messages}>
        <AppProviders>
          <Probe />
        </AppProviders>
      </IntlProvider>,
    );
    expect(screen.getByText(word)).toBeInTheDocument();
  });
});
