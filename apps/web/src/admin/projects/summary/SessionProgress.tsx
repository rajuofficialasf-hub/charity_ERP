import { formatCount, formatDate, isoDateInDhaka } from '@css/shared/format';
import { type Locale } from '@css/shared/i18n';
import { Alert, Card, ProgressBar, Stack, Text, Timeline, type TimelineStep } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { SessionSummary } from '../cards-api';
import type { Project } from '../projects-api';
import { sessionStage, type Stage, STAGES } from '../stage';

/**
 * The summary's card of how far the session has come: the strip of its stages with the dates the
 * record keeps, the current one marked; under it the people approved against the target and the
 * days left to apply while the window is open. The counts come only to the holders of the
 * overview; without them the strip stands alone. A cancelled session says so instead.
 */
export function SessionProgress({
  project: p,
  counts,
}: {
  project: Project;
  counts: SessionSummary | undefined;
}) {
  const t = useTranslations('admin.projects.summary');
  const locale = useLocale() as Locale;
  const today = isoDateInDhaka(new Date());
  const stage = sessionStage(p.status, p.applyTo, today);
  if (!stage)
    return (
      <Card title={t('progress')} headingLevel={3}>
        <Alert tone="info">{t('cancelled')}</Alert>
      </Card>
    );
  const at = STAGES.indexOf(stage);
  const window =
    p.applyFrom && p.applyTo
      ? t('window', { from: formatDate(p.applyFrom), to: formatDate(p.applyTo) })
      : undefined;
  const timeOf = (s: Stage): string | undefined => {
    if (s === 'open') {
      if (stage === 'open' && p.applyFrom && today < p.applyFrom)
        return t('starts', { date: formatDate(p.applyFrom) });
      return window;
    }
    if (s === 'ended') return p.applyTo ? formatDate(p.applyTo) : undefined;
    if (s === 'closed') return p.closedAt ? formatDate(p.closedAt) : undefined;
    return undefined;
  };
  const steps: TimelineStep[] = STAGES.map((s, i) => ({
    id: s,
    title: t(`stage.${s}`),
    time: timeOf(s),
    status: i < at ? 'done' : i === at ? 'current' : 'upcoming',
  }));
  const daysLeft = stage === 'open' ? counts?.daysLeft : null;
  return (
    <Card title={t('progress')} headingLevel={3}>
      <Stack gap={3}>
        <Timeline label={t('stages')} steps={steps} orientation="horizontal" />
        {counts?.target ? (
          <ProgressBar label={t('approved_bar')} value={counts.approved} max={counts.target} />
        ) : null}
        {daysLeft !== null && daysLeft !== undefined && (
          <Text tone="muted">
            {daysLeft === 0
              ? t('last_day')
              : t('days_left', { days: formatCount(daysLeft, locale) })}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
