import { formatDate, formatTaka, isoDateInDhaka, TAKA_SIGN } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { NisabVersionView } from '@css/shared/settings';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  StatCard,
  Table,
  type TableColumn,
  Text,
  PageHeader,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Plus, Scale, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { ReasonDialog } from '../projects/ReasonDialog';
import { canKeepNisab } from '../roles';
import { NisabDialog } from './NisabDialog';
import { NISAB_KEY, nisabVersions, withdrawNisab } from './nisab-api';

/**
 * The zakat nisab (docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17): the
 * version in force today, every version with its effective date, adding a version, and
 * withdrawing one that has not taken effect, with a reason. A version is never edited.
 */
export function NisabPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.nisab');
  const tc = useTranslations('common');
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
      <Badge tone="neutral" label={t('state.withdrawn')} />
    ) : v.inForce ? (
      <Badge tone="success" label={t('state.in_force')} />
    ) : v.effectiveFrom > today ? (
      <Badge tone="info" label={t('state.upcoming')} />
    ) : (
      <Badge tone="neutral" label={t('state.past')} />
    );
  // only a version that has not taken effect can be withdrawn; the server checks it too
  const canWithdraw = (v: NisabVersionView) => !v.withdrawn && v.effectiveFrom > today;
  const columns: TableColumn<NisabVersionView>[] = [
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
      <Button variant="ghost" size="sm" icon={Undo2} iconOnly onPress={() => askWithdraw(v)}>
        {t('withdraw', { date: formatDate(v.effectiveFrom) })}
      </Button>
    ) : null;

  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button icon={Plus} onPress={() => setAdding(true)}>
            {t('new')}
          </Button>
        }
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {current ? (
        <section aria-label={t('stats.label')} className="admin-stats">
          <StatCard
            label={t('in_force')}
            prefix={TAKA_SIGN}
            value={Number(current.value)}
            icon={Scale}
            tone="warning"
            context={t('since', { date: formatDate(current.effectiveFrom) })}
          />
          <StatCard label={t('stats.versions')} value={rows.length} icon={History} tone="info" />
        </section>
      ) : (
        !list.isPending && (
          <Card>
            <Text>{t('none')}</Text>
          </Card>
        )
      )}
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(v) => v.id}
        rowLabel={(v) => formatDate(v.effectiveFrom)}
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
        emptyState={<EmptyState icon={Scale} title={t('empty')} headingLevel={2} />}
        rowActions={withdrawButton}
        cardRenderer={(v) => (
          <div className="admin-permission-card">
            <strong>{formatDate(v.effectiveFrom)}</strong>
            <span>{taka(v)}</span>
            {state(v)}
            {v.basisNote && <span>{v.basisNote}</span>}
            {canWithdraw(v) && (
              <Button variant="secondary" size="sm" onPress={() => askWithdraw(v)}>
                {t('withdraw_short')}
              </Button>
            )}
          </div>
        )}
      />
      <Card accent title={t('history.title')} headingLevel={2}>
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
