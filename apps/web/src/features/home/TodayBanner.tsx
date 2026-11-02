import { formatCount, formatDateLong } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { ATTENTION_KEY, attention } from './home-api';

/**
 * The day at a glance on the brand's dark green: the date, how many tasks wait for the person and
 * how many notifications are unread, both read from the home's own "needs your attention" list.
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
  return (
    <section className="my-work-today" aria-labelledby="today-title">
      <div className="my-work-today-text">
        <h2 id="today-title" className="my-work-today-title">
          {t('title')}
        </h2>
        <p className="my-work-today-line">
          <span>{formatDateLong(new Date(), locale)}</span>
          {items.isSuccess && (
            <>
              <span aria-hidden="true"> · </span>
              <span>
                {tasks > 0
                  ? t('waiting', { n: tasks, count: formatCount(tasks, locale) })
                  : t('clear')}
              </span>
            </>
          )}
        </p>
      </div>
      {items.isSuccess && (
        <dl className="my-work-today-stats">
          <div className="my-work-today-stat">
            <dt>{t('tasks')}</dt>
            <dd>{formatCount(tasks, locale)}</dd>
          </div>
          <div className="my-work-today-stat">
            <dt>{t('unread')}</dt>
            <dd>{formatCount(unread, locale)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
