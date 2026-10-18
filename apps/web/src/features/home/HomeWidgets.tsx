import type { Me } from '@css/shared/auth';
import { formatCount, formatDate, formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Badge, Button, Card, ErrorState, Icon, type IconComponent, StatCard } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CircleAlert,
  Clock,
  Dot,
  IdCard,
  KeyRound,
  ScrollText,
  Settings,
} from 'lucide-react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import {
  PERMISSION_PANEL_ROLES,
  STAFF_DIRECTORY_ROLES,
  SYSTEM_ADMIN_ROLES,
} from '../../admin/roles';
import { TEMPLATES_KEY, templates } from '../../admin/templates/templates-api';
import { MY_PROJECTS_KEY, myProjects } from '../projects/my-projects-api';
import {
  HOME_PROJECT_STATES,
  HOME_PROJECTS_KEY,
  type HomeProjectState,
  LATEST_NOTIFICATIONS_KEY,
  latestNotifications,
  projectCount,
  runningProjects,
} from './home-api';
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
                  <Badge tone="warning" icon={CircleAlert} label={t('consent_needed')} />
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
      actions={
        <Button variant="ghost" size="sm" href="/admin/projects">
          {t('all_projects')}
        </Button>
      }
    >
      <Loaded query={list} empty={t('official_projects_empty')} isEmpty={(d) => d.length === 0}>
        {(projects) => (
          <ul className="my-work-list">
            {projects.map((p) => (
              <li key={p.id} className="my-work-row">
                <Link to={`/admin/projects/${p.id}`}>{localized(p.name, locale)}</Link>
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

/** One count per project state, each opening the list of that state. */
function StateCount({ status }: { status: HomeProjectState }) {
  const t = useTranslations('admin.projects.status');
  const count = useQuery({
    queryKey: [...HOME_PROJECTS_KEY, 'count', status],
    queryFn: () => projectCount(status),
  });
  // a count that could not be read is never shown as zero
  if (count.error) return <ErrorState title={t(status)} onRetry={() => void count.refetch()} />;
  return (
    <StatCard
      label={t(status)}
      value={count.data ?? 0}
      loading={count.isPending}
      href={`/admin/projects?status=${status}`}
    />
  );
}

function ProjectStates() {
  const t = useTranslations('home.widget');
  return (
    <Card title={t('project_states')} headingLevel={2}>
      <div className="my-work-stats">
        {HOME_PROJECT_STATES.map((s) => (
          <StateCount key={s} status={s} />
        ))}
      </div>
    </Card>
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
      actions={
        <Button variant="ghost" size="sm" href="/admin/templates">
          {t('open_templates')}
        </Button>
      }
    >
      <Loaded query={list} empty="" isEmpty={() => false}>
        {(active) => (
          <p className="m-0">
            {t('templates_count', {
              n: active.length,
              count: formatCount(active.length, locale),
            })}
          </p>
        )}
      </Loaded>
    </Card>
  );
}

const SHORTCUTS = [
  {
    href: '/admin/permissions',
    icon: KeyRound,
    roles: PERMISSION_PANEL_ROLES,
    home: 'permission_panel',
  },
  { href: '/admin/audit', icon: ScrollText, roles: SYSTEM_ADMIN_ROLES, nav: 'audit' },
  { href: '/admin/staff', icon: IdCard, roles: STAFF_DIRECTORY_ROLES, nav: 'staff' },
  { href: '/admin/settings', icon: Settings, roles: SYSTEM_ADMIN_ROLES, nav: 'settings' },
] as const satisfies readonly ({
  href: string;
  icon: IconComponent;
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
              <Icon icon={s.icon} />
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
      actions={
        <Button variant="ghost" size="sm" href="/notifications">
          {t('all_notifications')}
        </Button>
      }
    >
      <Loaded query={list} empty={t('notifications_empty')} isEmpty={(d) => d.length === 0}>
        {(entries) => (
          <ul className="my-work-list">
            {entries.map((n) => (
              <li key={n.id} className="my-work-row">
                <Icon icon={Bell} size="sm" />
                {n.link ? <Link to={n.link}>{n.title}</Link> : <span>{n.title}</span>}
                {!n.readAt && <Badge tone="info" icon={Dot} label={tn('unread')} />}
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
    <Card title={t(`${widget}.title`)} headingLevel={2} className="my-work-later">
      <Badge tone="neutral" label={t('badge')} icon={Clock} />
      <p className="my-work-muted">{t(`${widget}.text`)}</p>
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
    case 'official_projects':
      return <OfficialProjects />;
    case 'project_states':
      return <ProjectStates />;
    case 'templates':
      return <Templates />;
    case 'shortcuts':
      return <Shortcuts me={me} />;
    case 'notifications':
      return <LatestNotifications />;
  }
}
