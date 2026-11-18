import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  CopyButton,
  LinkButton,
  LinkTabs,
  Menu,
  type MenuItemSpec,
  RecordHeader,
  Skeleton,
  Stack,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../../api/client';
import { LoadError } from '../../../components/LoadError';
import { PageCrumbs } from '../../../components/shell/breadcrumb';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import {
  canCreateProjects,
  canListProjects,
  canSeeProjectOverview,
  canSeeProjects,
} from '../../roles';
import { SaveTemplateDialog } from '../../templates/SaveTemplateDialog';
import { CardCover } from '../CardCover';
import { CARDS_KEY, seriesDetail } from '../cards-api';
import { useLifecycleMoves } from '../LifecycleActions';
import { ProjectStatusBadge } from '../ProjectStatusBadge';
import { projectWithEtag, PROJECTS_KEY } from '../projects-api';
import type { FramedSession } from './session-context';
import { tabOf, tabsFor } from './tabs';

/** The states in which the setup still takes changes, so "Edit" leads there. */
const EDITABLE = new Set(['draft', 'active']);

/**
 * The frame of a session's pages (docs/plans/2026-11-18-1718-feat-project-page-redesign-plan.md):
 * the header with the project's cover, its name and state, the session, code and program and the
 * project's short description, the actions (edit, the main lifecycle move, a copied in-app link and
 * the other moves in a menu), and the tabs, which stay on top of every page of the session. The
 * summary shows the whole header; the other tabs its compact form, so a list keeps its room. The
 * cover and the description are the project series', read by those who hold the overview; the
 * others see the drawn cover and the session's own description.
 */
export function ProjectFrame() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects');
  const tf = useTranslations('admin.projects.frame');
  const tt = useTranslations('admin.templates.save');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  // the setup wizard says what it did: the draft saved, or the project activated
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>();
  const allowed = Boolean(me && canListProjects(me));
  const overview = Boolean(me && canSeeProjectOverview(me));
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one', projectId],
    queryFn: () => projectWithEtag(projectId),
    enabled: allowed,
  });
  const seriesId = one.data?.data.seriesId;
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series-detail', seriesId],
    queryFn: () => seriesDetail(seriesId!),
    enabled: overview && Boolean(seriesId),
  });
  const moves = useLifecycleMoves(one.data?.data, one.data?.meta.etag, () => {
    void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
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
  const base = `/admin/projects/${p.id}`;
  const current = tabOf(location.pathname, projectId);
  const compact = current !== 'summary';
  const name = localized(p.name, locale);
  const s = series.data;
  const program = s?.program;
  const description = s?.description ? localized(s.description, locale) : p.description;
  const managesLifecycle = canCreateProjects(me);
  const menu: MenuItemSpec[] = managesLifecycle
    ? [
        ...moves.others.map((m) => ({
          id: m,
          label: moves.label(m),
          tone: m === 'cancel' ? ('danger' as const) : undefined,
          onSelect: () => moves.start(m),
        })),
        // the template managers are the project creators (organisation-wide templates)
        { id: 'template', label: tt('open'), icon: 'template', onSelect: () => setSaving(true) },
      ]
    : [];
  const sessionCrumb = t('list.session', { label: p.sessionLabel });
  const context: FramedSession = { project: p, etag: meta.etag };

  return (
    <>
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
          compact
            ? { id: 'session', label: sessionCrumb, href: base }
            : { id: 'session', label: sessionCrumb },
          ...(compact ? [{ id: 'tab-page', label: tf(`tab.${current}`) }] : []),
        ]}
      />
      <RecordHeader
        title={name}
        compact={compact}
        media={<CardCover fileId={s?.coverFileId ?? null} seed={p.seriesId ?? p.id} />}
        status={
          <span data-testid="project-state">
            <ProjectStatusBadge status={p.status} />
          </span>
        }
        facts={[
          { id: 'session', label: t('column.session'), value: sessionCrumb, icon: 'calendar' },
          { id: 'code', label: t('column.code'), value: p.code, icon: 'hash' },
          ...(program
            ? [
                {
                  id: 'program',
                  label: t('column.program'),
                  value: localized(program.name, locale),
                  icon: 'hand-heart' as const,
                },
              ]
            : []),
        ]}
        description={description ?? undefined}
        actionsLabel={tf('actions')}
        actions={
          <>
            {canSeeProjects(me) && EDITABLE.has(p.status) && (
              <LinkButton variant="secondary" startIcon="edit" to={`${base}/setup`}>
                {tf('edit')}
              </LinkButton>
            )}
            {/* the setup has its own activation at its last step, so the header offers none there */}
            {managesLifecycle && moves.main && current !== 'setup' && (
              <Button loading={moves.pending(moves.main)} onClick={() => moves.start(moves.main!)}>
                {moves.label(moves.main)}
              </Button>
            )}
            {/* the two small buttons stay together when the actions wrap on a phone */}
            <Stack direction="row" gap={0.5} align="center">
              <CopyButton value={`${window.location.origin}${base}`} label={tf('link')} />
              {menu.length > 0 && <Menu label={tf('more')} items={menu} />}
            </Stack>
          </>
        }
        footer={
          <LinkTabs
            label={tf('tabs')}
            items={tabsFor(me).map((item) => ({
              to: item.path ? `${base}/${item.path}` : base,
              label: tf(`tab.${item.key}`),
              icon: item.icon,
              current: item.key === current,
            }))}
          />
        }
      />
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
      {moves.ui}
      <Outlet context={context} />
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
