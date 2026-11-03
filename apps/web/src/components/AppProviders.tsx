import { formatCount } from '@css/shared/format';
import { UiProvider } from '@css/ui';
import { UiProvider as AsfUiProvider } from '@/ui';
import { useLocale, useMessages } from 'use-intl';
import { useCallback, type ReactNode } from 'react';

/**
 * Supplies the design system with the `ui` catalogue texts and the central number formatter. Inside
 * the router, `navigate` lets the design system's links change the page without a reload. The asf
 * UI system (docs/architecture/ADR/ADR-016-asf-ui-system.md) sits inside the earlier set while the
 * pages move to it, so every asf piece takes the asf theme; the earlier set's MUI components take
 * their own theme back. The asf words come from the catalogue's `ui.asf` group.
 */
export function AppProviders({
  children,
  navigate,
  inner = false,
}: {
  children: ReactNode;
  navigate?: (href: string) => void;
  /**
   * Inside the root's providers (the signed-in frame): only the router for the earlier set's
   * links; the asf provider stays the root's one, with one light and dark state for the app.
   */
  inner?: boolean;
}) {
  const locale = useLocale();
  const { ui } = useMessages();
  const formatNumber = useCallback((value: number) => formatCount(value, locale), [locale]);
  return (
    <UiProvider locale={locale} messages={ui} formatNumber={formatNumber} navigate={navigate}>
      {inner ? children : <AsfUiProvider labels={ui.asf}>{children}</AsfUiProvider>}
    </UiProvider>
  );
}
