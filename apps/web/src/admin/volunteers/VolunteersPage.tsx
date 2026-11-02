import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import type { VolunteerRow } from '@css/shared/volunteers';
import {
  type ActiveFilter,
  Alert,
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  FilterGroup,
  MenuButton,
  Modal,
  Select,
  StatFilterBar,
  type StatFilterItem,
  Table,
  type TableColumn,
  TableToolbar,
  PageHeader,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Clock,
  EllipsisVertical,
  MonitorSmartphone,
  Search,
  Undo2,
  User,
  Users,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useFileDataUrl } from '../../components/FileImage';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../lib/api';
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
} from '../roles';
import { useTabView } from '../use-tab-view';
import { VolunteerSessions } from './VolunteerSessions';
import { FILTER_KEYS, VOLUNTEERS_KEY, volunteerPage, volunteerStatistics } from './volunteers-api';
import { ExportButton } from '../../features/exports/ExportButton';

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
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  if (!me) return null;
  if (!canSeeVolunteers(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader title={t('title')} />
      {notice && (
        <Alert
          tone="success"
          live="status"
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
  const tc = useTranslations('common');
  const tr = useTranslations('registration.form.types');
  const tp = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<VolunteerRow | null>(null);
  const [sessionsOf, setSessionsOf] = useState<VolunteerRow | null>(null);
  const { filters, setFilters, change, q, onSearch, page, cursor, goTo, activeCount } =
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
        { id: 'all', label: t('chips.all'), value: counts.volunteers.total, icon: Users },
        {
          id: 'active',
          label: t('stats.active'),
          value: counts.volunteers.active,
          icon: CircleCheck,
          tone: 'success',
        },
        {
          id: 'pending',
          label: t('stats.pending'),
          value: counts.volunteers.pending,
          icon: Clock,
          tone: 'warning',
        },
        { id: 'blocked', label: t('stats.blocked'), value: counts.volunteers.blocked, icon: Ban },
        {
          id: 'deactivated',
          label: t('stats.deactivated'),
          value: counts.volunteers.deactivated,
          icon: CircleX,
        },
        ...(counts.volunteers.inactive === undefined
          ? []
          : [
              {
                id: 'inactive',
                label: t('stats.inactive'),
                value: counts.volunteers.inactive,
                icon: UserX,
              },
            ]),
        {
          id: 'applications',
          label: t('stats.applications'),
          value: counts.applications.total,
          icon: ClipboardList,
          selectable: false,
        },
        {
          id: 'approved',
          label: t('stats.approved'),
          value: counts.applications.approved,
          icon: BadgeCheck,
          selectable: false,
        },
        {
          id: 'under_review',
          label: t('stats.under_review'),
          value: counts.applications.underReview,
          icon: Search,
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
  const person = (r: VolunteerRow) => (
    <span className="admin-person">
      <RowAvatar row={r} />
      <span className="admin-person-text">
        <Link to={`/admin/volunteers/${r.id}`} className="admin-person-name">
          {r.displayName}
        </Link>
        <span className="admin-person-meta">{tr(r.type)}</span>
      </span>
    </span>
  );
  const state = (r: VolunteerRow) => (
    <span className="admin-badges">
      <Badge variant="dot" tone={STATE_TONE[r.state] ?? 'neutral'} label={t(`state.${r.state}`)} />
      {r.blocked && <Badge variant="dot" tone="danger" label={t('blocklisted')} />}
    </span>
  );
  const projectNames = (r: VolunteerRow) =>
    r.projects.length
      ? r.projects.map((p) => (locale === 'en' ? p.nameEn : p.nameBn)).join(', ')
      : none;
  const actions = (r: VolunteerRow) => (
    <MenuButton
      label={t('action.menu', { name: r.displayName })}
      icon={EllipsisVertical}
      items={[
        {
          id: 'profile',
          label: t('action.profile'),
          icon: User,
          href: `/admin/volunteers/${r.id}`,
        },
        ...(r.state === 'pending' && me && canApproveRegistrations(me)
          ? [
              {
                id: 'review',
                label: t('action.review'),
                icon: ClipboardCheck,
                href: `/admin/volunteers/${r.id}`,
              },
            ]
          : []),
        ...(me && canBlock(me)
          ? [
              {
                id: 'block',
                label: r.blocked ? t('action.unblock') : t('action.block'),
                icon: r.blocked ? Undo2 : Ban,
                onAction: () => setBlocking(r),
              },
            ]
          : []),
        ...(me && canEndSessions(me)
          ? [
              {
                id: 'sessions',
                label: t('action.sessions'),
                icon: MonitorSmartphone,
                onAction: () => setSessionsOf(r),
              },
            ]
          : []),
      ]}
    />
  );
  const columns: TableColumn<VolunteerRow>[] = [
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
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
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
          moreLabel={t('stats.more')}
          moreValue={(n) => t('stats.more_value', { count: formatCount(n, locale) })}
          loading={stats.isPending}
        />
      )}
      <ExportButton list="volunteers" filters={{ ...filters, q }} />
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.displayName}
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
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            filterMode="panel"
            activeFilterCount={activeCount(inactiveCard ? ['state', 'category'] : ['state'])}
            activeFilters={activeFilters}
            onClearFilters={() =>
              setFilters({
                ...(filters.state ? { state: filters.state } : {}),
                ...(inactiveCard ? { category: 'inactive' } : {}),
              })
            }
            filters={
              <>
                <FilterGroup title={t('filter.group_area')}>
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
                </FilterGroup>
                <FilterGroup title={t('filter.group_other')}>
                  <ProjectPicker
                    value={filters.projectId ?? null}
                    onChange={(id) => change({ projectId: id ?? undefined })}
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
            {state(r)}
          </div>
        )}
      />
      {blocking && (
        <BlocklistDialog
          isOpen
          volunteerId={blocking.id}
          name={blocking.displayName}
          blocked={blocking.blocked}
          onClose={() => setBlocking(null)}
          onDone={changed}
        />
      )}
      <Modal
        title={sessionsOf ? t('action.sessions_title', { name: sessionsOf.displayName }) : ''}
        isOpen={sessionsOf !== null}
        onClose={() => setSessionsOf(null)}
      >
        {sessionsOf && <VolunteerSessions userId={sessionsOf.userId} canRevoke />}
      </Modal>
    </>
  );
}

/** The tone of each account state's dot. */
const STATE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  pending: 'warning',
  blocked: 'danger',
  deactivated: 'neutral',
};

/** The volunteer's own photo beside the name, or the first letter of the name without one. */
function RowAvatar({ row }: { row: VolunteerRow }) {
  return row.photoFileId ? (
    <PhotoAvatar name={row.displayName} fileId={row.photoFileId} />
  ) : (
    <Avatar name={row.displayName} letters={1} size="sm" />
  );
}

function PhotoAvatar({ name, fileId }: { name: string; fileId: string }) {
  const photo = useFileDataUrl(fileId);
  return <Avatar name={name} letters={1} size="sm" src={photo.data ?? undefined} />;
}

/** The district and upazila of a row, in the page language. */
function Area({ row }: { row: VolunteerRow }) {
  const locale = useLocale() as Locale;
  const district = useLocationName(row.divisionId, row.districtId);
  const upazila = useLocationName(row.districtId, row.upazilaId);
  return <>{[upazila?.[locale], district?.[locale]].filter(Boolean).join(', ')}</>;
}
