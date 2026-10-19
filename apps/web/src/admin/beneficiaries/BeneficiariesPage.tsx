import type { BeneficiaryRow } from '@css/shared/beneficiaries';
import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  type ActiveFilter,
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  FilterGroup,
  MenuButton,
  Select,
  StatFilterBar,
  type StatFilterItem,
  Table,
  type TableColumn,
  TableToolbar,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { Ban, EllipsisVertical, HandHeart, User, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { useAreaChips } from '../area-chips';
import { numberedPaging } from '../list-paging';
import { ProjectPicker } from '../projects/ProjectPicker';
import { PROJECTS_KEY, pickerProjects } from '../projects/projects-api';
import { canSeeBeneficiaries, canSeeBeneficiaryAddress, canSeeBeneficiaryDetails } from '../roles';
import { useTabView } from '../use-tab-view';
import {
  BENEFICIARIES_KEY,
  BENEFICIARY_TYPES,
  beneficiaryPage,
  beneficiaryStatistics,
  FILTER_KEYS,
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
  const tp = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  // a filter the role may not use is never read from the URL (an older or shared link)
  const keys = FILTER_KEYS.filter(
    (key) => (details || (key !== 'type' && key !== 'blocked')) && (union || key !== 'unionId'),
  );
  const { filters, setFilters, change, q, onSearch, page, cursor, goTo, activeCount } =
    useTabView(keys);
  const thisYear = String(new Date().getFullYear());

  const list = useQuery({
    queryKey: [...BENEFICIARIES_KEY, 'page', filters, q, page, cursor],
    queryFn: () => beneficiaryPage(filters, q, page, cursor),
  });
  const stats = useQuery({
    queryKey: [...BENEFICIARIES_KEY, 'statistics', filters, q],
    queryFn: () => beneficiaryStatistics(filters, q),
  });
  const projects = useQuery({
    queryKey: [...PROJECTS_KEY, 'picker'],
    queryFn: pickerProjects,
    enabled: Boolean(filters.projectId),
  });
  const areaChips = useAreaChips(filters, change);

  const counts = stats.data;
  const statItems: StatFilterItem[] = counts
    ? [
        { id: 'all', label: t('stats.total'), value: counts.total, icon: Users },
        {
          id: 'assisted',
          label: t('stats.assisted'),
          value: counts.assistedThisYear,
          icon: HandHeart,
          tone: 'success',
        },
        ...(counts.blocked === undefined
          ? []
          : [{ id: 'blocked', label: t('stats.blocked'), value: counts.blocked, icon: Ban }]),
      ]
    : [];
  const selectedCount =
    filters.blocked === 'true' ? 'blocked' : filters.year === thisYear ? 'assisted' : 'all';
  const selectCount = (id: string) =>
    change({
      year: id === 'assisted' ? thisYear : filters.year === thisYear ? undefined : filters.year,
      blocked: id === 'blocked' ? 'true' : filters.blocked === 'true' ? undefined : filters.blocked,
    });

  const rows = list.data?.data ?? [];
  const typeLabel = (code: string | null | undefined) =>
    code && (BENEFICIARY_TYPES as readonly string[]).includes(code)
      ? t(`types.${code as 'other'}`)
      : (code ?? '');
  const person = (r: BeneficiaryRow) => (
    <span className="admin-person">
      <Avatar name={r.name} letters={1} size="sm" />
      <span className="admin-person-text">
        <Link to={`/admin/beneficiaries/${r.id}`} className="admin-person-name">
          {r.name}
        </Link>
        {r.classCode && <span className="admin-person-meta">{typeLabel(r.classCode)}</span>}
      </span>
    </span>
  );
  const status = (r: BeneficiaryRow) => (
    <span className="admin-badges">
      <Badge
        variant="dot"
        tone={r.status === 'active' ? 'success' : 'warning'}
        label={t(`status.${r.status as 'active'}`)}
      />
      {r.isBlocked && <Badge variant="dot" tone="danger" label={t('blocked')} />}
    </span>
  );
  const actions = (r: BeneficiaryRow) => (
    <MenuButton
      label={t('action.menu', { name: r.name })}
      icon={EllipsisVertical}
      items={[
        {
          id: 'profile',
          label: t('action.profile'),
          icon: User,
          href: `/admin/beneficiaries/${r.id}`,
        },
      ]}
    />
  );
  const columns: TableColumn<BeneficiaryRow>[] = [
    { id: 'name', header: t('column.name'), cell: person, isRowHeader: true },
    ...(rows.some((r) => 'fatherOrHusbandName' in r)
      ? [
          {
            id: 'father',
            header: t('column.father'),
            cell: (r: BeneficiaryRow) => r.fatherOrHusbandName || <EmptyValue label={t('none')} />,
            priority: 3 as const,
          },
        ]
      : []),
    { id: 'area', header: t('column.area'), cell: (r) => <Area row={r} />, priority: 2 },
    { id: 'status', header: t('column.status'), cell: status },
  ];

  const projectName = (id: string) => {
    const found = projects.data?.find((p) => p.id === id);
    return found ? localized(found.name, locale) : tp('picker_chosen');
  };
  const activeFilters: ActiveFilter[] = [
    ...areaChips,
    ...(filters.type
      ? [
          {
            id: 'type',
            label: `${t('filter.type')}: ${typeLabel(filters.type)}`,
            onRemove: () => change({ type: undefined }),
          },
        ]
      : []),
    ...(filters.projectId
      ? [
          {
            id: 'projectId',
            label: `${tp('picker')}: ${projectName(filters.projectId)}`,
            onRemove: () => change({ projectId: undefined }),
          },
        ]
      : []),
    ...(filters.year && filters.year !== thisYear
      ? [
          {
            id: 'year',
            label: `${t('filter.year')}: ${filters.year}`,
            onRemove: () => change({ year: undefined }),
          },
        ]
      : []),
    ...(filters.blocked === 'false'
      ? [
          {
            id: 'blocked',
            label: `${t('filter.blocked')}: ${t('filter.blocked_no')}`,
            onRemove: () => change({ blocked: undefined }),
          },
        ]
      : []),
  ];
  const meta = list.data?.meta;

  return (
    <>
      {stats.error ? (
        <ErrorState
          title={tc('state.error.text')}
          requestId={stats.error instanceof ApiFailure ? stats.error.requestId : undefined}
          onRetry={() => void stats.refetch()}
        />
      ) : (
        <StatFilterBar
          label={t('stats.label')}
          items={statItems}
          selectedId={selectedCount}
          onSelect={selectCount}
          moreLabel={t('stats.label')}
          moreValue={(n) => formatCount(n, locale)}
          loading={stats.isPending}
        />
      )}
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
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
        emptyState={<EmptyState icon={HandHeart} title={t('empty')} headingLevel={2} />}
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            filterMode="panel"
            activeFilterCount={activeCount()}
            activeFilters={activeFilters}
            onClearFilters={() => setFilters({})}
            filters={
              <>
                <FilterGroup title={t('filter.group_area')}>
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
                </FilterGroup>
                <FilterGroup title={t('filter.group_other')}>
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
                  <ProjectPicker
                    value={filters.projectId ?? null}
                    onChange={(id) => change({ projectId: id ?? undefined })}
                  />
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
            <div className="admin-person-card-head">
              {person(r)}
              {actions(r)}
            </div>
            <Area row={r} />
            {status(r)}
          </div>
        )}
      />
    </>
  );
}

/** A dash for an empty value, read out as words. */
function EmptyValue({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="admin-dash">
        —
      </span>
      <span className="ui-sr-only">{label}</span>
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
