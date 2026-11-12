import { type BeneficiaryRow, formatBenNo } from '@css/shared/beneficiaries';
import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Button,
  Chip,
  DataTable,
  Dialog,
  FilterBar,
  LinkButton,
  Menu,
  Page,
  SelectField,
  Stack,
  StatFilterBar,
  type ActiveFilter,
  type StatFilterItem,
  type DataTableExtendedColumn,
} from '@/ui';
import { NoDocumentChip, ThroughVolunteerChip } from '../../components/PersonMarks';
import { PhotoPersonCell } from '../../components/PersonPhoto';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LookupField } from '../../features/beneficiaries/LookupField';
import { AddressFields } from '../../features/registration/AddressFields';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { EmptyValue } from '../EmptyValue';
import { useAreaChips } from '../area-chips';
import { numberedPaging } from '../list-paging';
import { ProjectPicker } from '../projects/ProjectPicker';
import { PROJECTS_KEY, pickerProjects } from '../projects/projects-api';
import {
  canLookUpBeneficiaries,
  canReviewDuplicates,
  canSeeBeneficiaries,
  canSeeBeneficiaryAddress,
  canSeeBeneficiaryDetails,
} from '../roles';
import { useTabView } from '../use-tab-view';
import {
  BENEFICIARIES_KEY,
  BENEFICIARY_TYPES,
  beneficiaryPage,
  beneficiaryStatistics,
  FILTER_KEYS,
} from './beneficiaries-api';
import { DUPLICATES_PATH } from './duplicates/merge-api';
import { ExportButton } from '../../features/exports/ExportButton';
import { LoadError } from '../../components/LoadError';

/** The years offered by the year filter: this one and the five before it. */
const yearsBack = () => {
  const year = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => String(year - i));
};

/**
 * The nationwide beneficiary tab (docs/ui/SCREENS.md "Beneficiary tab"): every beneficiary the caller's
 * scope reaches, with the counts above, the search and the filters (kept in the URL; the search is
 * not). The Media and Procurement Teams get a limited view: the server leaves out what they may not
 * see, and the page offers only the filters they may use.
 */
export function BeneficiariesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.beneficiaries');
  const [lookup, setLookup] = useState(false);
  if (!me) return null;
  if (!canSeeBeneficiaries(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          (canLookUpBeneficiaries(me) || canReviewDuplicates(me)) && (
            <Stack direction="row" wrap gap={2}>
              {canReviewDuplicates(me) && (
                <LinkButton variant="secondary" startIcon="copy" to={DUPLICATES_PATH}>
                  {t('duplicates.title')}
                </LinkButton>
              )}
              {canLookUpBeneficiaries(me) && (
                <Button variant="secondary" startIcon="search" onClick={() => setLookup(true)}>
                  {t('lookup.open')}
                </Button>
              )}
            </Stack>
          )
        }
        documentTitle={false}
      />
      {lookup && <LookupDialog onClose={() => setLookup(false)} />}
      <BeneficiaryTab details={canSeeBeneficiaryDetails(me)} union={canSeeBeneficiaryAddress(me)} />
    </>
  );
}

