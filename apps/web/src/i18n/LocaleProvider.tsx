import type { Locale } from '@css/shared/i18n';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { IntlProvider } from 'use-intl';
import { usePublicSettings } from '../lib/public-settings';
import {
  catalogueLanguage,
  catalogueVersion,
  languageReady,
  loadLanguage,
  noteShownLanguage,
  PSEUDO,
  readLocale,
  shownCatalogue,
  storedLocaleValue,
  subscribeCatalogue,
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
 * are the loaded parts of the language's catalogue (docs/ui/I18N.md, "Typed keys and loading"):
 * the start part of the device language is in the first load, and the rest arrives with the first
 * page that needs it (each lazy route waits for it), which re-renders the provider. A switch to the
 * other language loads its start part, and its rest too once a page has asked for the rest, and
 * changes the language when they have arrived, so the page never shows keys.
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
  const language = catalogueLanguage(key);
  // a part that arrives re-renders the provider; the language shown follows from what is loaded.
  const version = useSyncExternalStore(subscribeCatalogue, catalogueVersion);
  // A language that lacks a part it needs is loaded; a failed load (a first visit on a flaky
  // network) is tried again with a growing pause and when the browser comes back online, so the
  // page is never left empty. A page asking for the rest re-runs this, so a switch in progress
  // waits for the new language's rest too.
  useEffect(() => {
    if (languageReady(language)) return;
    let current = true;
    let pause = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      void loadLanguage(language).catch(() => {
        if (!current) return;
        timer = setTimeout(attempt, pause);
        pause = Math.min(pause * 2, 30_000);
      });
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
  }, [language, version]);
  const shown = shownCatalogue(key, wanted);
  const setLocale = useCallback((next: string) => {
    writeLocale(next);
    setStored(next);
  }, []);

  const locale = shown?.locale ?? wanted;
  const shownLanguage = shown?.language;
  // the rest a page waits for is that of the language shown
  useLayoutEffect(() => {
    if (shownLanguage) noteShownLanguage(shownLanguage);
  }, [shownLanguage]);
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
