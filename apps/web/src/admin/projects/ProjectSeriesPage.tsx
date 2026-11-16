import { formatCount, formatMonth } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  DataTable,
  type DataTableExtendedColumn,
  DescriptionList,
  Icon,
  LinkButton,
  Page,
  Skeleton,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canCreateProjects, canSeeProjectOverview } from '../roles';
import { CARDS_KEY, type ProjectSeries, seriesDetail } from './cards-api';
import { NewSessionDialog, sessionSources } from './NewSessionDialog';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { SeriesDialog } from './SeriesDialog';
import './cards.css';

type Session = ProjectSeries['sessions'][number];

/**
 * A project's page, one project series, inside the programs and projects tab
 * (docs/ui/SCREENS.md, "Project list and project page"): the trail up to its program, its code,
 * program and the people helped in all its sessions, and its sessions newest first with their
 * period, state, applications and approved people; "খুলুন" opens a session the caller's scope
 * reaches and "অনুমতি নেই" stands for one it does not. Whoever may create a project in its
 * program edits it and starts a new session. On a phone the sessions are cards.
 */
export function ProjectSeriesPage() {
  const { me } = useAuth();
  const { seriesId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const ts = useTranslations('admin.projects.series_page');
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; warning: boolean } | null>(null);
  const allowed = Boolean(me && canSeeProjectOverview(me));
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series-detail', seriesId],
    queryFn: () => seriesDetail(seriesId),
    enabled: allowed,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const tab = { id: 'tab', label: t('tab.title'), href: '/admin/projects' };
  if (series.error)
    return (
      <>
        <PageCrumbs items={[tab, { id: 'missing', label: t('series_page.unknown') }]} />
        {series.error instanceof ApiFailure && series.error.status === 404 ? (
          <p>{ts('not_found')}</p>
        ) : (
          <LoadError error={series.error} onRetry={() => void series.refetch()} />
        )}
      </>
    );
  if (!series.data) return <Skeleton shape="card" />;
  const s = series.data;
  const name = localized(s.name, locale);
  const number = (n: number) => formatCount(n, locale);
  const manage = canCreateProjects(me) && s.canCreate;
  const periodText = (from: string, to: string) =>
    t('period_value', { from: formatMonth(from), to: formatMonth(to) });
  // a session's start may be made again on the wizard when no session is left to copy from
  const sources = sessionSources(s);
  const sessionName = (row: Session) => t('list.session', { label: row.sessionLabel });
  const open = (row: Session) =>
    row.canOpen ? (
      <Link
        to={`/admin/projects/${row.id}`}
        aria-label={ts('open_of', { label: row.sessionLabel })}
      >
        {ts('open')}
      </Link>
    ) : (
      <span className="series-locked">
        <Icon name="lock" size={16} />
        {ts('no_access')}
      </span>
    );
  const columns: DataTableExtendedColumn<Session>[] = [
    {
      id: 'session',
      header: ts('column.session'),
      cell: (row) => <strong>{sessionName(row)}</strong>,
      isRowHeader: true,
    },
    {
      id: 'period',
      header: ts('column.period'),
      cell: (row) => periodText(row.periodFrom, row.periodTo),
      priority: 2,
    },
    {
      id: 'status',
      header: ts('column.status'),
      cell: (row) => <ProjectStatusBadge status={row.status} />,
    },
    {
      id: 'applications',
      header: ts('column.applications'),
      cell: (row) => number(row.applications),
      numeric: true,
      priority: 2,
    },
    {
      id: 'approved',
      header: ts('column.approved'),
      cell: (row) => number(row.approved),
      numeric: true,
      priority: 2,
    },
    { id: 'open', header: ts('column.open'), cell: open },
  ];

  return (
    <>
      <DocumentTitle title={name} />
      <PageCrumbs
        items={[
          tab,
          {
            id: 'program',
            label: localized(s.program.name, locale),
            href: `/admin/projects/programs/${s.program.id}`,
          },
          { id: 'series', label: name },
        ]}
      />
      <Page
        title={name}
        description={s.description ? localized(s.description, locale) : undefined}
        actions={
          manage && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {ts('edit')}
              </Button>
              {sources.length ? (
                <Button startIcon="add" onClick={() => setStarting(true)}>
                  {t('series_card.new_session')}
                </Button>
              ) : (
                <LinkButton startIcon="add" to={`/admin/projects/new?seriesId=${s.id}`}>
                  {t('series_card.new_session')}
                </LinkButton>
              )}
            </>
          )
        }
      />
      {notice && (
        <Alert tone={notice.warning ? 'warning' : 'success'} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}
      <Card title={ts('facts')} headingLevel={2}>
        <DescriptionList
          layout="grid"
          columns={3}
          items={[
            { label: ts('code'), value: s.code },
            { label: ts('program'), value: localized(s.program.name, locale) },
            { label: ts('people'), value: number(s.beneficiaries) },
          ]}
        />
      </Card>
      <DataTable
        label={ts('sessions')}
        title={ts('sessions')}
        columns={columns}
        rows={s.sessions}
        getRowId={(row) => row.id}
        rowLabel={sessionName}
        emptyTitle={ts('empty')}
        cardRenderer={(row) => (
          <div className="series-session-card">
            <div className="series-session-top">
              <strong>{sessionName(row)}</strong>
              <ProjectStatusBadge status={row.status} />
            </div>
            <span>{periodText(row.periodFrom, row.periodTo)}</span>
            <span>
              {ts('counts', {
                applications: number(row.applications),
                approved: number(row.approved),
              })}
            </span>
            {open(row)}
          </div>
        )}
      />
      {editing && (
        <SeriesDialog
          seriesId={s.id}
          onClose={() => setEditing(false)}
          onDone={({ series: saved, coverProblem }) => {
            setEditing(false);
            setNotice(
              coverProblem
                ? { text: coverProblem, warning: true }
                : { text: ts('saved', { code: saved.code }), warning: false },
            );
          }}
        />
      )}
      {starting && <NewSessionDialog seriesId={s.id} onClose={() => setStarting(false)} />}
    </>
  );
}
