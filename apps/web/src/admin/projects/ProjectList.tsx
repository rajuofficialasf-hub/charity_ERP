import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  DataTable,
  FilterBar,
  PersonCell,
  SelectField,
  type StatFilterItem,
  type DataTableExtendedColumn,
  StatFilterBar,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { LoadError } from '../../components/LoadError';
import { useCountLine } from '../list-paging';
import { useTabView } from '../use-tab-view';
import { CARDS_KEY, programCards, seriesCards } from './cards-api';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import {
  LIST_KEYS,
  listFiltersOf,
  type Project,
  projectCounts,
  projectPage,
  PROJECTS_KEY,
} from './projects-api';
import { PROJECT_COUNT_LOOK } from './state-look';

/** The years a project list filters by: from the first year a project may have to next year. */
const FIRST_YEAR = 2020;

/**
 * The second view of the programs and projects tab: every session in the caller's scope, a count
 * card per state that is also the state filter, then the list with the program, project, year and
 * window filters, all in the page URL with the view itself. The program and project names come
 * from the cards, which the overview roles read; a caller without the overview (the Procurement
 * Team) gets the list without the program column and the program and project filters.
 */
export function ProjectList({ overview = true }: { overview?: boolean }) {
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const { filters, setFilters, change: changeView, cursor, setCursor } = useTabView(LIST_KEYS);
  // every change of a filter keeps the list: an address opened by a filter alone has no view yet,
  // and clearing that filter must not turn the page into the cards
  const change = (patch: Parameters<typeof changeView>[0]) =>
    changeView({ ...patch, view: 'list' });
  // the view is not a filter of the list
  const listFilters = listFiltersOf(filters);
  const page = useQuery({
    queryKey: [...PROJECTS_KEY, 'page', listFilters, cursor],
    queryFn: () => projectPage(listFilters, cursor),
  });
  // a count card filters the list, not the counts: every card keeps its number when one is chosen
  const countFilters = { ...listFilters, status: undefined };
  const counts = useQuery({
    queryKey: [...PROJECTS_KEY, 'counts', countFilters],
    queryFn: () => projectCounts(countFilters),
  });
  const programs = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    enabled: overview,
  });
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series', listFilters.programId ?? null],
    queryFn: () => seriesCards(listFilters.programId),
    enabled: overview,
  });
  const programName = (id: string | undefined) => {
    const program = programs.data?.find((p) => p.id === id);
    return program ? localized(program.name, locale) : '';
  };
  const rows = page.data?.data ?? [];
  const meta = page.data?.meta;
  const countLine = useCountLine();
  const session = (p: Project) => t('list.session', { label: p.sessionLabel });
  const name = (p: Project) => (
    <PersonCell
      name={localized(p.name, locale)}
      to={`/admin/projects/${p.id}`}
      secondary={`${p.code} · ${session(p)}`}
    />
  );
  const allColumns: DataTableExtendedColumn<Project>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    { id: 'session', header: t('column.session'), cell: (p) => p.sessionLabel, priority: 2 },
    {
      id: 'program',
      header: t('column.program'),
      cell: (p) => programName(p.programId),
      priority: 3,
    },
    {
      id: 'status',
      header: t('column.status'),
      cell: (p) => <ProjectStatusBadge status={p.status} />,
    },
  ];
  // the program's name comes from the cards, which only the overview roles read
  const columns = overview ? allColumns : allColumns.filter((column) => column.id !== 'program');
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
        rowLabel={(p) => `${localized(p.name, locale)} ${session(p)}`}
        loading={page.isPending}
        error={
          page.error ? (
            <LoadError error={page.error} onRetry={() => void page.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        toolbar={
          <FilterBar
            // the view and the chosen state stay; the other filters go
            onClearFilters={() =>
              setFilters({ view: 'list', ...(filters.status ? { status: filters.status } : {}) })
            }
          >
            <>
              {overview && (
                <SelectField
                  label={t('filter.program')}
                  value={filters.programId ?? ''}
                  options={(programs.data ?? []).map((p) => ({
                    value: p.id,
                    label: localized(p.name, locale),
                  }))}
                  // another program's project no longer fits
                  onChange={(id) => change({ programId: id || undefined, seriesId: undefined })}
                />
              )}
              {overview && (
                <SelectField
                  label={t('filter.series')}
                  value={filters.seriesId ?? ''}
                  options={(series.data ?? []).map((s) => ({
                    value: s.id,
                    label: `${localized(s.name, locale)} (${s.code})`,
                  }))}
                  onChange={(id) => change({ seriesId: id || undefined })}
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
                summary: countLine(rows.length, meta.total ?? rows.length),
              }
            : undefined
        }
        cardRenderer={(p) => (
          <div className="admin-permission-card">
            {name(p)}
            <span>{programName(p.programId)}</span>
            <ProjectStatusBadge status={p.status} />
          </div>
        )}
      />
    </>
  );
}
