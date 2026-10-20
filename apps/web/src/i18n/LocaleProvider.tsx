import type { Locale } from '@css/shared/i18n';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { IntlProvider } from 'use-intl';
import { usePublicSettings } from '../lib/public-settings';
import {
  loadMessages,
  messagesFor,
  PSEUDO,
  shownCatalogue,
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
 * load (docs/ui/I18N.md); a switch to the other language loads it once and changes the
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
  // a catalogue that arrives re-renders the provider; the language shown follows from what is
  // loaded. A failed load (a first visit on a flaky network) is tried again with a growing pause
  // and when the browser comes back online, so the page is never left empty.
  const [, arrived] = useState(0);
  useEffect(() => {
    if (messagesFor(key)) return;
    let current = true;
    let pause = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      void loadMessages(wanted).then(
        () => {
          if (current) arrived((n) => n + 1);
        },
        () => {
          if (!current) return;
          timer = setTimeout(attempt, pause);
          pause = Math.min(pause * 2, 30_000);
        },
      );
    };
    const online = () => {
      clearTimeout(timer);
      attempt();
    };
    attempt();
    window.addEventListener('online', online);
    return () => {
      current = false;
      clearTimeout(timer);
      window.removeEventListener('online', online);
    };
  }, [key, wanted]);
  const shown = shownCatalogue(key, wanted);
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
