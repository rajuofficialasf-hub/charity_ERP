import { isoDateInDhaka } from '@css/shared/format';
import type { FormDefinition } from '@css/shared/forms';
import type { Locale } from '@css/shared/i18n';
import { Skeleton, Stack, Text, RadioGroup } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { IntlProvider, useLocale, useTranslations } from 'use-intl';
import { AppProviders } from '../../components/AppProviders';
import { FormRenderer } from '../../features/forms/FormRenderer';
import { loadCatalogue } from '../../i18n/locale';
import { FORMS_KEY, nisabInForce } from './forms-api';

/**
 * The draft as it will be filled: at a phone's or a computer's width, in Bengali or English, as a
 * volunteer or an official sees it. The answers typed here are kept nowhere and sent nowhere; a
 * photo question shows that it takes nothing here.
 */
export function PreviewPane({ definition }: { definition: FormDefinition }) {
  const t = useTranslations('forms.builder.preview_pane');
  const current = useLocale() as Locale;
  const [width, setWidth] = useState<'phone' | 'desktop'>('phone');
  const [language, setLanguage] = useState<Locale>(current);
  const [audience, setAudience] = useState<'volunteer' | 'official'>('volunteer');
  const nisab = useQuery({
    queryKey: [...FORMS_KEY, 'nisab'],
    queryFn: nisabInForce,
    retry: false,
  });
  return (
    <section aria-label={t('title')}>
      <Stack gap={3}>
        <Stack direction="row" gap={2} wrap>
          <RadioGroup
            orientation="horizontal"
            label={t('width')}
            value={width}
            onChange={(id: string) => setWidth(id === 'desktop' ? 'desktop' : 'phone')}
            options={[
              { value: 'phone', label: t('phone') },
              { value: 'desktop', label: t('desktop') },
            ]}
          />
          <RadioGroup
            orientation="horizontal"
            label={t('language')}
            value={language}
            onChange={(id: string) => setLanguage(id === 'en' ? 'en' : 'bn')}
            options={[
              { value: 'bn', label: t('bn') },
              { value: 'en', label: t('en') },
            ]}
          />
          <RadioGroup
            orientation="horizontal"
            label={t('audience')}
            value={audience}
            onChange={(id: string) => setAudience(id === 'official' ? 'official' : 'volunteer')}
            options={[
              { value: 'volunteer', label: t('volunteer') },
              { value: 'official', label: t('official') },
            ]}
          />
        </Stack>
        <Text tone="muted">{t('note')}</Text>
        <div className={`form-preview-frame is-${width}`}>
          <InLanguage locale={language}>
            <FormRenderer
              key={`${width}:${language}:${audience}`}
              definition={definition}
              audience={audience}
              today={isoDateInDhaka(new Date())}
              {...(nisab.data ? { nisabValue: nisab.data.value } : {})}
              layout={width === 'phone' ? 'steps' : 'page'}
            />
          </InLanguage>
        </div>
      </Stack>
    </section>
  );
}

/** Draws its children in another language than the app's, once both parts of its catalogue have loaded. */
function InLanguage({ locale, children }: { locale: Locale; children: ReactNode }) {
  const current = useLocale();
  const other = locale !== current;
  const messages = useQuery({
    queryKey: ['catalogue', locale],
    queryFn: () => loadCatalogue(locale),
    enabled: other,
    staleTime: Infinity,
  });
  if (!other) return <>{children}</>;
  if (!messages.data) return <Skeleton shape="card" />;
  return (
    <div lang={locale}>
      <IntlProvider locale={locale} messages={messages.data} timeZone="Asia/Dhaka">
        <AppProviders>{children}</AppProviders>
      </IntlProvider>
    </div>
  );
}
