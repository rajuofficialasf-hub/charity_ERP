import { formatCount } from '@css/shared/format';
import { UiProvider } from '@css/ui';
import { useLocale, useMessages } from 'use-intl';
import { useCallback, type ReactNode } from 'react';

/**
 * Supplies the design system with the `ui` catalogue texts and the central number formatter. Inside
 * the router, `navigate` lets the design system's links change the page without a reload.
 */
export function AppProviders({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate?: (href: string) => void;
}) {
  const locale = useLocale();
  const { ui } = useMessages();
  const formatNumber = useCallback((value: number) => formatCount(value, locale), [locale]);
  return (
    <UiProvider locale={locale} messages={ui} formatNumber={formatNumber} navigate={navigate}>
      {children}
    </UiProvider>
  );
}
