import { formatCount } from '@css/shared/format';
import { type Locale } from '@css/shared/i18n';
import { Card, Grid, StatCard } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { SessionSummary } from '../cards-api';

/**
 * The summary's card of the whole session's counts (docs/DECISION_LOG.md, the session's page as a
 * project frame): the applications received, approved, waiting for a review and waitlisted, the
 * volunteers working in it and the districts it covers, the same for every holder of the overview
 * as the project cards count them. The number of applications opens the applications tab.
 */
export function SessionCounts({
  projectId,
  counts,
}: {
  projectId: string;
  counts: SessionSummary;
}) {
  const t = useTranslations('admin.projects.summary');
  const locale = useLocale() as Locale;
  const number = (n: number) => formatCount(n, locale);
  return (
    <Card title={t('counts')} headingLevel={3}>
      <Grid columns={{ base: 2, md: 3 }} gap={2}>
        <StatCard
          label={t('applications')}
          value={number(counts.applications)}
          icon="clipboard"
          to={`/admin/projects/${projectId}/applications`}
        />
        <StatCard
          label={t('approved')}
          value={number(counts.approved)}
          icon="verified"
          tone="success"
        />
        <StatCard
          label={t('waiting')}
          value={number(counts.waiting)}
          icon="hourglass"
          tone="warning"
        />
        <StatCard
          label={t('waitlisted')}
          value={number(counts.waitlisted)}
          icon="list"
          tone="info"
        />
        <StatCard label={t('volunteers')} value={number(counts.volunteers)} icon="users" />
        <StatCard label={t('districts')} value={number(counts.districts)} icon="map-pin" />
      </Grid>
    </Card>
  );
}
