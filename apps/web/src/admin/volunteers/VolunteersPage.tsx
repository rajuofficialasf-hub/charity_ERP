import type { Locale } from '@css/shared/i18n';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import type { VolunteerRow } from '@css/shared/volunteers';
import {
  Badge,
  EmptyState,
  ErrorState,
  Select,
  Table,
  type TableColumn,
  TableToolbar,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useFileDataUrl } from '../../components/FileImage';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeCategories, canSeeVolunteers } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import {
  FILTER_KEYS,
  type FilterValues,
  VOLUNTEERS_KEY,
  volunteerPage,
  volunteerStatistics,
} from './volunteers-api';

const STATES = ['pending', 'active', 'blocked', 'deactivated'] as const;
const CATEGORIES = ['A', 'B', 'C', 'D', 'inactive'] as const;

/**
 * The nationwide volunteer tab (SCR-042; DECISION_LOG O-67): every volunteer the caller may see,
 * with the counts above, the state chips, the search and the filters. The filters live in the page
 * URL so a reload or a shared link shows the same view; the search term never does (it may be a
 * mobile number or an NID). The server decides what each row carries.
 */
export function VolunteersPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.volunteers');
  if (!me) return null;
  if (!canSeeVolunteers(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <VolunteerTab categories={canSeeCategories(me)} />
    </>
  );
}

