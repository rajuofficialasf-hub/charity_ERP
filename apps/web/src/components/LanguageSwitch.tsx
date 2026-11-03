import { LanguageSwitch as Switch } from '@/ui';
import { useTranslations } from 'use-intl';
import { useLocaleSwitch } from '../i18n/LocaleProvider';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Language switch (I18N 2, D-067): stores the choice on this device (cookie and localStorage),
 * on the account when signed in (PUT /me/language, O-56), and re-renders the app in the new
 * language. Language names are shown in their own language. A compact toggle for the top bar and
 * the bottom of the sidebar (UX-19), on the asf UI system's switch: a group of two pressed buttons.
 */
export function LanguageSwitch() {
  const t = useTranslations('common.language');
  const { locale, choose } = useChooseLanguage();

  return (
    <Switch
      label={t('label')}
      value={locale}
      onChange={choose}
      options={[
        { value: 'bn', label: t('bn') },
        { value: 'en', label: t('en') },
      ]}
    />
  );
}

/** The current language and the change of it, also kept on the account when signed in. */
export function useChooseLanguage() {
  const { locale, setLocale } = useLocaleSwitch();
  const { status } = useAuth();
  const choose = (next: string) => {
    if (next === locale) return;
    setLocale(next);
    // The device keeps the choice even when the account cannot be updated right now.
    if (status === 'signed-in')
      void api<void>('/me/language', { method: 'PUT', body: { language: next } }).catch(
        () => undefined,
      );
  };
  return { locale, choose };
}
