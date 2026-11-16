import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, LinkButton, Page, Skeleton } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import {
  canCreateProjects,
  canListProjects,
  canSeeProjectOverview,
  canSeeProjects,
} from '../roles';
import { SaveTemplateDialog } from '../templates/SaveTemplateDialog';
import { CARDS_KEY, programCards } from './cards-api';
import { LifecycleActions } from './LifecycleActions';
import { ProjectFacts } from './ProjectFacts';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { projectWithEtag, PROJECTS_KEY } from './projects-api';
import { LoadError } from '../../components/LoadError';

/**
 * A session at a glance: its name with the session's label, the trail up to its program and its
 * project, its state, program, workflow, application window, limit and budget, the way to its
 * setup, and the lifecycle buttons for the PM and the global roles. The progress figures come
 * with the dashboards.
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
  // the Procurement Team reads its house-construction sessions too, and opens only their
  // applications from here
  const allowed = Boolean(me && canListProjects(me));
  const manager = Boolean(me && canSeeProjects(me));
  const overview = Boolean(me && canSeeProjectOverview(me));
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one', projectId],
    queryFn: () => projectWithEtag(projectId),
    enabled: allowed,
  });
  // the program's name for the trail, from the cards every official of a session may read
  const cards = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    enabled: overview,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const tab = { id: 'tab', label: t('tab.title'), href: '/admin/projects' };
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error)
    return (
      <>
        <PageCrumbs items={[tab]} />
        {one.error instanceof ApiFailure && one.error.status === 404 ? (
          <p>{t('detail.not_found')}</p>
        ) : (
          <LoadError error={one.error} onRetry={() => void one.refetch()} />
        )}
      </>
    );
  const { data: p, meta } = one.data;
  const name = localized(p.name, locale);
  const heading = t('detail.heading', { name, label: p.sessionLabel });
  const program = cards.data?.find((g) => g.id === p.programId);
  return (
    <>
      <DocumentTitle title={heading} />
      <PageCrumbs
        items={[
          tab,
          ...(program
            ? [
                {
                  id: 'program',
                  label: localized(program.name, locale),
                  href: `/admin/projects/programs/${program.id}`,
                },
              ]
            : []),
          // the project's page belongs to the overview; the Procurement Team sees its name only
          ...(p.seriesId
            ? [
                overview
                  ? { id: 'series', label: name, href: `/admin/projects/series/${p.seriesId}` }
                  : { id: 'series', label: name },
              ]
            : []),
          { id: 'session', label: t('list.session', { label: p.sessionLabel }) },
        ]}
      />
      <Page title={heading} documentTitle={false} />
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
            {manager && (
              <>
                <LinkButton variant="secondary" to={`/admin/projects/${p.id}/setup`}>
                  {t('detail.setup')}
                </LinkButton>
                <LinkButton variant="secondary" to={`/admin/projects/${p.id}/volunteers`}>
                  {t('volunteers.open')}
                </LinkButton>
              </>
            )}
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
