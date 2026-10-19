import type { Locale, Messages } from '@css/shared/i18n';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { IntlProvider } from 'use-intl';
import { usePublicSettings } from '../lib/public-settings';
import {
  loadMessages,
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
 * are the whole catalogue of the language. Only the device language's catalogue is in the first
 * load (D-104; docs/ui/I18N.md); a switch to the other language loads it once and changes the
 * language when it has arrived, so the page never shows keys.
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
  const wanted: Locale = readLocaleOf(stored, serverDefault);
  const key = stored === PSEUDO ? stored : wanted;
  const [shown, setShown] = useState<{ locale: Locale; messages: Messages } | undefined>(() => {
    const messages = messagesFor(key);
    return messages ? { locale: wanted, messages } : undefined;
  });
  useEffect(() => {
    const ready = messagesFor(key);
    if (ready) {
      setShown((now) =>
        now?.locale === wanted && now.messages === ready
          ? now
          : { locale: wanted, messages: ready },
      );
      return;
    }
    let current = true;
    void loadMessages(wanted).then(
      () => {
        const messages = messagesFor(key);
        if (current && messages) setShown({ locale: wanted, messages });
      },
      () => {
        // the language stays as it is; the next switch or reload tries again
      },
    );
    return () => {
      current = false;
    };
  }, [key, wanted]);
  const setLocale = useCallback((next: string) => {
    writeLocale(next);
    setStored(next);
  }, []);

  const locale = shown?.locale ?? wanted;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  if (!shown) return null;
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <IntlProvider locale={shown.locale} messages={shown.messages} timeZone="Asia/Dhaka">
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
