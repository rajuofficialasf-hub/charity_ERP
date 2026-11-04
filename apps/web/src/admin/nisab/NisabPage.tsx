import { formatDate, formatTaka, isoDateInDhaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { NisabVersionView } from '@css/shared/settings';
import {
  Alert,
  Button,
  Card,
  Chip,
  DataTable,
  IconButton,
  Page,
  StatCard,
  Text,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { ReasonDialog } from '../projects/ReasonDialog';
import { canKeepNisab } from '../roles';
import { NisabDialog } from './NisabDialog';
import { NISAB_KEY, nisabVersions, withdrawNisab } from './nisab-api';
import { LoadError } from '../../components/LoadError';

/**
 * The zakat nisab (docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17): the
 * version in force today, every version with its effective date, adding a version, and
 * withdrawing one that has not taken effect, with a reason. A version is never edited.
 */
export function NisabPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.nisab');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const allowed = Boolean(me && canKeepNisab(me));
  const list = useQuery({ queryKey: NISAB_KEY, queryFn: nisabVersions, enabled: allowed });
  const [adding, setAdding] = useState(false);
  const [withdrawing, setWithdrawing] = useState<NisabVersionView | null>(null);
  const [notice, setNotice] = useState<string>();
  const withdraw = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => withdrawNisab(id, reason),
    onSuccess: (v) => {
      setWithdrawing(null);
      setNotice(t('notice.withdrawn', { date: formatDate(v.effectiveFrom) }));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NISAB_KEY }),
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const rows = list.data ?? [];
  const current = rows.find((v) => v.inForce);
  const latestLive = rows.find((v) => !v.withdrawn);
  const today = isoDateInDhaka(new Date());
  const taka = (v: NisabVersionView) => formatTaka(Number(v.value), locale);
  const state = (v: NisabVersionView) =>
    v.withdrawn ? (
      <Chip tone="neutral">{t('state.withdrawn')}</Chip>
    ) : v.inForce ? (
      <Chip tone="success">{t('state.in_force')}</Chip>
    ) : v.effectiveFrom > today ? (
      <Chip tone="info">{t('state.upcoming')}</Chip>
    ) : (
      <Chip tone="neutral">{t('state.past')}</Chip>
    );
  // only a version that has not taken effect can be withdrawn; the server checks it too
  const canWithdraw = (v: NisabVersionView) => !v.withdrawn && v.effectiveFrom > today;
  const columns: DataTableExtendedColumn<NisabVersionView>[] = [
    {
      id: 'date',
      header: t('column.effective_from'),
      cell: (v) => formatDate(v.effectiveFrom),
      isRowHeader: true,
    },
    { id: 'value', header: t('column.value'), cell: taka },
    { id: 'state', header: t('column.state'), cell: state },
    { id: 'basis', header: t('column.basis'), cell: (v) => v.basisNote ?? '—', priority: 3 },
    {
      id: 'by',
      header: t('column.set_by'),
      cell: (v) =>
        v.withdrawn
          ? t('withdrawn_by', { name: v.withdrawn.by.name, reason: v.withdrawn.reason })
          : v.setBy.name,
      priority: 2,
    },
  ];
  // each withdrawal dialog starts clean, without the answer of an earlier one
  const askWithdraw = (v: NisabVersionView | null) => {
    withdraw.reset();
    setWithdrawing(v);
  };
  const withdrawButton = (v: NisabVersionView) =>
    canWithdraw(v) ? (
      <IconButton
        label={t('withdraw', { date: formatDate(v.effectiveFrom) })}
        icon="undo"
        onClick={() => askWithdraw(v)}
      />
    ) : null;

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button startIcon="add" onClick={() => setAdding(true)}>
            {t('new')}
          </Button>
        }
        documentTitle={false}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {current ? (
        <section aria-label={t('stats.label')} className="admin-stats">
          <StatCard label={t('in_force')} value={taka(current)} icon="scale" tone="warning" />
          <StatCard label={t('stats.versions')} value={rows.length} icon="history" tone="info" />
        </section>
      ) : null}
      {current ? (
        <Text tone="muted" size="small">
          {t('since', { date: formatDate(current.effectiveFrom) })}
        </Text>
      ) : (
        !list.isPending && (
          <Card>
            <Text>{t('none')}</Text>
          </Card>
        )
      )}
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(v) => v.id}
        rowLabel={(v) => formatDate(v.effectiveFrom)}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={withdrawButton}
        cardRenderer={(v) => (
          <div className="admin-permission-card">
            <strong>{formatDate(v.effectiveFrom)}</strong>
            <span>{taka(v)}</span>
            {state(v)}
            {v.basisNote && <span>{v.basisNote}</span>}
            {canWithdraw(v) && (
              <Button variant="secondary" size="small" onClick={() => askWithdraw(v)}>
                {t('withdraw_short')}
              </Button>
            )}
          </div>
        )}
      />
      <Card title={t('history.title')} headingLevel={2}>
        <Text tone="muted">{t('history.body')}</Text>
      </Card>
      {adding && (
        <NisabDialog
          latest={latestLive}
          onClose={() => setAdding(false)}
          onDone={(v) => {
            setAdding(false);
            setNotice(t('notice.added', { date: formatDate(v.effectiveFrom) }));
            void queryClient.invalidateQueries({ queryKey: NISAB_KEY });
          }}
        />
      )}
      {withdrawing && (
        <ReasonDialog
          title={t('withdraw', { date: formatDate(withdrawing.effectiveFrom) })}
          confirm={t('withdraw_short')}
          danger
          pending={withdraw.isPending}
          error={withdraw.error}
          onConfirm={({ reason }) => withdraw.mutate({ id: withdrawing.id, reason })}
          onClose={() => askWithdraw(null)}
        />
      )}
    </>
  );
}