function VolunteerTab({ categories }: { categories: boolean }) {
  const t = useTranslations('admin.volunteers');
  const tc = useTranslations('common');
  const tr = useTranslations('registration.form.types');
  const locale = useLocale() as Locale;
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  // a cursor belongs to the filters and the search it was made for; any other view starts at the
  // first page, however the URL changed (a sidebar link, back and forward)
  const view = `${params.toString()}|${q}`;
  const [paging, setPaging] = useState<{ view: string; cursor: string | null }>({
    view,
    cursor: null,
  });
  const cursor = paging.view === view ? paging.cursor : null;
  const setCursor = (next: string | null) => setPaging({ view, cursor: next });
  const filters: FilterValues = Object.fromEntries(
    FILTER_KEYS.flatMap((key) => {
      const value = params.get(key);
      return value ? [[key, value]] : [];
    }),
  );
  const setFilters = (next: FilterValues) => {
    const out = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of filter keys
      const value = next[key];
      if (value) out.set(key, value);
    }
    setParams(out, { replace: true });
  };
  const change = (patch: FilterValues) => setFilters({ ...filters, ...patch });
  const onSearch = useCallback((term: string) => setQ(term), []);

  const page = useQuery({
    queryKey: [...VOLUNTEERS_KEY, 'page', filters, q, cursor],
    queryFn: () => volunteerPage(filters, q, cursor),
  });
  const stats = useQuery({
    queryKey: [...VOLUNTEERS_KEY, 'statistics', filters, q],
    queryFn: () => volunteerStatistics(filters, q),
  });

  const counts = stats.data;
  const statItems = counts
    ? [
        { key: 'total', label: t('stats.total'), value: counts.volunteers.total },
        { key: 'active', label: t('stats.active'), value: counts.volunteers.active },
        { key: 'pending', label: t('stats.pending'), value: counts.volunteers.pending },
        { key: 'blocked', label: t('stats.blocked'), value: counts.volunteers.blocked },
        { key: 'deactivated', label: t('stats.deactivated'), value: counts.volunteers.deactivated },
        ...(counts.volunteers.inactive === undefined
          ? []
          : [{ key: 'inactive', label: t('stats.inactive'), value: counts.volunteers.inactive }]),
        { key: 'applications', label: t('stats.applications'), value: counts.applications.total },
        { key: 'approved', label: t('stats.approved'), value: counts.applications.approved },
        {
          key: 'under_review',
          label: t('stats.under_review'),
          value: counts.applications.underReview,
        },
      ]
    : [];

  const rows = page.data?.data ?? [];
  const showCategory = rows.some((r) => 'category' in r);
  const name = (r: VolunteerRow) => (
    <span className="admin-person">
      {r.photoFileId && <RowPhoto fileId={r.photoFileId} />}
      <Link to={`/admin/volunteers/${r.id}`}>{r.displayName}</Link>
    </span>
  );
  const state = (r: VolunteerRow) => (
    <span className="admin-badges">
      <Badge
        tone={r.state === 'active' ? 'success' : r.state === 'pending' ? 'info' : 'warning'}
        label={t(`state.${r.state}`)}
      />
      {r.blocked && <Badge tone="danger" label={t('blocklisted')} />}
    </span>
  );
  const projects = (r: VolunteerRow) =>
    r.projects.length
      ? r.projects.map((p) => (locale === 'en' ? p.nameEn : p.nameBn)).join(', ')
      : t('no_projects');
  const columns: TableColumn<VolunteerRow>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    { id: 'type', header: t('column.type'), cell: (r) => tr(r.type), priority: 2 },
    { id: 'area', header: t('column.area'), cell: (r) => <Area row={r} />, priority: 2 },
    { id: 'projects', header: t('column.projects'), cell: projects, priority: 3 },
    { id: 'state', header: t('column.state'), cell: state },
    ...(showCategory
      ? [
          {
            id: 'category',
            header: t('column.category'),
            cell: (r: VolunteerRow) =>
              [r.category, r.inactiveFlag ? t('filter.inactive') : null]
                .filter(Boolean)
                .join(' · '),
            priority: 3 as const,
          },
        ]
      : []),
  ];

  const activeFilters = FILTER_KEYS.filter(
    (key) => key !== 'state' && filters[key] !== undefined,
  ).length;
  const meta = page.data?.meta;

  return (
    <>
      {stats.error ? (
        <ErrorState
          title={tc('state.error.text')}
          requestId={stats.error instanceof ApiFailure ? stats.error.requestId : undefined}
          onRetry={() => void stats.refetch()}
        />
      ) : (
        <StatisticsBar label={t('stats.label')} items={statItems} loading={stats.isPending} />
      )}
      <Table
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.displayName}
        loading={page.isPending}
        error={
          page.error ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={page.error instanceof ApiFailure ? page.error.requestId : undefined}
              onRetry={() => void page.refetch()}
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={Users} title={t('empty')} headingLevel={2} />}
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            chips={[
              { id: 'all', label: t('chips.all') },
              ...STATES.map((s) => ({ id: s, label: t(`chips.${s}`) })),
            ]}
            activeChip={filters.state ?? 'all'}
            onChipChange={(id) => change({ state: id === 'all' ? undefined : id })}
            activeFilterCount={activeFilters}
            onClearFilters={() => setFilters(filters.state ? { state: filters.state } : {})}
            filters={
              <>
                <AddressFields
                  optional
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
                <Select
                  label={t('filter.type')}
                  value={filters.type ?? null}
                  options={VOLUNTEER_TYPES.map((type) => ({ id: type, label: tr(type) }))}
                  onChange={(id) => change({ type: id ?? undefined })}
                />
                {categories && (
                  <Select
                    label={t('filter.category')}
                    value={filters.category ?? null}
                    options={CATEGORIES.map((c) => ({
                      id: c,
                      label: c === 'inactive' ? t('filter.inactive') : c,
                    }))}
                    onChange={(id) => change({ category: id ?? undefined })}
                  />
                )}
                <Select
                  label={t('filter.blocked')}
                  value={filters.blocked ?? null}
                  options={[
                    { id: 'true', label: t('filter.blocked_yes') },
                    { id: 'false', label: t('filter.blocked_no') },
                  ]}
                  onChange={(id) => change({ blocked: id ?? undefined })}
                />
              </>
            }
          />
        }
        pagination={
          meta
            ? {
                shown: rows.length,
                total: meta.total ?? rows.length,
                hasNext: meta.nextCursor !== null,
                hasPrevious: meta.prevCursor !== null,
                onNext: () => setCursor(meta.nextCursor),
                onPrevious: () => setCursor(meta.prevCursor),
              }
            : undefined
        }
        cardRenderer={(r) => (
          <div className="admin-permission-card">
            {name(r)}
            <span>{tr(r.type)}</span>
            <Area row={r} />
            {state(r)}
          </div>
        )}
      />
    </>
  );
}

/** The volunteer's own photo, small, beside the name (the name names the row). */
function RowPhoto({ fileId }: { fileId: string }) {
  const photo = useFileDataUrl(fileId);
  return photo.data ? <img src={photo.data} alt="" className="admin-avatar" /> : null;
}

/** The district and upazila of a row, in the page language. */
function Area({ row }: { row: VolunteerRow }) {
  const locale = useLocale() as Locale;
  const district = useLocationName(row.divisionId, row.districtId);
  const upazila = useLocationName(row.districtId, row.upazilaId);
  return <>{[upazila?.[locale], district?.[locale]].filter(Boolean).join(', ')}</>;
}
