import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PersonCell,
  Table,
  type TableColumn,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleOff, Layers, Pencil, Plus, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canManagePrograms, canSeePrograms } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
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

  const rows = list.data ?? [];
  const name = (p: Program) => <PersonCell name={localized(p.name, locale)} secondary={p.code} />;
  const columns: TableColumn<Program>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    { id: 'pm', header: t('column.pm'), cell: (p) => p.pmName ?? t('no_pm'), priority: 2 },
    {
      id: 'state',
      header: t('column.state'),
      cell: (p) => (
        <Badge
          variant="dot"
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
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          manage && (
            <Button icon={Plus} onPress={() => setDialog({})}>
              {t('new')}
            </Button>
          )
        }
      />
      {list.data && (
        <StatisticsBar
          label={t('stats.label')}
          items={[
            {
              key: 'active',
              label: t('stats.active'),
              value: rows.filter((p) => p.active).length,
              icon: CircleCheck,
              tone: 'brand',
            },
            {
              key: 'inactive',
              label: t('stats.inactive'),
              value: rows.filter((p) => !p.active).length,
              icon: CircleOff,
            },
            {
              key: 'no_pm',
              label: t('stats.no_pm'),
              value: rows.filter((p) => !p.pmName).length,
              icon: UserRoundX,
              tone: 'warning',
            },
          ]}
        />
      )}
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
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
            {name(p)}
            <span>{p.pmName ?? t('no_pm')}</span>
            <Badge
              variant="dot"
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
