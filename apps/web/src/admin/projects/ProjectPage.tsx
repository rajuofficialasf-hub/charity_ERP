import { type Locale, localized } from '@css/shared/i18n';
import { Button, ErrorState, Skeleton } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeProjects } from '../roles';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { project, PROJECTS_KEY } from './projects-api';

/** A project's page: its name, code and state, and the way to its setup. */
export function ProjectPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canSeeProjects(me));
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one', projectId],
    queryFn: () => project(projectId),
    enabled: allowed,
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
  const p = one.data;
  return (
    <>
      <DocumentTitle title={localized(p.name, locale)} />
      {back}
      <div className="admin-title-row">
        <h1 className="admin-title">{localized(p.name, locale)}</h1>
        <ProjectStatusBadge status={p.status} />
      </div>
      <p className="admin-muted">
        {p.code} · {String(p.year)}
      </p>
      <Button variant="secondary" href={`/admin/projects/${p.id}/setup`}>
        {t('detail.setup')}
      </Button>
    </>
  );
}
