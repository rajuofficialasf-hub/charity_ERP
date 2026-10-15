import type { BeneficiaryRow } from '@css/shared/beneficiaries';
import type { Locale } from '@css/shared/i18n';
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
import { HandHeart } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeBeneficiaries, canSeeBeneficiaryAddress, canSeeBeneficiaryDetails } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import {
  BENEFICIARIES_KEY,
  BENEFICIARY_TYPES,
  beneficiaryPage,
  beneficiaryStatistics,
  FILTER_KEYS,
  type FilterValues,
} from './beneficiaries-api';

/** The years offered by the year filter: this one and the five before it. */
const yearsBack = () => {
  const year = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => String(year - i));
};

/**
 * The nationwide beneficiary tab (SCR-044; DECISION_LOG O-67): every beneficiary the caller's
 * scope reaches, with the counts above, the search and the filters (kept in the URL; the search is
 * not). The Media and Procurement Teams get a limited view: the server leaves out what they may not
 * see, and the page offers only the filters they may use.
 */
export function BeneficiariesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.beneficiaries');
  if (!me) return null;
  if (!canSeeBeneficiaries(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <BeneficiaryTab details={canSeeBeneficiaryDetails(me)} union={canSeeBeneficiaryAddress(me)} />
    </>
  );
}

function BeneficiaryTab({ details, union }: { details: boolean; union: boolean }) {
  const t = useTranslations('admin.beneficiaries');
  const tc = useTranslations('common');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  // a cursor belongs to the filters and the search it was made for
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
    queryKey: [...BENEFICIARIES_KEY, 'page', filters, q, cursor],
    queryFn: () => beneficiaryPage(filters, q, cursor),
  });
  const stats = useQuery({
    queryKey: [...BENEFICIARIES_KEY, 'statistics', filters, q],
    queryFn: () => beneficiaryStatistics(filters, q),
  });
  const counts = stats.data;
  const statItems = counts
    ? [
        { key: 'total', label: t('stats.total'), value: counts.total },
        { key: 'assisted', label: t('stats.assisted'), value: counts.assistedThisYear },
        ...(counts.blocked === undefined
          ? []
          : [{ key: 'blocked', label: t('stats.blocked'), value: counts.blocked }]),
      ]
    : [];

  const rows = page.data?.data ?? [];
  const typeLabel = (code: string | null | undefined) =>
    code && (BENEFICIARY_TYPES as readonly string[]).includes(code)
      ? t(`types.${code as 'other'}`)
      : (code ?? '');
  const name = (r: BeneficiaryRow) => <Link to={`/admin/beneficiaries/${r.id}`}>{r.name}</Link>;
  const status = (r: BeneficiaryRow) => (
    <span className="admin-badges">
      <Badge
        tone={r.status === 'active' ? 'success' : 'warning'}
        label={t(`status.${r.status as 'active'}`)}
      />
      {r.isBlocked && <Badge tone="danger" label={t('blocked')} />}
    </span>
  );
  const columns: TableColumn<BeneficiaryRow>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    ...(rows.some((r) => 'fatherOrHusbandName' in r)
      ? [
          {
            id: 'father',
            header: t('column.father'),
            cell: (r: BeneficiaryRow) => r.fatherOrHusbandName ?? '',
            priority: 3 as const,
          },
          {
            id: 'type',
            header: t('column.type'),
            cell: (r: BeneficiaryRow) => typeLabel(r.classCode),
            priority: 2 as const,
          },
        ]
      : []),
    { id: 'area', header: t('column.area'), cell: (r) => <Area row={r} />, priority: 2 },
    { id: 'status', header: t('column.status'), cell: status },
  ];
  const activeFilters = FILTER_KEYS.filter((key) => filters[key] !== undefined).length;
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
        rowLabel={(r) => r.name}
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
        emptyState={<EmptyState icon={HandHeart} title={t('empty')} headingLevel={2} />}
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            activeFilterCount={activeFilters}
            onClearFilters={() => setFilters({})}
            filters={
              <>
                <AddressFields
                  optional
                  levels={union ? 4 : 3}
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
                {details && (
                  <Select
                    label={t('filter.type')}
                    value={filters.type ?? null}
                    options={BENEFICIARY_TYPES.map((type) => ({
                      id: type,
                      label: t(`types.${type}`),
                    }))}
                    onChange={(id) => change({ type: id ?? undefined })}
                  />
                )}
                <Select
                  label={t('filter.year')}
                  value={filters.year ?? null}
                  options={yearsBack().map((year) => ({ id: year, label: year }))}
                  onChange={(id) => change({ year: id ?? undefined })}
                />
                {details && (
                  <Select
                    label={t('filter.blocked')}
                    value={filters.blocked ?? null}
                    options={[
                      { id: 'true', label: t('filter.blocked_yes') },
                      { id: 'false', label: t('filter.blocked_no') },
                    ]}
                    onChange={(id) => change({ blocked: id ?? undefined })}
                  />
                )}
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
            <Area row={r} />
            {status(r)}
          </div>
        )}
      />
    </>
  );
}

/** The village and union (when sent), the upazila and the district of a row. */
function Area({ row }: { row: BeneficiaryRow }) {
  const locale = useLocale() as Locale;
  const district = useLocationName(row.divisionId, row.districtId);
  const upazila = useLocationName(row.districtId, row.upazilaId);
  const unionName = useLocationName(row.upazilaId, row.unionId ?? null);
  return (
    <>
      {[row.village, unionName?.[locale], upazila?.[locale], district?.[locale]]
        .filter(Boolean)
        .join(', ')}
    </>
  );
}
