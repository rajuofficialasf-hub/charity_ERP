import { uuidv7 } from '@css/shared';
import { formatCount, formatDate, formatDecimal } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  ConfirmDialog,
  DataTable,
  FilterBar,
  Page,
  RadioGroup,
  SelectField,
  Skeleton,
  type ActiveFilter,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { NoDocumentChip, ThroughVolunteerChip } from '../../components/PersonMarks';
import { stateLabel as labelOf, stateTone } from '../../features/applications/status';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../api/client';
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
import { LoadError } from '../../components/LoadError';

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
      <Page title={name ? `${t('title')}: ${name}` : t('title')} documentTitle={false} />
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
  const { filters, setFilters, change, q, onSearch, page, cursor, goTo } = useTabView(FILTER_KEYS);
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
  // the approval of the ticked rows is asked once more before it is sent
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const bulk = useMutation({
    mutationFn: (action: 'review' | 'approve') => {
      const chosen = rows.filter((r) => selected.has(r.id));
      return bulkReview(projectId, uuidv7(), {
        action,
        rows: chosen.map((r) => ({ clientUuid: uuidv7(), applicationId: r.id, ifMatch: r.etag })),
      }).then((out) => ({ action, results: out.results }));
    },
    onSettled: () => setConfirmingBulk(false),
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
      <Chip tone={stateTone(r.status)}>{stateLabel(r.status)}</Chip>
      {r.flags.includes('public_entry') ? (
        <Chip tone="info">{t('signals.flag.public_entry_short')}</Chip>
      ) : null}
      {r.hasDocument === false ? <NoDocumentChip /> : null}
      {r.hasMobile === false ? <ThroughVolunteerChip /> : null}
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
  const columns: DataTableExtendedColumn<ApplicationSummary>[] = [
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
  // a row the list no longer holds (another official moved it) leaves the selection, so the bar
  // counts only the rows the buttons act on
  const chosen = rows.filter((r) => selected.has(r.id));
  const shownSelection = new Set(chosen.map((r) => r.id));
  const canReviewAll = chosen.length > 0 && chosen.every((r) => r.status === 'submitted');
  const canApproveAll = chosen.length > 0 && chosen.every((r) => r.status === 'reviewed');
  return (
    <>
      {outcome ? (
        <Alert tone="info" onDismiss={() => setOutcome(null)}>
          {t('bulk.outcome', {
            done: formatCount(outcome.results.filter((r) => r.result === 'done').length, locale),
            failed: formatCount(outcome.results.filter((r) => r.result !== 'done').length, locale),
          })}
        </Alert>
      ) : null}
      {bulk.error ? (
        <Alert tone="error">
          {bulk.error instanceof ApiFailure ? bulk.error.message : tc('state.error.text')}
        </Alert>
      ) : null}
      <RadioGroup
        label={t('queue.label')}
        orientation="horizontal"
        value={filters.status === 'needs_verification' ? 'verification' : 'all'}
        options={[
          { value: 'all', label: t('queue.all') },
          { value: 'verification', label: t('queue.verification') },
        ]}
        onChange={(id: string) =>
          change({ status: id === 'verification' ? 'needs_verification' : undefined })
        }
      />
      <QuotaBars
        projectId={projectId}
        area={{
          divisionId: filters.divisionId,
          districtId: filters.districtId,
          upazilaId: filters.upazilaId,
          unionId: filters.unionId,
        }}
      />
      <ExportButton
        list="applications"
        projectId={projectId}
        filters={{ ...applicationListFilters(filters), q }}
      />
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.beneficiaryName ?? r.appNo ?? r.id}
        selectionMode="multiple"
        selectedIds={shownSelection}
        onSelectionChange={setSelected}
        bulkActions={
          <>
            <Button
              variant="secondary"
              size="small"
              disabled={!canReviewAll}
              loading={bulk.isPending}
              onClick={() => bulk.mutate('review')}
            >
              {t('action.review')}
            </Button>
            <Button
              variant="primary"
              size="small"
              disabled={!canApproveAll}
              loading={bulk.isPending}
              onClick={() => setConfirmingBulk(true)}
            >
              {t('action.approve')}
            </Button>
          </>
        }
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        toolbar={
          <FilterBar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            collapsible
            activeFilters={activeFilters}
            onClearFilters={() => setFilters({})}
          >
            <>
              <fieldset className="admin-filter-group">
                <legend>{t('filter.group_area')}</legend>
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
              </fieldset>
              <fieldset className="admin-filter-group">
                <legend>{t('filter.group_other')}</legend>
                {scored ? (
                  <SelectField
                    label={t('sort.label')}
                    value={filters.sort === BY_SCORE ? BY_SCORE : 'arrival'}
                    options={[
                      { value: 'arrival', label: t('sort.arrival') },
                      { value: BY_SCORE, label: t('sort.score') },
                    ]}
                    onChange={(id) => change({ sort: id === BY_SCORE ? BY_SCORE : undefined })}
                  />
                ) : null}
                <SelectField
                  label={t('filter.status')}
                  value={filters.status ?? ''}
                  options={STATES.map((s) => ({ value: s, label: stateLabel(s) }))}
                  onChange={(id) => change({ status: id || undefined })}
                />
                <SelectField
                  label={t('filter.flag')}
                  value={filters.flag ?? ''}
                  options={FLAGS.map((f) => ({ value: f, label: t(`signals.flag.${f}`) }))}
                  onChange={(id) => change({ flag: id || undefined })}
                />
              </fieldset>
            </>
          </FilterBar>
        }
        cursorPagination={
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
      <ConfirmDialog
        open={confirmingBulk}
        title={t('bulk_approve_confirm.title', {
          n: shownSelection.size,
          count: formatCount(shownSelection.size, locale),
        })}
        consequences={[t('dialog.approve_note')]}
        confirmLabel={t('action.approve')}
        pending={bulk.isPending}
        onConfirm={() => bulk.mutate('approve')}
        onCancel={() => setConfirmingBulk(false)}
      />
    </>
  );
}

/** The union and the district of the application's address, by name. */
function Area({ row }: { row: ApplicationSummary }) {
  const locale = useLocale() as Locale;
  const text = [row.unionName?.[locale], row.districtName?.[locale]].filter(Boolean).join(', ');
  return text ? <>{text}</> : <EmptyValue label="—" />;
}
