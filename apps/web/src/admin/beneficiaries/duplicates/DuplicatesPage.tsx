import { formatCount, formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  DataTable,
  FilterBar,
  LinkButton,
  Page,
  Tabs,
  type DataTableExtendedColumn,
} from '@/ui';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import { ReasonDialog } from '../../projects/ReasonDialog';
import { canReviewDuplicates } from '../../roles';
import { useHandedNotice } from '../../use-handed-notice';
import { useTabView } from '../../use-tab-view';
import { BENEFICIARIES_KEY } from '../beneficiaries-api';
import {
  candidatePage,
  comparePath,
  dismissPair,
  DUPLICATES_KEY,
  type MergeCandidate,
  proposalPage,
  type MergeView,
  PAIR_LEVELS,
  pairLevelOf,
} from './merge-api';
import { PairLevelChip } from './PairLevelChip';
import { PageCrumbs } from '../../../components/shell/breadcrumb';
import { LoadError } from '../../../components/LoadError';

/**
 * The suggested duplicate profiles in the caller's scope, with the rules each pair meets and how
 * sure it is (probable first; the level filter lives in the address): an official compares a pair
 * or marks it as two different people; the merge proposals waiting for a decision are listed
 * beside them. The server decides what each list holds.
 */
export function DuplicatesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.beneficiaries');
  const { notice, setNotice, dismiss } = useHandedNotice();
  if (!me) return null;
  if (!canReviewDuplicates(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('duplicates.title')} />
      <PageCrumbs
        items={[
          { id: 'list', label: t('profile.back'), href: '/admin/beneficiaries' },
          { id: 'duplicates', label: t('duplicates.title') },
        ]}
      />
      <Page
        eyebrow={t('duplicates.eyebrow')}
        title={t('duplicates.title')}
        description={t('duplicates.description')}
        actions={
          <LinkButton variant="secondary" startIcon="arrow-left" to="/admin/beneficiaries">
            {t('duplicates.back')}
          </LinkButton>
        }
        documentTitle={false}
      />
      {notice && (
        <Alert tone="success" onDismiss={dismiss}>
          {notice}
        </Alert>
      )}
      <Tabs
        label={t('duplicates.tabs.label')}
        items={[
          {
            value: 'pairs',
            label: t('duplicates.tabs.pairs'),
            content: <Pairs onNotice={setNotice} />,
          },
          { value: 'proposals', label: t('duplicates.tabs.proposals'), content: <Proposals /> },
        ]}
      />
    </>
  );
}

