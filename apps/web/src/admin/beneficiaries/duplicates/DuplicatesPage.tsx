import { formatCount, formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  type TableColumn,
  Tabs,
} from '@css/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitCompare, GitMerge, Users, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { ApiFailure } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import { ReasonDialog } from '../../projects/ReasonDialog';
import { canReviewDuplicates } from '../../roles';
import { useHandedNotice } from '../../use-handed-notice';
import { BENEFICIARIES_KEY } from '../beneficiaries-api';
import {
  candidatePage,
  comparePath,
  dismissPair,
  DUPLICATES_KEY,
  type MergeCandidate,
  mergeProposals,
  type MergeView,
} from './merge-api';
import { PageCrumbs } from '../../../components/shell/breadcrumb';

/**
 * The suggested duplicate profiles in the caller's scope, with the rules each pair meets: an
 * official compares a pair or marks it as two different people; the merge proposals waiting for a
 * decision are listed beside them. The server decides what each list holds.
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
      <PageHeader
        eyebrow={t('duplicates.eyebrow')}
        title={t('duplicates.title')}
        description={t('duplicates.description')}
        actions={
          <Button variant="secondary" icon={ArrowLeft} href="/admin/beneficiaries">
            {t('duplicates.back')}
          </Button>
        }
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={dismiss}>
          {notice}
        </Alert>
      )}
      <Tabs
        label={t('duplicates.tabs.label')}
        items={[
          {
            id: 'pairs',
            label: t('duplicates.tabs.pairs'),
            content: <Pairs onNotice={setNotice} />,
          },
          { id: 'proposals', label: t('duplicates.tabs.proposals'), content: <Proposals /> },
        ]}
      />
    </>
  );
}

function Pairs({ onNotice }: { onNotice: (message: string) => void }) {
  const t = useTranslations('admin.beneficiaries.duplicates');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState<MergeCandidate | null>(null);
  const list = useInfiniteQuery({
    queryKey: [...DUPLICATES_KEY, 'pairs'],
    queryFn: ({ pageParam }) => candidatePage(pageParam),
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
        <Badge key={rule} tone="info" label={t(`rules.${rule}`)} />
      ))}
    </span>
  );
  const actions = (r: MergeCandidate) => (
    <span className="admin-badges">
      <Button
        variant="secondary"
        size="sm"
        icon={GitCompare}
        href={comparePath(r.beneficiaryId, r.otherBeneficiaryId)}
      >
        {t('compare')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={UserX}
        onPress={() => {
          dismiss.reset();
          setDismissing(r);
        }}
      >
        {t('dismiss')}
      </Button>
    </span>
  );
  const columns: TableColumn<MergeCandidate>[] = [
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
    { id: 'rules', header: t('column.rules'), cell: rules },
  ];
  const pairName = (r: MergeCandidate) => t('pair', { first: r.name, second: r.otherName });
  const fetchMore = () => void list.fetchNextPage();

  return (
    <>
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.beneficiaryId}|${r.otherBeneficiaryId}`}
        rowLabel={pairName}
        rowActions={actions}
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
        emptyState={<EmptyState icon={Users} title={t('empty')} headingLevel={2} />}
        pagination={
          rows.length
            ? {
                shown: rows.length,
                total: rows.length,
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
            {rules(r)}
            {actions(r)}
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
  const tc = useTranslations('common');
  const list = useQuery({ queryKey: [...DUPLICATES_KEY, 'proposals'], queryFn: mergeProposals });
  const rows = list.data ?? [];
  const person = (id: string, name: string, benNo: string) => (
    <span className="admin-person-text">
      <Link to={`/admin/beneficiaries/${id}`} className="admin-person-name">
        {name}
      </Link>
      <span className="admin-person-meta">{benNo}</span>
    </span>
  );
  const open = (r: MergeView) => (
    <Button
      variant="secondary"
      size="sm"
      icon={GitMerge}
      href={comparePath(r.keptId, r.mergedId, r.id)}
    >
      {t('open')}
    </Button>
  );
  const columns: TableColumn<MergeView>[] = [
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
    <Table
      layout="panel"
      label={t('table')}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowLabel={(r) => `${r.keptBenNo} ${r.mergedBenNo}`}
      rowActions={open}
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
      emptyState={<EmptyState icon={GitMerge} title={t('empty')} headingLevel={2} />}
      cardRenderer={(r) => (
        <div className="admin-person-card">
          {person(r.keptId, r.keptName, r.keptBenNo)}
          {person(r.mergedId, r.mergedName, r.mergedBenNo)}
          <span>{r.reason}</span>
          {open(r)}
        </div>
      )}
    />
  );
}
