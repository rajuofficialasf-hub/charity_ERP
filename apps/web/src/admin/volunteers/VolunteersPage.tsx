import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import type { VolunteerRow } from '@css/shared/volunteers';
import {
  Alert,
  Chip,
  DataTable,
  Dialog,
  FilterBar,
  Menu,
  Page,
  PersonCell,
  SelectField,
  StatFilterBar,
  type ActiveFilter,
  type ColorTone,
  type StatFilterItem,
  type DataTableExtendedColumn,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useFileDataUrl } from '../../components/FileImage';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { EmptyValue } from '../EmptyValue';
import { useAreaChips } from '../area-chips';
import { numberedPaging } from '../list-paging';
import { ProjectPicker } from '../projects/ProjectPicker';
import { PROJECTS_KEY, pickerProjects } from '../projects/projects-api';
import { BlocklistDialog } from '../registrations/Blocklist';
import {
  canApproveRegistrations,
  canBlock,
  canEndSessions,
  canSeeCategories,
  canSeeVolunteers,
  seesPeopleByArea,
} from '../roles';
import { useTabView } from '../use-tab-view';
import { VolunteerSessions } from './VolunteerSessions';
import { FILTER_KEYS, VOLUNTEERS_KEY, volunteerPage, volunteerStatistics } from './volunteers-api';
import { ExportButton } from '../../features/exports/ExportButton';
import { AreaFilter } from '../AreaFilter';
import { LoadError } from '../../components/LoadError';

const CATEGORIES = ['A', 'B', 'C', 'D', 'inactive'] as const;

/**
 * The nationwide volunteer tab (docs/ui/SCREENS.md "Volunteer tab"): every volunteer the caller may see,
 * with the counts above, the state chips, the search and the filters. The filters live in the page
 * URL so a reload or a shared link shows the same view; the search term never does (it may be a
 * mobile number or an NID). The server decides what each row carries.
 */
export function VolunteersPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.volunteers');
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  if (!me) return null;
  if (!canSeeVolunteers(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        documentTitle={false}
      />
      {notice && (
        <Alert
          tone="success"
          onDismiss={() =>
            void navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
          }
        >
          {notice}
        </Alert>
      )}
      <VolunteerTab categories={canSeeCategories(me)} />
    </>
  );
}

