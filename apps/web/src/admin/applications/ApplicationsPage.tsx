import { uuidv7 } from '@css/shared';
import { formatCount, formatDate, formatDecimal } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  type ActiveFilter,
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FilterGroup,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  type TableColumn,
  TableToolbar,
  Text,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { stateLabel as labelOf, toneOf } from '../../features/applications/status';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { EmptyValue } from '../EmptyValue';
import { numberedPaging } from '../list-paging';
import { project as loadProject, PROJECTS_KEY } from '../projects/projects-api';
import { canSeeApplications } from '../roles';
import { useTabView } from '../use-tab-view';
import {
  applicationPage,
  APPLICATIONS_KEY,
  type ApplicationSummary,
  type BulkRowResult,
  bulkReview,
  applicationListFilters,
  FILTER_KEYS,
} from './applications-api';
import { QuotaBars } from './QuotaBars';
import './applications.css';
import { ExportButton } from '../../features/exports/ExportButton';

/** The states the status filter offers, in the order of the cycle. */
const STATES = [
  'needs_verification',
  'submitted',
  'under_review',
  'reviewed',
  'waitlisted',
  'approved',
  'implementation',
  'completed',
  'rejected',
] as const;
const FLAGS = ['public_entry', 'existing_identity', 'identity_repeated'] as const;
/** The orders the list offers: as the applications came (the server's default), or the score. */
const BY_SCORE = '-score';

/**
 * The applications of a project for the office (docs/ui/SCREENS.md, "Application review list
 * and detail"): the filters kept in the address, the search, the rows with their state and waiting
 * time, each opening its review page; ticked rows start their review or take their approval in
 * one request, each row on its own.
 */
export function ApplicationsPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('applications.office');
  const locale = useLocale() as Locale;
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one', projectId],
    queryFn: () => loadProject(projectId),
    enabled: Boolean(me && canSeeApplications(me)),
  });
  if (!me) return null;
  if (!canSeeApplications(me)) return <ForbiddenContent />;
  const name = one.data ? localized(one.data.name, locale) : null;
  return (
    <>
      <DocumentTitle title={name ? `${t('title')} · ${name}` : t('title')} />
      <Link to={`/admin/projects/${projectId}`}>{t('back')}</Link>
      <div className="admin-title-row">
        <h1 className="admin-title">{name ? `${t('title')}: ${name}` : t('title')}</h1>
      </div>
      <ApplicationTab projectId={projectId} />
    </>
  );
}

