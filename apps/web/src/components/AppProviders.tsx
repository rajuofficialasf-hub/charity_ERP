import { INTL_LOCALE } from '@css/shared/format';
import { UiProvider } from '@/ui';
import { useLocale, useMessages } from 'use-intl';
import { useMemo, type ReactNode } from 'react';

/**
 * Supplies the asf UI system (docs/architecture/ADR/ADR-016-asf-ui-system.md) with its words from
 * the catalogue's `ui.asf` group in the page language, and with the number locale of the app's own
 * formatter, so its counts take the same grouping.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const { ui } = useMessages();
  const labels = useMemo(
    () => ({ ...ui.asf, numberLocale: INTL_LOCALE[locale] }),
    [ui.asf, locale],
  );
  return <UiProvider labels={labels}>{children}</UiProvider>;
}