function VolunteerTab({ categories }: { categories: boolean }) {
  const t = useTranslations('admin.volunteers');
  const tr = useTranslations('registration.form.types');
  const tp = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<VolunteerRow | null>(null);
  const [sessionsOf, setSessionsOf] = useState<VolunteerRow | null>(null);
  const { filters, setFilters, change, q, onSearch, initialSearch, page, cursor, goTo } =
    useTabView(FILTER_KEYS);

  const list = useQuery({
    queryKey: [...VOLUNTEERS_KEY, 'page', filters, q, page, cursor],
    queryFn: () => volunteerPage(filters, q, page, cursor),
  });
  // a count card filters the list, not the counts: every card keeps its number when one is chosen
  const inactiveCard = filters.category === 'inactive';
  const statFilters = {
    ...filters,
    state: undefined,
    category: inactiveCard ? undefined : filters.category,
  };
  const stats = useQuery({
    queryKey: [...VOLUNTEERS_KEY, 'statistics', statFilters, q],
    queryFn: () => volunteerStatistics(statFilters, q),
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
        {
          id: 'all',
          label: t('chips.all'),
          value: counts.volunteers.total,
          icon: 'users' as const,
        },
        {
          id: 'active',
          label: t('stats.active'),
          value: counts.volunteers.active,
          icon: 'success' as const,
          tone: 'success',
        },
        {
          id: 'pending',
          label: t('stats.pending'),
          value: counts.volunteers.pending,
          icon: 'clock' as const,
          tone: 'warning',
        },
        {
          id: 'blocked',
          label: t('stats.blocked'),
          value: counts.volunteers.blocked,
          icon: 'block' as const,
        },
        {
          id: 'deactivated',
          label: t('stats.deactivated'),
          value: counts.volunteers.deactivated,
          icon: 'rejected' as const,
        },
        ...(counts.volunteers.inactive === undefined
          ? []
          : [
              {
                id: 'inactive',
                label: t('stats.inactive'),
                value: counts.volunteers.inactive,
                icon: 'user-block' as const,
              },
            ]),
        {
          id: 'applications',
          label: t('stats.applications'),
          value: counts.applications.total,
          icon: 'clipboard' as const,
          selectable: false,
        },
        {
          id: 'approved',
          label: t('stats.approved'),
          value: counts.applications.approved,
          icon: 'verified' as const,
          selectable: false,
        },
        {
          id: 'under_review',
          label: t('stats.under_review'),
          value: counts.applications.underReview,
          icon: 'search' as const,
          selectable: false,
        },
      ]
    : [];
  const selectedCount = filters.state ?? (inactiveCard ? 'inactive' : 'all');
  const selectCount = (id: string) =>
    id === 'inactive'
      ? change({ category: 'inactive', state: undefined })
      : change({
          state: id === 'all' ? undefined : id,
          category: inactiveCard ? undefined : filters.category,
        });

  const rows = list.data?.data ?? [];
  const showCategory = rows.some((r) => 'category' in r);
  const none = <EmptyValue label={t('none')} />;
  const person = (r: VolunteerRow) => <RowPerson row={r} type={tr(r.type)} />;
  const state = (r: VolunteerRow) => (
    <span className="admin-badges">
      <Chip tone={STATE_TONE[r.state] ?? 'neutral'}>{t(`state.${r.state}`)}</Chip>
      {r.blocked && <Chip tone="error">{t('blocklisted')}</Chip>}
    </span>
  );
  const projectNames = (r: VolunteerRow) =>
    r.projects.length
      ? r.projects.map((p) => (locale === 'en' ? p.nameEn : p.nameBn)).join(', ')
      : none;
  const actions = (r: VolunteerRow) => (
    <Menu
      label={t('action.menu', { name: r.displayName })}
      items={[
        {
          id: 'profile',
          label: t('action.profile'),
          icon: 'user' as const,
          to: `/admin/volunteers/${r.id}`,
        },
        ...(r.state === 'pending' && me && canApproveRegistrations(me)
          ? [
              {
                id: 'review',
                label: t('action.review'),
                icon: 'clipboard-check' as const,
                to: `/admin/volunteers/${r.id}`,
              },
            ]
          : []),
        ...(me && canBlock(me)
          ? [
              {
                id: 'block',
                label: r.blocked ? t('action.unblock') : t('action.block'),
                icon: r.blocked ? ('undo' as const) : ('block' as const),
                onSelect: () => setBlocking(r),
              },
            ]
          : []),
        ...(me && canEndSessions(me)
          ? [
              {
                id: 'sessions',
                label: t('action.sessions'),
                icon: 'devices' as const,
                onSelect: () => setSessionsOf(r),
              },
            ]
          : []),
      ]}
    />
  );
  const columns: DataTableExtendedColumn<VolunteerRow>[] = [
    { id: 'name', header: t('column.name'), cell: person, isRowHeader: true },
    { id: 'area', header: t('column.area'), cell: (r) => <Area row={r} />, priority: 2 },
    { id: 'projects', header: t('column.projects'), cell: projectNames, priority: 3 },
    { id: 'state', header: t('column.state'), cell: state },
    ...(showCategory
      ? [
          {
            id: 'category',
            header: t('column.category'),
            cell: (r: VolunteerRow) =>
              [r.category, r.inactiveFlag ? t('filter.inactive') : null]
                .filter(Boolean)
                .join(' · ') || none,
            priority: 3 as const,
          },
        ]
      : []),
  ];

  const typeName = (id: string) => tr(id as VolunteerRow['type']);
  const projectName = (id: string) => {
    const found = projects.data?.find((p) => p.id === id);
    return found ? localized(found.name, locale) : tp('picker_chosen');
  };
  const activeFilters: ActiveFilter[] = [
    ...areaChips,
    ...(filters.projectId
      ? [
          {
            id: 'projectId',
            label: `${tp('picker')}: ${projectName(filters.projectId)}`,
            onRemove: () => change({ projectId: undefined }),
          },
        ]
      : []),
    ...(filters.type
      ? [
          {
            id: 'type',
            label: `${t('filter.type')}: ${typeName(filters.type)}`,
            onRemove: () => change({ type: undefined }),
          },
        ]
      : []),
    ...(filters.category && filters.category !== 'inactive'
      ? [
          {
            id: 'category',
            label: `${t('filter.category')}: ${filters.category}`,
            onRemove: () => change({ category: undefined }),
          },
        ]
      : []),
    ...(filters.blocked
      ? [
          {
            id: 'blocked',
            label: `${t('filter.blocked')}: ${
              filters.blocked === 'true' ? t('filter.blocked_yes') : t('filter.blocked_no')
            }`,
            onRemove: () => change({ blocked: undefined }),
          },
        ]
      : []),
  ];
  const meta = list.data?.meta;
  const changed = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: VOLUNTEERS_KEY });
  };

  return (
    <>
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {stats.error ? (
        <LoadError error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <StatFilterBar
          label={t('stats.label')}
          items={statItems}
          selectedId={selectedCount}
          onSelect={selectCount}
          visible={5}
          moreLabel={t('stats.more')}
          moreValue={(n: number) => t('stats.more_value', { count: formatCount(n, locale) })}
          loading={stats.isPending}
        />
      )}
      <ExportButton list="volunteers" filters={{ ...filters, q }} />
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.displayName}
        rowActions={actions}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        // a person who sees by area learns why the list is empty and who can widen it
        emptyDescription={me && seesPeopleByArea(me) ? t('empty_scope') : undefined}
        emptyTitle={t('empty')}
        toolbar={
          <FilterBar
            onSearch={onSearch}
            initialSearch={initialSearch}
            searchPlaceholder={t('search')}
            collapsible
            activeFilters={activeFilters}
            onClearFilters={() =>
              setFilters({
                ...(filters.state ? { state: filters.state } : {}),
                ...(inactiveCard ? { category: 'inactive' } : {}),
              })
            }
          >
            <>
              <AreaFilter legend={t('filter.group_area')} filters={filters} change={change} />
              <fieldset className="admin-filter-group">
                <legend>{t('filter.group_other')}</legend>
                <ProjectPicker
                  value={filters.projectId ?? null}
                  onChange={(id) => change({ projectId: id || undefined })}
                />
                <SelectField
                  label={t('filter.type')}
                  value={filters.type ?? ''}
                  options={VOLUNTEER_TYPES.map((type) => ({ value: type, label: tr(type) }))}
                  onChange={(id) => change({ type: id || undefined })}
                />
                {categories && (
                  <SelectField
                    label={t('filter.category')}
                    value={filters.category ?? ''}
                    options={CATEGORIES.map((c) => ({
                      value: c,
                      label: c === 'inactive' ? t('filter.inactive') : c,
                    }))}
                    onChange={(id) => change({ category: id || undefined })}
                  />
                )}
                <SelectField
                  label={t('filter.blocked')}
                  value={filters.blocked ?? ''}
                  options={[
                    { value: 'true', label: t('filter.blocked_yes') },
                    { value: 'false', label: t('filter.blocked_no') },
                  ]}
                  onChange={(id) => change({ blocked: id || undefined })}
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
            {state(r)}
          </div>
        )}
      />
      {blocking && (
        <BlocklistDialog
          open
          volunteerId={blocking.id}
          name={blocking.displayName}
          blocked={blocking.blocked}
          onClose={() => setBlocking(null)}
          onDone={changed}
        />
      )}
      <Dialog
        title={sessionsOf ? t('action.sessions_title', { name: sessionsOf.displayName }) : ''}
        open={sessionsOf !== null}
        onClose={() => setSessionsOf(null)}
      >
        {sessionsOf && <VolunteerSessions userId={sessionsOf.userId} canRevoke />}
      </Dialog>
    </>
  );
}

/** The tone of each account state's dot. */
const STATE_TONE: Record<string, ColorTone> = {
  active: 'success',
  pending: 'warning',
  blocked: 'error',
  deactivated: 'neutral',
};

/** The volunteer's own photo beside the name, or the first letter of the name without one. */
/** The volunteer's name beside the photo (or the name's letter) and over the type. */
function RowPerson({ row, type }: { row: VolunteerRow; type: string }) {
  const photo = useFileDataUrl(row.photoFileId ?? null);
  return (
    <PersonCell
      name={row.displayName}
      to={`/admin/volunteers/${row.id}`}
      secondary={type}
      photo={photo.data ?? undefined}
    />
  );
}

/** The district and upazila of a row, in the page language. */
function Area({ row }: { row: VolunteerRow }) {
  const locale = useLocale() as Locale;
  const district = useLocationName(row.divisionId, row.districtId);
  const upazila = useLocationName(row.districtId, row.upazilaId);
  return <>{[upazila?.[locale], district?.[locale]].filter(Boolean).join(', ')}</>;
}
