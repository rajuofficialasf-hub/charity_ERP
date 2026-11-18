import { type Locale, localized } from '@css/shared/i18n';
import { Button, EmptyState, Page, Skeleton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canCreateProjects, canSeeProjectOverview } from '../roles';
import { CARDS_KEY, programCards, seriesCards } from './cards-api';
import { NewSessionDialog } from './NewSessionDialog';
import { ProjectSeriesCard } from './ProjectSeriesCard';
import { SeriesDialog } from './SeriesDialog';
import './cards.css';

/**
 * A program's page inside the programs and projects tab (docs/ui/SCREENS.md, "Project list and
 * project page"): the trail back to the tab, the program's permanent projects as cards, and "নতুন
 * প্রকল্প" for whoever may create a project in this program, by the server's answer. A new project
 * opens the setup of its first session.
 */
export function ProgramPage() {
  const { me } = useAuth();
  const { programId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [sessionOf, setSessionOf] = useState<string | null>(null);
  const allowed = Boolean(me && canSeeProjectOverview(me));
  const cards = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    enabled: allowed,
  });
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series', programId],
    queryFn: () => seriesCards(programId),
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
        <PageCrumbs items={[tab, { id: 'missing', label: t('program_page.unknown') }]} />
        <p>{t('program_page.not_found')}</p>
      </>
    );
  const name = localized(program.name, locale);
  // the role opens the step; the server's answer says whether this program takes a new project
  const mayCreate = canCreateProjects(me) && program.canCreate;

  return (
    <>
      <DocumentTitle title={name} />
      <PageCrumbs items={[tab, { id: 'program', label: name }]} />
      <Page
        documentTitle={false}
        title={name}
        description={program.description ? localized(program.description, locale) : undefined}
        actions={
          mayCreate && (
            <Button startIcon="add" onClick={() => setCreating(true)}>
              {t('program_page.new_project')}
            </Button>
          )
        }
      />
      {series.error ? (
        <LoadError error={series.error} onRetry={() => void series.refetch()} />
      ) : !series.data ? (
        <div className="cards-grid" aria-busy="true">
          <Skeleton shape="card" />
          <Skeleton shape="card" />
        </div>
      ) : !series.data.length ? (
        <EmptyState title={t('program_page.empty')} icon="folder" />
      ) : (
        <section className="cards-grid" aria-label={t('program_page.label')}>
          {series.data.map((card) => (
            <ProjectSeriesCard
              key={card.id}
              series={card}
              onNewSession={
                canCreateProjects(me) && card.canCreate ? () => setSessionOf(card.id) : undefined
              }
            />
          ))}
        </section>
      )}
      {creating && (
        <SeriesDialog
          program={{ id: program.id, name: program.name }}
          onClose={() => setCreating(false)}
          onDone={({ series: made, coverProblem }) =>
            void navigate(`/admin/projects/new?seriesId=${made.id}`, {
              state: coverProblem ? { notice: coverProblem } : null,
            })
          }
        />
      )}
      {sessionOf && <NewSessionDialog seriesId={sessionOf} onClose={() => setSessionOf(null)} />}
    </>
  );
}
