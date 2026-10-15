import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Badge, Button, EmptyState, ErrorState, Table, type TableColumn } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canManagePrograms, canSeePrograms } from '../roles';
import { ProgramDialog } from './ProgramDialog';
import { type Program, PROGRAMS_KEY, programs } from './programs-api';

/**
 * The programs (DECISION_LOG D-095): officials see the programs in their scope with their PM; the
 * Department Head and the Monitoring Team create, rename, deactivate and activate them and assign
 * the PM. The server checks every write anyway.
 */
export function ProgramsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.programs');
  const tc = useTranslations('common');
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

  const columns: TableColumn<Program>[] = [
    { id: 'code', header: t('column.code'), cell: (p) => p.code },
    {
      id: 'name',
      header: t('column.name'),
      cell: (p) => localized(p.name, locale),
      isRowHeader: true,
    },
    { id: 'pm', header: t('column.pm'), cell: (p) => p.pmName ?? t('no_pm'), priority: 2 },
    {
      id: 'state',
      header: t('column.state'),
      cell: (p) => (
        <Badge
          tone={p.active ? 'success' : 'neutral'}
          label={p.active ? t('state.active') : t('state.inactive')}
        />
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
      <div className="admin-title-row">
        <h1 className="admin-title">{t('title')}</h1>
        {manage && <Button onPress={() => setDialog({})}>{t('new')}</Button>}
      </div>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Table
        label={t('table')}
        columns={columns}
        rows={list.data ?? []}
        rowKey={(p) => p.id}
        rowLabel={(p) => localized(p.name, locale)}
        loading={list.isPending}
        error={
          list.error ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={list.error instanceof ApiFailure ? list.error.requestId : undefined}
              onRetry={() => void list.refetch()}
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={Layers} title={t('empty')} headingLevel={2} />}
        rowActions={
          manage
            ? (p) => (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Pencil}
                  iconOnly
                  onPress={() => setDialog({ program: p })}
                >
                  {t('edit', { name: localized(p.name, locale) })}
                </Button>
              )
            : undefined
        }
        cardRenderer={(p) => (
          <div className="admin-permission-card">
            <strong>{localized(p.name, locale)}</strong>
            <span>{p.code}</span>
            <span>{p.pmName ?? t('no_pm')}</span>
            <Badge
              tone={p.active ? 'success' : 'neutral'}
              label={p.active ? t('state.active') : t('state.inactive')}
            />
            {manage && (
              <Button variant="secondary" size="sm" onPress={() => setDialog({ program: p })}>
                {tc('action.edit')}
              </Button>
            )}
          </div>
        )}
      />
      {dialog && (
        <ProgramDialog
          key={dialog.program?.id ?? 'new'}
          program={dialog.program}
          isOpen
          onClose={() => setDialog(null)}
          onDone={(p) => done(p, dialog.program ? 'saved' : 'created')}
        />
      )}
    </>
  );
}
