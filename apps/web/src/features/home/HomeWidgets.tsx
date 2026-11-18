import type { Me } from '@css/shared/auth';
import { formatCount, formatDate, formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Card,
  Chip,
  type ColorTone,
  type ExtendedIconName,
  Icon,
  LinkButton,
  Skeleton,
  StatCard,
  Text,
} from '@/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import {
  PERMISSION_PANEL_ROLES,
  STAFF_DIRECTORY_ROLES,
  SYSTEM_ADMIN_ROLES,
} from '../../admin/roles';
import { TEMPLATES_KEY, templates } from '../../admin/templates/templates-api';
import { MEDIA_KEY, mediaSummary } from '../media/media-api';
import { MY_PROJECTS_KEY, myProjects } from '../projects/my-projects-api';
import { MY_APPLICATIONS_KEY } from '../applications/applications-api';
import { ownListOf, TAB_IDS } from '../applications/own-lists';
import {
  HOME_PROJECT_STATES,
  HOME_PROJECTS_KEY,
  type HomeProjectState,
  LATEST_NOTIFICATIONS_KEY,
  latestNotifications,
  projectCount,
  runningProjects,
} from './home-api';
import { ApiFailure } from '../../api/client';
import { LoadError } from '../../components/LoadError';
import { Loaded } from './Loaded';
import type { LaterWidget, LiveWidget } from './widgets';

