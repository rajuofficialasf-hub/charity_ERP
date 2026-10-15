import { formatCount, formatDate, formatTaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Button, Card, ErrorState, Skeleton } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { canCreateProjects, canSeePrograms, canSeeProjects } from '../roles';
import { LifecycleActions } from './LifecycleActions';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { projectWithEtag, PROJECTS_KEY } from './projects-api';

/**
 * A project at a glance: its state, program, workflow, application window, limit and budget, the
 * way to its setup, and the lifecycle buttons for the PM and the global roles. The progress
 * figures come with the dashboards.
 */
export function ProjectOverviewPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const allowed = Boolean(me && canSeeProjects(me));
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one', projectId],
    queryFn: () => projectWithEtag(projectId),
    enabled: allowed,
  });
  const programList = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: programs,
    enabled: Boolean(me && canSeePrograms(me)),
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const back = <Link to="/admin/projects">{t('detail.back')}</Link>;
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error)
    return (
      <>
        {back}
        {one.error instanceof ApiFailure && one.error.status === 404 ? (
          <p>{t('detail.not_found')}</p>
        ) : (
          <ErrorState
            title={tc('state.error.text')}
            requestId={one.error instanceof ApiFailure ? one.error.requestId : undefined}
            onRetry={() => void one.refetch()}
          />
        )}
      </>
    );
  const { data: p, meta } = one.data;
  const program = programList.data?.find((g) => g.id === p.programId);
  const none = t('detail.none');
  const day = (iso: string | null | undefined) => (iso ? formatDate(iso) : none);
  // the optional facts are left out when they are not there
  const facts: { label: string; value: ReactNode; shown?: boolean }[] = [
    { label: t('column.code'), value: p.code },
    { label: t('column.year'), value: String(p.year) },
    {
      label: t('column.program'),
      value: program ? localized(program.name, locale) : '',
      shown: Boolean(program),
    },
    { label: t('dialog.workflow'), value: t(`workflow.${p.workflowKey}`) },
    { label: t('detail.window'), value: `${day(p.applyFrom)} – ${day(p.applyTo)}` },
    {
      label: t('setup.limit'),
      value: p.perVolunteerLimit === null ? none : formatCount(p.perVolunteerLimit, locale),
    },
    {
      label: t('detail.budget'),
      value: p.budgetPlanned ? formatTaka(Number(p.budgetPlanned), locale) : none,
      shown: 'budgetPlanned' in p,
    },
    { label: t('detail.activated'), value: day(p.activatedAt), shown: Boolean(p.activatedAt) },
    { label: t('detail.closed'), value: day(p.closedAt), shown: Boolean(p.closedAt) },
  ];

  return (
    <>
      <DocumentTitle title={localized(p.name, locale)} />
      {back}
      <div className="admin-title-row">
        <h1 className="admin-title">{localized(p.name, locale)}</h1>
        <ProjectStatusBadge status={p.status} />
      </div>
      {canCreateProjects(me) && (
        <LifecycleActions
          project={p}
          etag={meta.etag}
          onMoved={() => void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })}
        />
      )}
      <Card
        title={t('detail.facts')}
        headingLevel={2}
        actions={
          <Button variant="secondary" size="sm" href={`/admin/projects/${p.id}/setup`}>
            {t('detail.setup')}
          </Button>
        }
      >
        <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          {facts
            .filter((f) => f.shown !== false)
            .map(({ label, value }) => (
              <div key={label} className="contents">
                <dt className="font-bold">{label}</dt>
                <dd className="m-0">{value}</dd>
              </div>
            ))}
        </dl>
      </Card>
    </>
  );
}
