import { isoDateInDhaka } from '@css/shared/format';
import type { FormDefinition } from '@css/shared/forms';
import type { Locale } from '@css/shared/i18n';
import { SegmentedControl, Skeleton, Stack, Text } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { IntlProvider, useLocale, useTranslations } from 'use-intl';
import { AppProviders } from '../../components/AppProviders';
import { FormRenderer } from '../../features/forms/FormRenderer';
import { loadMessages } from '../../i18n/locale';
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
    <Stack as="section" gap={3} aria-label={t('title')}>
      <Stack direction="row" gap={2} wrap>
        <SegmentedControl
          label={t('width')}
          value={width}
          onChange={(id) => setWidth(id === 'desktop' ? 'desktop' : 'phone')}
          options={[
            { id: 'phone', label: t('phone') },
            { id: 'desktop', label: t('desktop') },
          ]}
        />
        <SegmentedControl
          label={t('language')}
          value={language}
          onChange={(id) => setLanguage(id === 'en' ? 'en' : 'bn')}
          options={[
            { id: 'bn', label: t('bn') },
            { id: 'en', label: t('en') },
          ]}
        />
        <SegmentedControl
          label={t('audience')}
          value={audience}
          onChange={(id) => setAudience(id === 'official' ? 'official' : 'volunteer')}
          options={[
            { id: 'volunteer', label: t('volunteer') },
            { id: 'official', label: t('official') },
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
  );
}

/** Draws its children in another language than the app's, once that catalogue has loaded. */
function InLanguage({ locale, children }: { locale: Locale; children: ReactNode }) {
  const current = useLocale();
  const other = locale !== current;
  const messages = useQuery({
    queryKey: ['catalogue', locale],
    queryFn: () => loadMessages(locale),
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
