import { Alert, Button, EmptyState, Page, SegmentedControl, Skeleton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { ProgramDialog, type ProgramLook } from '../programs/ProgramDialog';
import type { Program } from '../programs/programs-api';
import { canListProjects, canManagePrograms, canSeeProjectOverview } from '../roles';
import { CARDS_KEY, type ProgramCard as Card, programCards } from './cards-api';
import { ProgramCard } from './ProgramCard';
import { ProjectList } from './ProjectList';
import { opensList } from './projects-api';
import './cards.css';

/** The program a card stands for, as the program dialog edits it. */
const programOf = (card: Card): Program => ({
  id: card.id,
  code: card.code,
  name: card.name,
  pmUserId: card.pm?.id ?? null,
  pmName: card.pm?.name ?? null,
  active: card.active,
});

/**
 * The programs and projects tab (docs/ui/SCREENS.md, "Project list and project page"): every
 * program as a card for everyone who holds the overview, and the second view "তালিকা", the list of
 * every session in the caller's scope. The view lives in the address: `view=list`, or any filter
 * of the list. The global roles create and edit the programs here; a new project starts on its
 * program's page.
 */
export function ProgramsProjectsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [dialog, setDialog] = useState<{ program?: Program; look?: ProgramLook } | null>(null);
  const [notice, setNotice] = useState<{ text: string; warning: boolean }>();
  if (!me) return null;
  if (!canListProjects(me)) return <ForbiddenContent />;
  // without the overview there are no cards: the list is the whole tab
  const overview = canSeeProjectOverview(me);
  const list = !overview || opensList(params);
  const manage = canManagePrograms(me);

  // the dialog has refreshed the program reads after its write, also after one that failed halfway
  const done = (program: Program, key: 'created' | 'saved', coverProblem?: string) => {
    setDialog(null);
    setNotice(
      coverProblem
        ? { text: coverProblem, warning: true }
        : { text: t(`cards.notice.${key}`, { code: program.code }), warning: false },
    );
  };

  return (
    <>
      <DocumentTitle title={t('tab.title')} />
      <Page
        eyebrow={t('tab.eyebrow')}
        title={t('tab.title')}
        description={t('tab.description')}
        actions={
          <>
            {overview && (
              <SegmentedControl
                label={t('tab.view')}
                value={list ? 'list' : 'cards'}
                options={[
                  { value: 'cards', label: t('tab.cards') },
                  { value: 'list', label: t('tab.list') },
                ]}
                onChange={(view) =>
                  void navigate(view === 'list' ? '?view=list' : '/admin/projects')
                }
              />
            )}
            {manage && !list && (
              <Button startIcon="add" onClick={() => setDialog({})}>
                {t('cards.new_program')}
              </Button>
            )}
          </>
        }
        documentTitle={false}
      />
      {notice && (
        <Alert tone={notice.warning ? 'warning' : 'success'} onDismiss={() => setNotice(undefined)}>
          {notice.text}
        </Alert>
      )}
      {list ? (
        <ProjectList overview={overview} />
      ) : (
        <ProgramCards
          onEdit={
            manage
              ? (card) =>
                  setDialog({
                    program: programOf(card),
                    look: { description: card.description, coverFileId: card.coverFileId },
                  })
              : undefined
          }
        />
      )}
      {dialog && (
        <ProgramDialog
          key={dialog.program?.id ?? 'new'}
          program={dialog.program}
          look={dialog.look}
          open
          onClose={() => setDialog(null)}
          onDone={(p, coverProblem) => done(p, dialog.program ? 'saved' : 'created', coverProblem)}
        />
      )}
    </>
  );
}

/** Every program as a card, by code; loading, empty and failed reads said in place. */
function ProgramCards({ onEdit }: { onEdit?: (card: Card) => void }) {
  const t = useTranslations('admin.projects.cards');
  const cards = useQuery({ queryKey: [...CARDS_KEY, 'programs'], queryFn: programCards });
  if (cards.error) return <LoadError error={cards.error} onRetry={() => void cards.refetch()} />;
  if (!cards.data)
    return (
      <div className="cards-grid" aria-busy="true">
        <Skeleton shape="card" />
        <Skeleton shape="card" />
        <Skeleton shape="card" />
      </div>
    );
  if (!cards.data.length) return <EmptyState title={t('empty')} icon="folder" />;
  return (
    <section className="cards-grid" aria-label={t('label')}>
      {cards.data.map((card) => (
        <ProgramCard
          key={card.id}
          program={card}
          onEdit={onEdit ? () => onEdit(card) : undefined}
        />
      ))}
    </section>
  );
}
