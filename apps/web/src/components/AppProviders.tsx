import { formatCount } from '@css/shared/format';
import { UiProvider } from '@css/ui';
import { UiProvider as AsfUiProvider } from '@/ui';
import { useLocale, useMessages } from 'use-intl';
import { useCallback, type ReactNode } from 'react';

/**
 * Supplies the design system with the `ui` catalogue texts and the central number formatter. Inside
 * the router, `navigate` lets the design system's links change the page without a reload. The asf
 * UI system (docs/architecture/ADR/ADR-016-asf-ui-system.md) wraps the earlier set while the pages
 * move to it; its own words come from the catalogue's `ui.asf` group.
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
    <AsfUiProvider labels={ui.asf}>
      <UiProvider locale={locale} messages={ui} formatNumber={formatNumber} navigate={navigate}>
        {children}
      </UiProvider>
    </AsfUiProvider>
  );
}
