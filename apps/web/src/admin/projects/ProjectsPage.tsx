import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PersonCell,
  Select,
  StatFilterBar,
  type StatFilterItem,
  Table,
  type TableColumn,
  TableToolbar,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { canCreateProjects, canSeePrograms, canSeeProjects } from '../roles';
import { useTabView } from '../use-tab-view';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import {
  FILTER_KEYS,
  type Project,
  projectCounts,
  projectPage,
  PROJECTS_KEY,
} from './projects-api';
import { PROJECT_COUNT_LOOK } from './state-look';

/** The years a project list filters by: from the first year a project may have to next year. */
const FIRST_YEAR = 2020;

/**
 * The projects in the caller's scope: a count card per state that is also the state filter, then
 * the list with the program, year and window filters, all in the page URL. A PM (and a global
 * role) starts a new project here, in the setup wizard.
 */
export function ProjectsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const navigate = useNavigate();
  if (!me) return null;
  if (!canSeeProjects(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          canCreateProjects(me) && (
            <Button icon={Plus} onPress={() => void navigate('/admin/projects/new')}>
              {t('new')}
            </Button>
          )
        }
      />
      <ProjectList programNames={canSeePrograms(me)} />
    </>
  );
}

function ProjectList({ programNames }: { programNames: boolean }) {
  const t = useTranslations('admin.projects');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { filters, setFilters, change, cursor, setCursor, activeCount } = useTabView(FILTER_KEYS);
  const page = useQuery({
    queryKey: [...PROJECTS_KEY, 'page', filters, cursor],
    queryFn: () => projectPage(filters, cursor),
  });
  // a count card filters the list, not the counts: every card keeps its number when one is chosen
  const countFilters = { ...filters, status: undefined };
  const counts = useQuery({
    queryKey: [...PROJECTS_KEY, 'counts', countFilters],
    queryFn: () => projectCounts(countFilters),
  });
  const programList = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: programs,
    enabled: programNames,
  });
  const programName = (id: string | undefined) => {
    const program = programList.data?.find((p) => p.id === id);
    return program ? localized(program.name, locale) : '';
  };
  const rows = page.data?.data ?? [];
  const meta = page.data?.meta;
  const name = (p: Project) => (
    <PersonCell
      name={localized(p.name, locale)}
      href={`/admin/projects/${p.id}`}
      secondary={p.code}
    />
  );
  const columns: TableColumn<Project>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    {
      id: 'program',
      header: t('column.program'),
      cell: (p) => programName(p.programId),
      priority: 3,
    },
    { id: 'year', header: t('column.year'), cell: (p) => String(p.year), priority: 2 },
    {
      id: 'status',
      header: t('column.status'),
      cell: (p) => <ProjectStatusBadge status={p.status} />,
    },
  ];
  const statItems: StatFilterItem[] = (counts.data ?? []).map(({ key, total }) => ({
    id: key,
    label: key === 'all' ? t('stats.all') : t(`status.${key}`),
    value: total,
    // eslint-disable-next-line security/detect-object-injection -- a state key of a constant table
    ...PROJECT_COUNT_LOOK[key],
  }));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 2 - FIRST_YEAR }, (_, i) => String(FIRST_YEAR + i));

  return (
    <>
      {counts.error ? (
        <ErrorState
          title={tc('state.error.text')}
          requestId={counts.error instanceof ApiFailure ? counts.error.requestId : undefined}
          onRetry={() => void counts.refetch()}
        />
      ) : (
        <StatFilterBar
          label={t('stats.label')}
          items={statItems}
          selectedId={filters.status ?? 'all'}
          onSelect={(id) => change({ status: id === 'all' ? undefined : id })}
          visible={statItems.length || 6}
          moreLabel={t('stats.label')}
          moreValue={(n) => formatCount(n, locale)}
          loading={counts.isPending}
        />
      )}
      <Table
        layout="panel"
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        rowLabel={(p) => localized(p.name, locale)}
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
        emptyState={<EmptyState icon={FolderKanban} title={t('empty')} headingLevel={2} />}
        toolbar={
          <TableToolbar
            activeFilterCount={activeCount(['status'])}
            onClearFilters={() => setFilters(filters.status ? { status: filters.status } : {})}
            filters={
              <>
                {programNames && (
                  <Select
                    label={t('filter.program')}
                    value={filters.programId ?? null}
                    options={(programList.data ?? []).map((p) => ({
                      id: p.id,
                      label: localized(p.name, locale),
                    }))}
                    onChange={(id) => change({ programId: id ?? undefined })}
                  />
                )}
                <Select
                  label={t('filter.year')}
                  value={filters.year ?? null}
                  searchable={false}
                  options={years.map((y) => ({ id: y, label: y }))}
                  onChange={(id) => change({ year: id ?? undefined })}
                />
                <Select
                  label={t('filter.window')}
                  value={filters.endingSoon ?? null}
                  searchable={false}
                  options={[{ id: 'true', label: t('filter.ending_soon') }]}
                  onChange={(id) => change({ endingSoon: id ?? undefined })}
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
        cardRenderer={(p) => (
          <div className="admin-permission-card">
            {name(p)}
            <span>{[programName(p.programId), String(p.year)].filter(Boolean).join(' · ')}</span>
            <ProjectStatusBadge status={p.status} />
          </div>
        )}
      />
    </>
  );
}
