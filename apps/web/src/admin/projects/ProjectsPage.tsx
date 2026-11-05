import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Button,
  DataTable,
  FilterBar,
  Page,
  PersonCell,
  SelectField,
  type StatFilterItem,
  type DataTableExtendedColumn,
  StatFilterBar,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
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
import { LoadError } from '../../components/LoadError';

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
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          canCreateProjects(me) && (
            <Button startIcon="add" onClick={() => void navigate('/admin/projects/new')}>
              {t('new')}
            </Button>
          )
        }
        documentTitle={false}
      />
      <ProjectList programNames={canSeePrograms(me)} />
    </>
  );
}

function ProjectList({ programNames }: { programNames: boolean }) {
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const { filters, setFilters, change, cursor, setCursor } = useTabView(FILTER_KEYS);
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
      to={`/admin/projects/${p.id}`}
      secondary={p.code}
    />
  );
  const columns: DataTableExtendedColumn<Project>[] = [
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
        <LoadError error={counts.error} onRetry={() => void counts.refetch()} />
      ) : (
        <StatFilterBar
          label={t('stats.label')}
          items={statItems}
          selectedId={filters.status ?? 'all'}
          onSelect={(id: string) => change({ status: id === 'all' ? undefined : id })}
          visible={statItems.length || 6}
          moreLabel={t('stats.label')}
          moreValue={(n: number) => formatCount(n, locale)}
          loading={counts.isPending}
        />
      )}
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(p) => p.id}
        rowLabel={(p) => localized(p.name, locale)}
        loading={page.isPending}
        error={
          page.error ? (
            <LoadError error={page.error} onRetry={() => void page.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        toolbar={
          <FilterBar
            onClearFilters={() => setFilters(filters.status ? { status: filters.status } : {})}
          >
            <>
              {programNames && (
                <SelectField
                  label={t('filter.program')}
                  value={filters.programId ?? ''}
                  options={(programList.data ?? []).map((p) => ({
                    value: p.id,
                    label: localized(p.name, locale),
                  }))}
                  onChange={(id) => change({ programId: id || undefined })}
                />
              )}
              <SelectField
                label={t('filter.year')}
                value={filters.year ?? ''}
                searchable={false}
                options={years.map((y) => ({ value: y, label: y }))}
                onChange={(id) => change({ year: id || undefined })}
              />
              <SelectField
                label={t('filter.window')}
                value={filters.endingSoon ?? ''}
                searchable={false}
                options={[{ value: 'true', label: t('filter.ending_soon') }]}
                onChange={(id) => change({ endingSoon: id || undefined })}
              />
            </>
          </FilterBar>
        }
        cursorPagination={
          meta
            ? {
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
