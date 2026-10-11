'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria-components';
import type { UiMessages } from './messages.js';

export type UiLocale = 'bn' | 'en';

/**
 * Locales handed to React Aria (D-064): the `nu-latn` extension keeps English digits in both
 * languages (UX-05) and both locales order dates day, month, year (O-43).
 */
export const ARIA_LOCALE: Record<UiLocale, string> = {
  bn: 'bn-BD-u-nu-latn',
  en: 'en-GB-u-nu-latn',
};

export interface UiContextValue {
  locale: UiLocale;
  messages: UiMessages;
  /** The app's number formatter (packages/shared/format from T1.5); English digits only. */
  formatNumber: (value: number) => string;
}

const UiContext = createContext<UiContextValue | null>(null);

export interface UiProviderProps extends UiContextValue {
  /** Client-side navigation for links (for example Next's router.push). */
  navigate?: (href: string) => void;
  children: ReactNode;
}

/** Supplies locale, texts and number formatting to every design-system component. */
export function UiProvider({
  locale,
  messages,
  formatNumber,
  navigate,
  children,
}: UiProviderProps) {
  const value = useMemo(
    () => ({ locale, messages, formatNumber }),
    [locale, messages, formatNumber],
  );
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  const ariaLocale = ARIA_LOCALE[locale];
  const content = (
    <UiContext.Provider value={value}>
      <I18nProvider locale={ariaLocale}>{children}</I18nProvider>
    </UiContext.Provider>
  );
  return navigate ? <RouterProvider navigate={navigate}>{content}</RouterProvider> : content;
}

/** Reads the UiProvider values; components fail loudly when it is missing. */
export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('@css/ui components must be rendered inside <UiProvider>.');
  return value;
}
