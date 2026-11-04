import { formatCount, formatDateLong } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { SummaryBanner } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { ATTENTION_KEY, attention } from './home-api';

/**
 * The day at a glance: the date, how many tasks wait for the person and how many notifications are
 * unread, both read from the home's own "needs your attention" list.
 */
export function TodayBanner() {
  const t = useTranslations('home.today');
  const locale = useLocale() as Locale;
  const items = useQuery({ queryKey: ATTENTION_KEY, queryFn: attention });
  const list = items.data ?? [];
  const unread = list.find((item) => item.kind === 'unread_notifications')?.count ?? 0;
  const tasks = list
    .filter((item) => item.kind !== 'unread_notifications')
    .reduce((sum, item) => sum + item.count, 0);
  const date = formatDateLong(new Date(), locale);
  return (
    <SummaryBanner
      title={t('title')}
      subtitle={
        items.isSuccess
          ? `${date} · ${tasks > 0 ? t('waiting', { n: tasks, count: formatCount(tasks, locale) }) : t('clear')}`
          : date
      }
      items={
        items.isSuccess
          ? [
              { label: t('tasks'), value: formatCount(tasks, locale), icon: 'checklist' },
              { label: t('unread'), value: formatCount(unread, locale), icon: 'bell' },
            ]
          : []
      }
    />
  );
}