function BeneficiaryTab({ details, union }: { details: boolean; union: boolean }) {
  const t = useTranslations('admin.beneficiaries');
  const tp = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  // a filter the role may not use is never read from the URL (an older or shared link)
  const keys = FILTER_KEYS.filter(
    (key) =>
      (details || (key !== 'type' && key !== 'blocked' && key !== 'gender')) &&
      (union || key !== 'unionId'),
  );
  const { filters, setFilters, change, q, onSearch, page, cursor, goTo } = useTabView(keys);

  const list = useQuery({
    queryKey: [...BENEFICIARIES_KEY, 'page', filters, q, page, cursor],
    queryFn: () => beneficiaryPage(filters, q, page, cursor),
  });
  // a count card filters the list, not the counts: every card keeps its number when one is chosen
  const blockedCard = filters.blocked === 'true';
  const statFilters = {
    ...filters,
    blocked: blockedCard ? undefined : filters.blocked,
    gender: undefined,
  };
  const stats = useQuery({
    queryKey: [...BENEFICIARIES_KEY, 'statistics', statFilters, q],
    queryFn: () => beneficiaryStatistics(statFilters, q),
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
        { id: 'all', label: t('stats.total'), value: counts.total, icon: 'users' as const },
        // the men and the women, only where the caller sees the gender
        ...(counts.male === undefined || counts.female === undefined
          ? []
          : [
              {
                id: 'male',
                label: t('stats.male'),
                value: counts.male,
                icon: 'user' as const,
                tone: 'info',
              } satisfies StatFilterItem,
              {
                id: 'female',
                label: t('stats.female'),
                value: counts.female,
                icon: 'user' as const,
                tone: 'primary',
              } satisfies StatFilterItem,
            ]),
        {
          id: 'assisted',
          label: t('stats.assisted'),
          value: counts.assistedThisYear,
          icon: 'hand-heart' as const,
          tone: 'success',
          // approved help this year: no list filter matches it, so the card is a number only
          selectable: false,
        },
        ...(counts.blocked === undefined
          ? []
          : [
              {
                id: 'blocked',
                label: t('stats.blocked'),
                value: counts.blocked,
                icon: 'block' as const,
              },
            ]),
      ]
    : [];
  const genderCard =
    filters.gender === 'male' || filters.gender === 'female' ? filters.gender : null;
  const selectedCount = blockedCard ? 'blocked' : (genderCard ?? 'all');
  // one card is chosen at a time: a gender card clears the blocked card and the other way round
  const selectCount = (id: string) =>
    change({
      blocked: id === 'blocked' ? 'true' : blockedCard ? undefined : filters.blocked,
      gender: id === 'male' || id === 'female' ? id : undefined,
    });

  const rows = list.data?.data ?? [];
  const typeLabel = (code: string | null | undefined) =>
    code && (BENEFICIARY_TYPES as readonly string[]).includes(code)
      ? t(`types.${code as 'other'}`)
      : (code ?? '');
  const person = (r: BeneficiaryRow) => (
    <PhotoPersonCell
      fileId={r.photoFileId}
      name={r.name}
      href={`/admin/beneficiaries/${r.id}`}
      secondary={r.classCode ? typeLabel(r.classCode) : undefined}
    />
  );
  const status = (r: BeneficiaryRow) => (
    <span className="admin-badges">
      <Chip tone={r.status === 'active' ? 'success' : 'warning'}>
        {t(`status.${r.status as 'active'}`)}
      </Chip>
      {r.isBlocked && <Chip tone="error">{t('blocked')}</Chip>}
      {r.hasDocument === false && <NoDocumentChip />}
      {r.mobile === null && <ThroughVolunteerChip />}
    </span>
  );
  const actions = (r: BeneficiaryRow) => (
    <Menu
      label={t('action.menu', { name: r.name })}
      items={[
        {
          id: 'profile',
          label: t('action.profile'),
          icon: 'user' as const,
          to: `/admin/beneficiaries/${r.id}`,
        },
      ]}
    />
  );
  const columns: DataTableExtendedColumn<BeneficiaryRow>[] = [
    { id: 'name', header: t('column.name'), cell: person, isRowHeader: true },
    { id: 'ben', header: t('column.ben'), cell: (r) => formatBenNo(r.benNo) },
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
    ...(genderCard
      ? [
          {
            id: 'gender',
            label: `${t('filter.gender')}: ${t(`stats.${genderCard}`)}`,
            onRemove: () => change({ gender: undefined }),
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
    ...(filters.year
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
        <LoadError error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <StatFilterBar
          label={t('stats.label')}
          items={statItems}
          selectedId={selectedCount}
          onSelect={selectCount}
          visible={5}
          moreLabel={t('stats.label')}
          moreValue={(n: number) => formatCount(n, locale)}
          loading={stats.isPending}
        />
      )}
      <ExportButton list="beneficiaries" filters={{ ...filters, q }} />
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.name}
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
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            collapsible
            activeFilters={activeFilters}
            onClearFilters={() => setFilters(blockedCard ? { blocked: 'true' } : {})}
          >
            <>
              <fieldset className="admin-filter-group">
                <legend>{t('filter.group_area')}</legend>
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
              </fieldset>
              <fieldset className="admin-filter-group">
                <legend>{t('filter.group_other')}</legend>
                {details && (
                  <SelectField
                    label={t('filter.type')}
                    value={filters.type ?? ''}
                    options={BENEFICIARY_TYPES.map((type) => ({
                      value: type,
                      label: t(`types.${type}`),
                    }))}
                    onChange={(id) => change({ type: id || undefined })}
                  />
                )}
                <ProjectPicker
                  value={filters.projectId ?? ''}
                  onChange={(id) => change({ projectId: id || undefined })}
                />
                <SelectField
                  label={t('filter.year')}
                  value={filters.year ?? ''}
                  options={yearsBack().map((year) => ({ value: year, label: year }))}
                  onChange={(id) => change({ year: id || undefined })}
                />
                {details && (
                  <SelectField
                    label={t('filter.blocked')}
                    value={filters.blocked ?? ''}
                    options={[
                      { value: 'true', label: t('filter.blocked_yes') },
                      { value: 'false', label: t('filter.blocked_no') },
                    ]}
                    onChange={(id) => change({ blocked: id || undefined })}
                  />
                )}
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
            <span>{formatBenNo(r.benNo)}</span>
            <Area row={r} />
            {status(r)}
          </div>
        )}
      />
    </>
  );
}

/**
 * The lookup by NID or birth registration inside one of the caller's projects, as the application
 * form does it: an official checks whether a person already has a profile and what it holds.
 */
function LookupDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin.beneficiaries.lookup');
  const [projectId, setProjectId] = useState<string | null>(null);
  return (
    <Dialog title={t('title')} open fullScreenOnPhone onClose={onClose}>
      <ProjectPicker value={projectId} onChange={setProjectId} />
      <LookupField
        key={projectId ?? ''}
        projectId={projectId}
        footer={(found) => (
          <Link to={`/admin/beneficiaries/${found.beneficiaryId}`}>{t('profile')}</Link>
        )}
      />
    </Dialog>
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
