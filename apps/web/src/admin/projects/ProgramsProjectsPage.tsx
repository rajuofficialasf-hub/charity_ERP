import { Alert, Button, EmptyState, Page, SegmentedControl, Skeleton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { ProgramDialog } from '../programs/ProgramDialog';
import type { Program } from '../programs/programs-api';
import { canCreateProjects, canManagePrograms, canSeeProjectOverview } from '../roles';
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
 * of the list. The global roles create and edit the programs here; whoever may create a project
 * starts one in the setup wizard.
 */
export function ProgramsProjectsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [dialog, setDialog] = useState<{ program?: Program } | null>(null);
  const [notice, setNotice] = useState<string>();
  const overview = Boolean(me && canSeeProjectOverview(me));
  // both views read the cards: the list names the programs from them, and the header offers a new
  // project by their answer
  const cards = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    enabled: overview,
  });
  if (!me) return null;
  if (!overview) return <ForbiddenContent />;
  const list = opensList(params);
  const manage = canManagePrograms(me);
  // the role opens the wizard; the server's answer says whether any program takes a new project
  // from this caller (an inactive one, or one outside the caller's scope, does not)
  const mayCreate = canCreateProjects(me) && (cards.data ?? []).some((card) => card.canCreate);

  // the dialog has refreshed the program reads after its write, also after one that failed halfway
  const done = (program: Program, key: 'created' | 'saved') => {
    setDialog(null);
    setNotice(t(`cards.notice.${key}`, { code: program.code }));
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
            <SegmentedControl
              label={t('tab.view')}
              value={list ? 'list' : 'cards'}
              options={[
                { value: 'cards', label: t('tab.cards') },
                { value: 'list', label: t('tab.list') },
              ]}
              onChange={(view) => void navigate(view === 'list' ? '?view=list' : '/admin/projects')}
            />
            {manage && !list && (
              <Button startIcon="add" onClick={() => setDialog({})}>
                {t('cards.new_program')}
              </Button>
            )}
            {mayCreate && (
              <Button
                variant={manage && !list ? 'secondary' : 'primary'}
                startIcon="add"
                onClick={() => void navigate('/admin/projects/new')}
              >
                {t('new')}
              </Button>
            )}
          </>
        }
        documentTitle={false}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {list ? (
        <ProjectList />
      ) : (
        <ProgramCards
          onEdit={manage ? (card) => setDialog({ program: programOf(card) }) : undefined}
        />
      )}
      {dialog && (
        <ProgramDialog
          key={dialog.program?.id ?? 'new'}
          program={dialog.program}
          open
          onClose={() => setDialog(null)}
          onDone={(p) => done(p, dialog.program ? 'saved' : 'created')}
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
