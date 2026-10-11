import { RadioGroup } from '@css/ui';
import { useTranslations } from 'use-intl';
import { useLocaleSwitch } from '../i18n/LocaleProvider';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Language switch (I18N 2, D-067): stores the choice on this device (cookie and localStorage),
 * on the account when signed in (PUT /me/language, O-56), and re-renders the app in the new
 * language. Language names are shown in their own language.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations('common.language');
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

  return (
    <RadioGroup
      label={t('label')}
      orientation="horizontal"
      value={locale}
      onChange={choose}
      options={[
        { id: 'bn', label: t('bn') },
        { id: 'en', label: t('en') },
      ]}
      className={className}
    />
  );
}
