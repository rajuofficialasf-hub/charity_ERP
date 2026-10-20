import type { Locale } from '@css/shared/i18n';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { IntlProvider } from 'use-intl';
import { usePublicSettings } from '../lib/public-settings';
import {
  messagesFor,
  PSEUDO,
  readLocale,
  storedLocaleValue,
  writeDefaultLocale,
  writeLocale,
} from './locale';

interface LocaleValue {
  locale: Locale;
  /** Stores the choice on the device and re-renders the app in that language. */
  setLocale: (next: string) => void;
}

const LocaleContext = createContext<LocaleValue>({ locale: 'bn', setLocale: () => {} });

/**
 * Gives the app its language and catalogue (use-intl) and keeps `<html lang>` in step. Messages
 * are the whole catalogue of the language; the bundle carries both languages (I18N 3, NFR-15:
 * about 20 KB gzip each), so switching needs no network.
 */
export function LocaleProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Test hook: the starting language instead of the stored one. */
  initial?: Locale;
}) {
  const [stored, setStored] = useState<string | undefined>(() => initial ?? storedLocaleValue());
  // a device without a choice follows the system default language set by the admin
  const serverDefault = usePublicSettings().data?.defaultLanguage;
  useEffect(() => {
    if (serverDefault) writeDefaultLocale(serverDefault);
  }, [serverDefault]);
  const locale: Locale = readLocaleOf(stored, serverDefault);
  const setLocale = useCallback((next: string) => {
    writeLocale(next);
    setStored(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <IntlProvider
        locale={locale}
        messages={messagesFor(stored === PSEUDO ? stored : locale)}
        timeZone="Asia/Dhaka"
      >
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

function readLocaleOf(stored: string | undefined, serverDefault: Locale | undefined): Locale {
  return stored === 'en' ? 'en' : stored === 'bn' ? 'bn' : (serverDefault ?? readLocale());
}

export function useLocaleSwitch(): LocaleValue {
  return useContext(LocaleContext);
}
