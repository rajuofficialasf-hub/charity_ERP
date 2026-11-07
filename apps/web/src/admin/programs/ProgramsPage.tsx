import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  DataTable,
  IconButton,
  Page,
  PersonCell,
  StatCard,
  type DataTableExtendedColumn,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canManagePrograms, canSeePrograms } from '../roles';
import { ProgramDialog } from './ProgramDialog';
import { type Program, PROGRAMS_KEY, programs } from './programs-api';
import { LoadError } from '../../components/LoadError';

/**
 * The programs (DECISION_LOG D-095): officials see the programs in their scope with their PM; the
 * Department Head and the Monitoring Team create, rename, deactivate and activate them and assign
 * the PM. The server checks every write anyway.
 */
export function ProgramsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.programs');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ program?: Program } | null>(null);
  const [notice, setNotice] = useState<string>();
  const list = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: programs,
    enabled: Boolean(me && canSeePrograms(me)),
  });
  if (!me) return null;
  if (!canSeePrograms(me)) return <ForbiddenContent />;
  const manage = canManagePrograms(me);

  const rows = list.data ?? [];
  const name = (p: Program) => <PersonCell name={localized(p.name, locale)} secondary={p.code} />;
  const columns: DataTableExtendedColumn<Program>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    { id: 'pm', header: t('column.pm'), cell: (p) => p.pmName ?? t('no_pm'), priority: 2 },
    {
      id: 'state',
      header: t('column.state'),
      cell: (p) => (
        <Chip tone={p.active ? 'success' : 'neutral'}>
          {p.active ? t('state.active') : t('state.inactive')}
        </Chip>
      ),
    },
  ];
  const done = (program: Program, key: 'created' | 'saved') => {
    setDialog(null);
    setNotice(t(`notice.${key}`, { code: program.code }));
    void queryClient.invalidateQueries({ queryKey: PROGRAMS_KEY });
  };

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          manage && (
            <Button startIcon="add" onClick={() => setDialog({})}>
              {t('new')}
            </Button>
          )
        }
        documentTitle={false}
      />
      {list.data && (
        <section aria-label={t('stats.label')} className="admin-stats">
          <StatCard
            label={t('stats.active')}
            value={rows.filter((p) => p.active).length}
            icon="success"
            tone="primary"
          />
          <StatCard
            label={t('stats.inactive')}
            value={rows.filter((p) => !p.active).length}
            icon="block"
            tone="neutral"
          />
          <StatCard
            label={t('stats.no_pm')}
            value={rows.filter((p) => !p.pmName).length}
            icon="user-block"
            tone="warning"
          />
        </section>
      )}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(p) => p.id}
        rowLabel={(p) => localized(p.name, locale)}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={
          manage
            ? (p) => (
                <IconButton
                  label={t('edit', { name: localized(p.name, locale) })}
                  icon="edit"

                  onClick={() => setDialog({ program: p })}
                />
              )
            : undefined
        }
        cardRenderer={(p) => (
          <div className="admin-permission-card">
            {name(p)}
            <span>{p.pmName ?? t('no_pm')}</span>
            <Chip tone={p.active ? 'success' : 'neutral'}>
              {p.active ? t('state.active') : t('state.inactive')}
            </Chip>
          </div>
        )}
      />
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
