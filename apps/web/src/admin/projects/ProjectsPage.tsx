import { type Locale, localized } from '@css/shared/i18n';
import { PROJECT_STATUSES } from '@css/shared/projects';
import {
  Button,
  EmptyState,
  ErrorState,
  Select,
  Table,
  type TableColumn,
  TableToolbar,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { canCreateProjects, canSeePrograms, canSeeProjects } from '../roles';
import { useTabView } from '../use-tab-view';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { FILTER_KEYS, type Project, projectPage, PROJECTS_KEY } from './projects-api';

/** The years a project list filters by: from the first year a project may have to next year. */
const FIRST_YEAR = 2020;

/**
 * The projects in the caller's scope: code, name, program, year and state, with the
 * state chips and the program and year filters in the page URL. A PM (and a global role) creates a
 * draft here and continues on the project's page.
 */
export function ProjectsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  if (!me) return null;
  if (!canSeeProjects(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <div className="admin-title-row">
        <h1 className="admin-title">{t('title')}</h1>
        {canCreateProjects(me) && <Button onPress={() => setCreating(true)}>{t('new')}</Button>}
      </div>
      <ProjectList programNames={canSeePrograms(me)} />
      {creating && (
        <NewProjectDialog
          isOpen
          onClose={() => setCreating(false)}
          onDone={(p) => void navigate(`/admin/projects/${p.id}`)}
        />
      )}
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
    <Link to={`/admin/projects/${p.id}`}>{localized(p.name, locale)}</Link>
  );
  const columns: TableColumn<Project>[] = [
    { id: 'code', header: t('column.code'), cell: (p) => p.code },
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
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 2 - FIRST_YEAR }, (_, i) => String(FIRST_YEAR + i));

  return (
    <Table
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
          chips={[
            { id: 'all', label: t('chips.all') },
            ...PROJECT_STATUSES.map((s) => ({ id: s, label: t(`status.${s}`) })),
          ]}
          activeChip={filters.status ?? 'all'}
          onChipChange={(id) => change({ status: id === 'all' ? undefined : id })}
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
          <span>
            {p.code} · {String(p.year)}
          </span>
          <ProjectStatusBadge status={p.status} />
        </div>
      )}
    />
  );
}
