'use client';

import { formatCount } from '@css/shared/format';
import { UiProvider } from '@css/ui';
import { useLocale, useMessages } from 'next-intl';
import { useCallback, type ReactNode } from 'react';

/** Supplies the design system with the `ui` catalogue texts and the central number formatter. */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const { ui } = useMessages();
  const formatNumber = useCallback((value: number) => formatCount(value, locale), [locale]);
  return (
    <UiProvider locale={locale} messages={ui} formatNumber={formatNumber}>
      {children}
    </UiProvider>
  );
}
