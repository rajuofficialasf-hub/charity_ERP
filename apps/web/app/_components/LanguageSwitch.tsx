'use client';

import { LOCALE_COOKIE, type Locale } from '@css/shared/i18n';
import { RadioGroup } from '@css/ui';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocaleAction } from './locale-action';

/**
 * Language switch (I18N 2): writes the css_locale cookie through a server action, keeps a device
 * copy for the login screen, and re-renders the page in the new language. Language names are shown
 * in their own language.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations('common.language');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: string) => {
    try {
      window.localStorage.setItem(LOCALE_COOKIE, next);
    } catch {
      // Private windows may refuse storage; the cookie still carries the choice.
    }
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };

  return (
    <RadioGroup
      label={t('label')}
      orientation="horizontal"
      value={locale}
      onChange={(next) => choose(next as Locale)}
      disabled={pending}
      options={[
        { id: 'bn', label: t('bn') },
        { id: 'en', label: t('en') },
      ]}
      className={className}
    />
  );
}