function Pairs({ onNotice }: { onNotice: (message: string) => void }) {
  const t = useTranslations('admin.beneficiaries.duplicates');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState<MergeCandidate | null>(null);
  const { filters, change } = useTabView(['level'] as const);
  const level = pairLevelOf(filters.level ?? null);
  const list = useInfiniteQuery({
    queryKey: [...DUPLICATES_KEY, 'pairs', level ?? 'all'],
    queryFn: ({ pageParam }) => candidatePage(pageParam, level),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
  });
  const dismiss = useMutation({
    mutationFn: ({ pair, reason }: { pair: MergeCandidate; reason: string }) =>
      dismissPair({
        beneficiaryId: pair.beneficiaryId,
        otherBeneficiaryId: pair.otherBeneficiaryId,
        reason,
      }),
    onSuccess: () => {
      setDismissing(null);
      onNotice(t('dismissed'));
      void queryClient.invalidateQueries({ queryKey: BENEFICIARIES_KEY });
    },
  });

  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const person = (id: string, name: string, benNo: string) => (
    <span className="admin-person-text">
      <Link to={`/admin/beneficiaries/${id}`} className="admin-person-name">
        {name}
      </Link>
      <span className="admin-person-meta">{benNo}</span>
    </span>
  );
  const rules = (r: MergeCandidate) => (
    <span className="admin-badges">
      {r.matchedOn.map((rule) => (
        <Chip key={rule} tone="info">
          {t(`rules.${rule}`)}
        </Chip>
      ))}
    </span>
  );
  const actions = (r: MergeCandidate) => (
    <span className="admin-badges">
      <LinkButton
        variant="secondary"

        startIcon="compare"
        to={comparePath(r.beneficiaryId, r.otherBeneficiaryId)}
      >
        {t('compare')}
      </LinkButton>
      <Button
        variant="text"
        size="small"
        startIcon="user-block"
        onClick={() => {
          dismiss.reset();
          setDismissing(r);
        }}
      >
        {t('dismiss')}
      </Button>
    </span>
  );
  const columns: DataTableExtendedColumn<MergeCandidate>[] = [
    {
      id: 'first',
      header: t('column.first'),
      cell: (r) => person(r.beneficiaryId, r.name, r.benNo),
      isRowHeader: true,
    },
    {
      id: 'second',
      header: t('column.second'),
      cell: (r) => person(r.otherBeneficiaryId, r.otherName, r.otherBenNo),
    },
    { id: 'level', header: t('column.level'), cell: (r) => <PairLevelChip level={r.level} /> },
    { id: 'rules', header: t('column.rules'), cell: rules },
  ];
  const pairName = (r: MergeCandidate) => t('pair', { first: r.name, second: r.otherName });
  const fetchMore = () => void list.fetchNextPage();

  return (
    <>
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.beneficiaryId}|${r.otherBeneficiaryId}`}
        rowLabel={pairName}
        rowActions={actions}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        toolbar={
          <FilterBar
            label={t('level.filter')}
            chips={[
              { id: 'all', label: t('level.all') },
              ...PAIR_LEVELS.map((l) => ({ id: l, label: t(`level.${l}`) })),
            ]}
            activeChip={level ?? 'all'}
            onChipChange={(id) => change({ level: id === 'all' ? undefined : id })}
          />
        }
        cursorPagination={
          rows.length
            ? {
                hasPrevious: false,
                hasNext: list.hasNextPage,
                onNext: fetchMore,
                onLoadMore: fetchMore,
                summary: t('summary', { count: formatCount(rows.length, locale) }),
              }
            : undefined
        }
        cardRenderer={(r) => (
          <div className="admin-person-card">
            {person(r.beneficiaryId, r.name, r.benNo)}
            {person(r.otherBeneficiaryId, r.otherName, r.otherBenNo)}
            <PairLevelChip level={r.level} />
            {rules(r)}
          </div>
        )}
      />
      {dismissing && (
        <ReasonDialog
          title={t('dismiss_title', { first: dismissing.benNo, second: dismissing.otherBenNo })}
          confirm={t('dismiss')}
          pending={dismiss.isPending}
          error={dismiss.error}
          onConfirm={({ reason }) => dismiss.mutate({ pair: dismissing, reason })}
          onClose={() => setDismissing(null)}
        />
      )}
    </>
  );
}

function Proposals() {
  const t = useTranslations('admin.beneficiaries.duplicates.proposals');
  const locale = useLocale() as Locale;
  const list = useInfiniteQuery({
    queryKey: [...DUPLICATES_KEY, 'proposals'],
    queryFn: ({ pageParam }) => proposalPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const fetchMore = () => void list.fetchNextPage();
  const person = (id: string, name: string, benNo: string) => (
    <span className="admin-person-text">
      <Link to={`/admin/beneficiaries/${id}`} className="admin-person-name">
        {name}
      </Link>
      <span className="admin-person-meta">{benNo}</span>
    </span>
  );
  const open = (r: MergeView) => (
    <LinkButton
      variant="secondary"

      startIcon="merge"
      to={comparePath(r.keptId, r.mergedId, r.id)}
    >
      {t('open')}
    </LinkButton>
  );
  const columns: DataTableExtendedColumn<MergeView>[] = [
    {
      id: 'kept',
      header: t('kept'),
      cell: (r) => person(r.keptId, r.keptName, r.keptBenNo),
      isRowHeader: true,
    },
    {
      id: 'merged',
      header: t('merged'),
      cell: (r) => person(r.mergedId, r.mergedName, r.mergedBenNo),
    },
    { id: 'reason', header: t('reason'), cell: (r) => r.reason, priority: 3 },
    { id: 'at', header: t('proposed_at'), cell: (r) => formatDate(r.proposedAt), priority: 2 },
  ];
  return (
    <DataTable
      label={t('table')}
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      rowLabel={(r) => `${r.keptBenNo} ${r.mergedBenNo}`}
      rowActions={open}
      loading={list.isPending}
      error={
        list.error ? (
          <LoadError error={list.error} onRetry={() => void list.refetch()} />
        ) : undefined
      }
      emptyTitle={t('empty')}
      cursorPagination={
        rows.length
          ? {
              hasPrevious: false,
              hasNext: list.hasNextPage,
              onNext: fetchMore,
              onLoadMore: fetchMore,
              summary: t('summary', { count: formatCount(rows.length, locale) }),
            }
          : undefined
      }
      cardRenderer={(r) => (
        <div className="admin-person-card">
          {person(r.keptId, r.keptName, r.keptBenNo)}
          {person(r.mergedId, r.mergedName, r.mergedBenNo)}
          <span>{r.reason}</span>
        </div>
      )}
    />
  );
}
