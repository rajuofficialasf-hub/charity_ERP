import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, LinkButton, Page, Skeleton } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canCreateProjects, canSeeProjects } from '../roles';
import { SaveTemplateDialog } from '../templates/SaveTemplateDialog';
import { LifecycleActions } from './LifecycleActions';
import { ProjectFacts } from './ProjectFacts';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { projectWithEtag, PROJECTS_KEY } from './projects-api';
import { LoadError } from '../../components/LoadError';

/**
 * A project at a glance: its state, program, workflow, application window, limit and budget, the
 * way to its setup, and the lifecycle buttons for the PM and the global roles. The progress
 * figures come with the dashboards.
 */
export function ProjectOverviewPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const tt = useTranslations('admin.templates.save');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  // the setup wizard says what it did: the draft saved, or the project activated
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>();
  const allowed = Boolean(me && canSeeProjects(me));
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one', projectId],
    queryFn: () => projectWithEtag(projectId),
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
          <LoadError error={one.error} onRetry={() => void one.refetch()} />
        )}
      </>
    );
  const { data: p, meta } = one.data;
  return (
    <>
      <DocumentTitle title={localized(p.name, locale)} />
      {back}
      <Page title={localized(p.name, locale)} documentTitle={false} />
      <div data-testid="project-state">
        <ProjectStatusBadge status={p.status} />
      </div>
      {notice && (
        <Alert
          tone="success"
          onDismiss={() => void navigate(location.pathname, { replace: true, state: null })}
        >
          {notice}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" onDismiss={() => setSaved(undefined)}>
          {saved}
        </Alert>
      )}
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
        action={
          <>
            <LinkButton variant="secondary" to={`/admin/projects/${p.id}/setup`}>
              {t('detail.setup')}
            </LinkButton>
            <LinkButton variant="secondary" to={`/admin/projects/${p.id}/volunteers`}>
              {t('volunteers.open')}
            </LinkButton>
            <LinkButton variant="secondary" to={`/admin/projects/${p.id}/applications`}>
              {t('detail.applications')}
            </LinkButton>
            {/* the template managers are the project creators (organisation-wide templates) */}
            {canCreateProjects(me) && (
              <Button variant="text" size="small" onClick={() => setSaving(true)}>
                {tt('open')}
              </Button>
            )}
          </>
        }
      >
        <ProjectFacts project={p} />
      </Card>
      {saving && (
        <SaveTemplateDialog
          projectId={p.id}
          onClose={() => setSaving(false)}
          onDone={(template) => {
            setSaving(false);
            setSaved(tt('notice', { name: localized(template.name, locale) }));
          }}
        />
      )}
    </>
  );
}
