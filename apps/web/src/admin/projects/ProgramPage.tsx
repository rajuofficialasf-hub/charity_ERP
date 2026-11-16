import { type Locale, localized } from '@css/shared/i18n';
import { Page, Skeleton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeProjectOverview } from '../roles';
import { CARDS_KEY, programCards } from './cards-api';

/**
 * A program's page inside the programs and projects tab (docs/ui/SCREENS.md, "Project list and
 * project page"): its heading and the trail back to the tab.
 */
export function ProgramPage() {
  const { me } = useAuth();
  const { programId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canSeeProjectOverview(me));
  const cards = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    enabled: allowed,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const tab = { id: 'tab', label: t('tab.title'), href: '/admin/projects' };
  if (cards.error) return <LoadError error={cards.error} onRetry={() => void cards.refetch()} />;
  if (!cards.data) return <Skeleton shape="card" />;
  const program = cards.data.find((g) => g.id === programId);
  if (!program)
    return (
      <>
        <PageCrumbs items={[tab]} />
        <p>{t('program_page.not_found')}</p>
      </>
    );
  const name = localized(program.name, locale);
  return (
    <>
      <DocumentTitle title={name} />
      <PageCrumbs items={[tab, { id: 'program', label: name }]} />
      <Page title={name} documentTitle={false} />
    </>
  );
}