/** The volunteer's running projects with the deadline and the applications used. */
function MyProjects() {
  const t = useTranslations('home.widget');
  const tm = useTranslations('projects.mine');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: MY_PROJECTS_KEY, queryFn: myProjects });
  return (
    <Card title={t('my_projects')} headingLevel={2}>
      <Loaded query={list} empty={tm('empty')} isEmpty={(d) => d.length === 0}>
        {(projects) => (
          <ul className="my-work-list">
            {projects.map((p) => (
              <li key={p.projectId} className="my-work-row">
                <Link to={`/my-projects/${p.projectId}`}>{localized(p.name, locale)}</Link>
                {p.consentStatus === 'pending' && (
                  <Chip tone="warning" size="small">
                    <Icon name="error" size={16} />
                    {t('consent_needed')}
                  </Chip>
                )}
                {p.applyTo && (
                  <span className="my-work-muted">
                    {t('deadline', { date: formatDate(p.applyTo) })}
                  </span>
                )}
                {p.perVolunteerLimit !== null && (
                  <span className="my-work-muted">
                    {t('limit_used', {
                      used: formatCount(p.applicationsCounted, locale),
                      limit: formatCount(p.perVolunteerLimit, locale),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </Card>
  );
}

/** The volunteer's own applications counted by tab, each count opening its tab. */
function MyApplications() {
  const t = useTranslations('home.widget');
  const tl = useTranslations('applications.list');
  const locale = useLocale() as Locale;
  // the same queries as the own list, so the counts and the list agree
  const counts = useQueries({
    queries: TAB_IDS.map((id) => ({
      queryKey: [...MY_APPLICATIONS_KEY, id],
      queryFn: () => ownListOf(id),
    })),
  });
  const failed = counts.find((c) => c.error);
  return (
    <Card
      title={t('my_applications')}
      headingLevel={2}
      action={
        <LinkButton variant="text" to="/my-applications">
          {t('all_applications')}
        </LinkButton>
      }
    >
      {failed?.error instanceof ApiFailure && failed.error.status === 403 ? (
        // the own applications open only on a project the volunteer works on: without one the
        // server refuses, and the card says so as the own list does, not of a failure
        <Text tone="muted">{tl('no_project')}</Text>
      ) : failed ? (
        // a count that could not be read is never shown as zero
        <LoadError error={failed.error} onRetry={() => counts.forEach((c) => void c.refetch())} />
      ) : counts.some((c) => c.isPending) ? (
        <Skeleton shape="text" />
      ) : (
        <ul className="my-work-list">
          {TAB_IDS.map((id, i) => {
            const page = counts[i]!.data;
            const total = page ? (page.meta.total ?? page.data.length) : 0;
            return (
              <li key={id} className="my-work-row">
                <Link to={`/my-applications?tab=${id}`}>{tl(id)}</Link>
                <span className="my-work-muted">{formatCount(total, locale)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** A main volunteer's teams, one per project where they may build one. */
function MyTeam() {
  const t = useTranslations('home.widget');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: MY_PROJECTS_KEY, queryFn: myProjects });
  const leading = (list.data ?? []).filter((p) => p.leadsTeam);
  if (leading.length === 0) return null;
  return (
    <Card title={t('my_team')} headingLevel={2}>
      <ul className="my-work-list">
        {leading.map((p) => (
          <li key={p.projectId}>
            <Link to={`/my-projects/${p.projectId}/team`}>
              {t('team_of', { project: localized(p.name, locale) })}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The running projects an Executive or an RPM works on. */
function OfficialProjects() {
  const t = useTranslations('home.widget');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: HOME_PROJECTS_KEY, queryFn: runningProjects });
  return (
    <Card
      title={t('official_projects')}
      headingLevel={2}
      action={
        <LinkButton variant="text" to="/admin/projects">
          {t('all_projects')}
        </LinkButton>
      }
    >
      <Loaded query={list} empty={t('official_projects_empty')} isEmpty={(d) => d.length === 0}>
        {(projects) => (
          <ul className="my-work-list">
            {projects.map((p) => (
              <li key={p.id} className="my-work-row">
                <Link to={`/admin/projects/${p.id}`}>
                  {t('session_name', { name: localized(p.name, locale), label: p.sessionLabel })}
                </Link>
                {p.applyTo && (
                  <span className="my-work-muted">
                    {t('deadline', { date: formatDate(p.applyTo) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </Card>
  );
}

/** The icon and tone of each state's count. */
const STATE_LOOK: Record<HomeProjectState, { icon: ExtendedIconName; tone: ColorTone }> = {
  draft: { icon: 'file-edit', tone: 'neutral' },
  active: { icon: 'play', tone: 'success' },
  closing: { icon: 'hourglass', tone: 'warning' },
  closed: { icon: 'lock', tone: 'neutral' },
};

/** One count per project state, each opening the list of that state. */
function StateCount({ status }: { status: HomeProjectState }) {
  const t = useTranslations('admin.projects.status');
  const count = useQuery({
    queryKey: [...HOME_PROJECTS_KEY, 'count', status],
    queryFn: () => projectCount(status),
  });
  // a count that could not be read is never shown as zero
  if (count.error)
    return <LoadError title={t(status)} error={count.error} onRetry={() => void count.refetch()} />;
  if (count.isPending) return <Skeleton shape="stat" />;
  return (
    <StatCard
      label={t(status)}
      value={count.data}
      to={`/admin/projects?status=${status}`}
      // eslint-disable-next-line security/detect-object-injection -- a state key of a constant table
      {...STATE_LOOK[status]}
    />
  );
}

/** A Program Manager's projects by state, a card each, across the top of the home. */
export function ProjectStates() {
  const t = useTranslations('home.widget');
  return (
    <section className="my-work-states" aria-labelledby="project-states-title">
      <h2 id="project-states-title" className="my-work-sr-only">
        {t('project_states')}
      </h2>
      {HOME_PROJECT_STATES.map((s) => (
        <StateCount key={s} status={s} />
      ))}
    </section>
  );
}

function Templates() {
  const t = useTranslations('home.widget');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: TEMPLATES_KEY, queryFn: () => templates() });
  return (
    <Card
      title={t('templates')}
      headingLevel={2}
      action={
        <LinkButton variant="text" to="/admin/templates">
          {t('open_templates')}
        </LinkButton>
      }
    >
      <Loaded query={list} empty="" isEmpty={() => false}>
        {(active) => (
          <Text>
            {t('templates_count', {
              n: active.length,
              count: formatCount(active.length, locale),
            })}
          </Text>
        )}
      </Loaded>
    </Card>
  );
}

const SHORTCUTS = [
  {
    href: '/admin/permissions',
    icon: 'key',
    roles: PERMISSION_PANEL_ROLES,
    home: 'permission_panel',
  },
  { href: '/admin/audit', icon: 'notebook', roles: SYSTEM_ADMIN_ROLES, nav: 'audit' },
  { href: '/admin/staff', icon: 'id-card', roles: STAFF_DIRECTORY_ROLES, nav: 'staff' },
  { href: '/admin/settings', icon: 'settings', roles: SYSTEM_ADMIN_ROLES, nav: 'settings' },
] as const satisfies readonly ({
  href: string;
  icon: ExtendedIconName;
  roles: readonly string[];
} & ({ home: 'permission_panel' } | { nav: 'audit' | 'staff' | 'settings' }))[];

/** The Department Head's and the Monitoring Team's ways into their tools. */
function Shortcuts({ me }: { me: Me }) {
  const t = useTranslations('home.widget');
  const tn = useTranslations('nav');
  const label = (s: (typeof SHORTCUTS)[number]) => ('home' in s ? t(s.home) : tn(s.nav));
  return (
    <Card title={t('shortcuts')} headingLevel={2}>
      <ul className="my-work-shortcuts">
        {SHORTCUTS.filter((s) => s.roles.some((r) => me.roles.includes(r))).map((s) => (
          <li key={s.href}>
            <Link to={s.href} className="my-work-shortcut">
              <Icon name={s.icon} size={20} />
              <span>{label(s)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The newest five notifications, unread ones marked. */
function LatestNotifications() {
  const t = useTranslations('home.widget');
  const tn = useTranslations('notifications');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: LATEST_NOTIFICATIONS_KEY, queryFn: latestNotifications });
  return (
    <Card
      title={t('notifications')}
      headingLevel={2}
      action={
        <LinkButton variant="text" to="/notifications">
          {t('all_notifications')}
        </LinkButton>
      }
    >
      <Loaded query={list} empty={t('notifications_empty')} isEmpty={(d) => d.length === 0}>
        {(entries) => (
          <ul className="my-work-list">
            {entries.map((n) => (
              <li key={n.id} className="my-work-row">
                <Icon name="bell" size={16} />
                {n.link ? <Link to={n.link}>{n.title}</Link> : <span>{n.title}</span>}
                {!n.readAt && (
                  <Chip tone="info" size="small">
                    {tn('unread')}
                  </Chip>
                )}
                <span className="my-work-muted">{formatDateTime(n.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </Card>
  );
}

/** A widget whose module comes in a later phase: no action and no counts. */
export function ComingLater({ widget }: { widget: LaterWidget }) {
  const t = useTranslations('home.later');
  return (
    <Card title={t(`${widget}.title`)} headingLevel={2}>
      <div className="my-work-later">
        <Chip tone="neutral" size="small">
          <Icon name="clock" size={16} />
          {t('badge')}
        </Chip>
        <Text tone="muted">{t(`${widget}.text`)}</Text>
      </div>
    </Card>
  );
}

/** The Media Team's counts and the way into their home. */
function MediaWork() {
  const t = useTranslations('home.widget');
  const locale = useLocale() as Locale;
  const summary = useQuery({ queryKey: [...MEDIA_KEY, 'summary'], queryFn: mediaSummary });
  return (
    <Card
      title={t('media_work')}
      headingLevel={2}
      action={
        <LinkButton variant="text" to="/media">
          {t('open_media')}
        </LinkButton>
      }
    >
      <Loaded query={summary} empty="" isEmpty={() => false}>
        {({ overall }) => (
          <Text>
            {t('media_counts', {
              new: formatCount(overall.new, locale),
              progress: formatCount(
                overall.inProgress + overall.waitingForShooting + overall.inEditing,
                locale,
              ),
              published: formatCount(overall.published + overall.done, locale),
            })}
          </Text>
        )}
      </Loaded>
    </Card>
  );
}

/** One widget of the home that exists by now. */
export function LiveWidgetCard({ widget, me }: { widget: LiveWidget; me: Me }) {
  switch (widget) {
    case 'my_projects':
      return <MyProjects />;
    case 'my_team':
      return <MyTeam />;
    case 'my_applications':
      return <MyApplications />;
    case 'official_projects':
      return <OfficialProjects />;
    case 'project_states':
      return <ProjectStates />;
    case 'templates':
      return <Templates />;
    case 'shortcuts':
      return <Shortcuts me={me} />;
    case 'media_work':
      return <MediaWork />;
    case 'notifications':
      return <LatestNotifications />;
  }
}