function ApplicationTab({ projectId }: { projectId: string }) {
  const t = useTranslations('applications.office');
  const ts = useTranslations('applications.status');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const { filters, setFilters, change, q, onSearch, page, cursor, goTo, activeCount } =
    useTabView(FILTER_KEYS);
  const list = useQuery({
    queryKey: [...APPLICATIONS_KEY, projectId, filters, q, page, cursor],
    queryFn: () => applicationPage(projectId, filters, q, page, cursor),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<{ action: string; results: BulkRowResult[] } | null>(null);
  const rows = list.data?.data ?? [];
  // a tick belongs to the rows it was made on: another page, filter or search starts with none
  const view = JSON.stringify([filters, q, page, cursor]);
  const [tickedView, setTickedView] = useState(view);
  if (tickedView !== view) {
    setTickedView(view);
    setSelected(new Set());
  }
  const bulk = useMutation({
    mutationFn: (action: 'review' | 'approve') => {
      const chosen = rows.filter((r) => selected.has(r.id));
      return bulkReview(projectId, uuidv7(), {
        action,
        rows: chosen.map((r) => ({ clientUuid: uuidv7(), applicationId: r.id, ifMatch: r.etag })),
      }).then((out) => ({ action, results: out.results }));
    },
    onSuccess: async (out) => {
      setOutcome(out);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
    },
  });
  const stateLabel = (status: string) => labelOf(ts, status);
  const person = (r: ApplicationSummary) => (
    <span className="admin-person-text">
      <Link to={`/admin/applications/${r.id}`} className="admin-person-name">
        {r.beneficiaryName ?? t('unnamed')}
      </Link>
      <span className="admin-person-meta">{r.appNo ?? t('no_number')}</span>
    </span>
  );
  const status = (r: ApplicationSummary) => (
    <span className="admin-badges">
      <Badge variant="dot" tone={toneOf(r.status)} label={stateLabel(r.status)} />
      {r.flags.includes('public_entry') ? (
        <Badge variant="dot" tone="info" label={t('signals.flag.public_entry_short')} />
      ) : null}
    </span>
  );
  const waiting = (r: ApplicationSummary) =>
    r.waitingDays === null ? (
      <EmptyValue label={t('none')} />
    ) : (
      t('waiting', { days: formatCount(r.waitingDays, locale) })
    );
  // a form without points gives no score: the column and the order appear once a score exists
  const scored = filters.sort === BY_SCORE || rows.some((r) => typeof r.totalScore === 'number');
  const score = (r: ApplicationSummary) =>
    typeof r.totalScore !== 'number' ? (
      <EmptyValue label={t('none')} />
    ) : (
      formatDecimal(r.totalScore, 2, locale)
    );
  const columns: TableColumn<ApplicationSummary>[] = [
    { id: 'person', header: t('column.person'), cell: person, isRowHeader: true },
    ...(scored
      ? [
          {
            id: 'score',
            header: t('column.score'),
            cell: score,
            numeric: true,
            priority: 2 as const,
          },
        ]
      : []),
    { id: 'area', header: t('column.area'), cell: (r) => <Area row={r} />, priority: 2 },
    { id: 'status', header: t('column.status'), cell: status },
    {
      id: 'submitted',
      header: t('column.submitted'),
      cell: (r) => (r.submittedAt ? formatDate(r.submittedAt) : <EmptyValue label={t('none')} />),
      priority: 3,
    },
    { id: 'waiting', header: t('column.waiting'), cell: waiting, priority: 3, numeric: true },
  ];
  const activeFilters: ActiveFilter[] = [
    ...(filters.sort === BY_SCORE
      ? [
          {
            id: 'sort',
            label: `${t('sort.label')}: ${t('sort.score')}`,
            onRemove: () => change({ sort: undefined }),
          },
        ]
      : []),
    ...(filters.status
      ? [
          {
            id: 'status',
            label: `${t('filter.status')}: ${stateLabel(filters.status)}`,
            onRemove: () => change({ status: undefined }),
          },
        ]
      : []),
    ...(filters.flag
      ? [
          {
            id: 'flag',
            label: `${t('filter.flag')}: ${t(`signals.flag.${filters.flag as 'public_entry'}`)}`,
            onRemove: () => change({ flag: undefined }),
          },
        ]
      : []),
    ...(filters.divisionId
      ? [
          {
            id: 'area',
            label: t('filter.group_area'),
            onRemove: () =>
              change({
                divisionId: undefined,
                districtId: undefined,
                upazilaId: undefined,
                unionId: undefined,
              }),
          },
        ]
      : []),
  ];
  const meta = list.data?.meta;
  const chosen = rows.filter((r) => selected.has(r.id));
  const canReviewAll = chosen.length > 0 && chosen.every((r) => r.status === 'submitted');
  const canApproveAll = chosen.length > 0 && chosen.every((r) => r.status === 'reviewed');
  return (
    <>
      {outcome ? (
        <Alert tone="info" live="status" onDismiss={() => setOutcome(null)}>
          {t('bulk.outcome', {
            done: formatCount(outcome.results.filter((r) => r.result === 'done').length, locale),
            failed: formatCount(outcome.results.filter((r) => r.result !== 'done').length, locale),
          })}
        </Alert>
      ) : null}
      {bulk.error ? (
        <Alert tone="danger">
          {bulk.error instanceof ApiFailure ? bulk.error.message : tc('state.error.text')}
        </Alert>
      ) : null}
      {chosen.length ? (
        <Stack direction="row" gap={2} wrap className="admin-bulk-bar">
          <Text>{t('bulk.selected', { count: formatCount(chosen.length, locale) })}</Text>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canReviewAll}
            loading={bulk.isPending}
            onPress={() => bulk.mutate('review')}
          >
            {t('action.review')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canApproveAll}
            loading={bulk.isPending}
            onPress={() => bulk.mutate('approve')}
          >
            {t('action.approve')}
          </Button>
        </Stack>
      ) : null}
      <SegmentedControl
        label={t('queue.label')}
        value={filters.status === 'needs_verification' ? 'verification' : 'all'}
        options={[
          { id: 'all', label: t('queue.all') },
          { id: 'verification', label: t('queue.verification') },
        ]}
        onChange={(id) =>
          change({ status: id === 'verification' ? 'needs_verification' : undefined })
        }
      />
      <QuotaBars
        projectId={projectId}
        area={{ unionId: filters.unionId, districtId: filters.districtId }}
      />
      <ExportButton
        list="applications"
        projectId={projectId}
        filters={{ ...applicationListFilters(filters), q }}
      />
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.beneficiaryName ?? r.appNo ?? r.id}
        selectionMode="multiple"
        selectedKeys={selected}
        onSelectionChange={setSelected}
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
        emptyState={<EmptyState icon={ClipboardList} title={t('empty')} headingLevel={2} />}
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            filterMode="panel"
            activeFilterCount={activeCount(['districtId', 'upazilaId', 'unionId'])}
            activeFilters={activeFilters}
            onClearFilters={() => setFilters({})}
            filters={
              <>
                <FilterGroup title={t('filter.group_area')}>
                  <AddressFields
                    optional
                    levels={4}
                    value={{
                      divisionId: filters.divisionId ?? null,
                      districtId: filters.districtId ?? null,
                      upazilaId: filters.upazilaId ?? null,
                      unionId: filters.unionId ?? null,
                    }}
                    onChange={(a) =>
                      change({
                        divisionId: a.divisionId ?? undefined,
                        districtId: a.districtId ?? undefined,
                        upazilaId: a.upazilaId ?? undefined,
                        unionId: a.unionId ?? undefined,
                      })
                    }
                  />
                </FilterGroup>
                <FilterGroup title={t('filter.group_other')}>
                  {scored ? (
                    <Select
                      label={t('sort.label')}
                      value={filters.sort === BY_SCORE ? BY_SCORE : 'arrival'}
                      options={[
                        { id: 'arrival', label: t('sort.arrival') },
                        { id: BY_SCORE, label: t('sort.score') },
                      ]}
                      onChange={(id) => change({ sort: id === BY_SCORE ? BY_SCORE : undefined })}
                    />
                  ) : null}
                  <Select
                    label={t('filter.status')}
                    value={filters.status ?? null}
                    options={STATES.map((s) => ({ id: s, label: stateLabel(s) }))}
                    onChange={(id) => change({ status: id ?? undefined })}
                  />
                  <Select
                    label={t('filter.flag')}
                    value={filters.flag ?? null}
                    options={FLAGS.map((f) => ({ id: f, label: t(`signals.flag.${f}`) }))}
                    onChange={(id) => change({ flag: id ?? undefined })}
                  />
                </FilterGroup>
              </>
            }
          />
        }
        pagination={
          meta
            ? numberedPaging({
                meta,
                shown: rows.length,
                page,
                goTo,
                locale,
                summary: (values) => t('summary', values),
              })
            : undefined
        }
        cardRenderer={(r) => (
          <div className="admin-person-card">
            <div className="admin-person-card-head">{person(r)}</div>
            <Area row={r} />
            {status(r)}
            {scored && typeof r.totalScore === 'number' ? (
              <span>
                {t('column.score')}: {score(r)}
              </span>
            ) : null}
            <span>{waiting(r)}</span>
          </div>
        )}
      />
      {list.isPending ? <Skeleton shape="row" /> : null}
    </>
  );
}

/** The union and the district of the application's address, by name. */
function Area({ row }: { row: ApplicationSummary }) {
  const locale = useLocale() as Locale;
  const union = useLocationName(undefined, row.unionId);
  const district = useLocationName(undefined, row.districtId);
  const text = [union?.[locale], district?.[locale]].filter(Boolean).join(', ');
  return text ? <>{text}</> : <EmptyValue label="—" />;
}
