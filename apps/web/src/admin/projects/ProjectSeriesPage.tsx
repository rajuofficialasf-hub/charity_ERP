import { type Locale, localized } from '@css/shared/i18n';
import { Page, Skeleton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeProjectOverview } from '../roles';
import { CARDS_KEY, seriesDetail } from './cards-api';

/**
 * A project's page, one project series, inside the programs and projects tab (docs/ui/SCREENS.md,
 * "Project list and project page"): its heading and the trail up to its program.
 */
export function ProjectSeriesPage() {
  const { me } = useAuth();
  const { seriesId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canSeeProjectOverview(me));
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series-detail', seriesId],
    queryFn: () => seriesDetail(seriesId),
    enabled: allowed,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const tab = { id: 'tab', label: t('tab.title'), href: '/admin/projects' };
  if (series.error)
    return (
      <>
        <PageCrumbs items={[tab]} />
        {series.error instanceof ApiFailure && series.error.status === 404 ? (
          <p>{t('series_page.not_found')}</p>
        ) : (
          <LoadError error={series.error} onRetry={() => void series.refetch()} />
        )}
      </>
    );
  if (!series.data) return <Skeleton shape="card" />;
  const s = series.data;
  const name = localized(s.name, locale);
  return (
    <>
      <DocumentTitle title={name} />
      <PageCrumbs
        items={[
          tab,
          {
            id: 'program',
            label: localized(s.program.name, locale),
            href: `/admin/projects/programs/${s.program.id}`,
          },
          { id: 'series', label: name },
        ]}
      />
      <Page title={name} documentTitle={false} />
    </>
  );
}
