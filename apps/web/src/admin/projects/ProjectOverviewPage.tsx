import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, ErrorState, Skeleton, PageHeader } from '@css/ui';
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
          <ErrorState
            title={tc('state.error.text')}
            requestId={one.error instanceof ApiFailure ? one.error.requestId : undefined}
            onRetry={() => void one.refetch()}
          />
        )}
      </>
    );
  const { data: p, meta } = one.data;
  return (
    <>
      <DocumentTitle title={localized(p.name, locale)} />
      {back}
      <PageHeader
        title={localized(p.name, locale)}
        meta={
          <span data-testid="project-state">
            <ProjectStatusBadge status={p.status} />
          </span>
        }
      />
      {notice && (
        <Alert
          tone="success"
          live="status"
          onDismiss={() => void navigate(location.pathname, { replace: true, state: null })}
        >
          {notice}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" live="status" onDismiss={() => setSaved(undefined)}>
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
        actions={
          <>
            <Button variant="secondary" size="sm" href={`/admin/projects/${p.id}/setup`}>
              {t('detail.setup')}
            </Button>
            <Button variant="secondary" size="sm" href={`/admin/projects/${p.id}/volunteers`}>
              {t('volunteers.open')}
            </Button>
            <Button variant="secondary" size="sm" href={`/admin/projects/${p.id}/applications`}>
              {t('detail.applications')}
            </Button>
            {/* the template managers are the project creators (organisation-wide templates) */}
            {canCreateProjects(me) && (
              <Button variant="ghost" size="sm" onPress={() => setSaving(true)}>
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
