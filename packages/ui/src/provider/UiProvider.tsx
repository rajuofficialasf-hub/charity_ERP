'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { TemplateProvider } from '../template.js';
import type { UiMessages } from './messages.js';

export type UiLocale = 'bn' | 'en';

/**
 * The locales for formatting in each language: the `nu-latn` extension keeps English digits in
 * both languages, and both order dates day, month, year.
 */
export const FORMAT_LOCALE: Record<UiLocale, string> = {
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

/**
 * Supplies locale, texts and number formatting to every design-system component, inside the
 * template's provider (the MUI theme); links navigate through `navigate`.
 */
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
  return (
    <TemplateProvider navigate={navigate}>
      <UiContext.Provider value={value}>{children}</UiContext.Provider>
    </TemplateProvider>
  );
}

/** Reads the UiProvider values; components fail loudly when it is missing. */
export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('@css/ui components must be rendered inside <UiProvider>.');
  return value;
}
