import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Timeline, type TimelineStep } from '@css/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { TimelineEntry } from './applications-api';

/**
 * The steps of an application as the volunteer reads them: each state entered, when, and the
 * message the office wrote for them; never the office's own reason or who decided (DESIGN_SYSTEM
 * 5.18).
 */
export function ApplicationTimeline({ entries }: { entries: TimelineEntry[] }) {
  const t = useTranslations('applications');
  const locale = useLocale() as Locale;
  const last = entries.length - 1;
  const steps: TimelineStep[] = entries.map((e, i) => ({
    id: e.id,
    title: t.has(`status.${e.to}` as never) ? t(`status.${e.to}` as never) : e.to,
    time: formatDateTime(e.at, locale),
    comment: e.message ?? undefined,
    status: e.to === 'rejected' ? 'rejected' : i === last ? 'current' : 'done',
  }));
  return <Timeline steps={steps} showActor={false} label={t('detail.timeline')} />;
}
