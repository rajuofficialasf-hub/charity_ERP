import type { Me } from '@css/shared/auth';
import type { ExtendedIconName } from '@/ui';
import { canListProjects, canSeeProjects } from '../../roles';

/** The tabs of a session's page, by the last part of their address. */
export type FrameTab =
  'summary' | 'setup' | 'volunteers' | 'applications' | 'distribution' | 'reports' | 'activity';

/** The tabs whose pages are not built yet: each opens a page that says it is coming. */
export type SoonTab = 'distribution' | 'reports' | 'activity';

interface TabSpec {
  key: FrameTab;
  /** The part of the address after the session's, empty for the summary. */
  path: string;
  icon: ExtendedIconName;
  /** Who may open the tab's page; the server refuses everyone else anyway. */
  shows: (me: Pick<Me, 'roles'>) => boolean;
}

/**
 * The tabs in their order (docs/plans/2026-11-18-1718-feat-project-page-redesign-plan.md,
 * "Tabs"): the setup and the volunteers for whoever manages projects, the rest for everyone who
 * opens the session, the Procurement Team included. A tab not built yet decides who may open it
 * when its page is built.
 */
const TABS: readonly TabSpec[] = [
  { key: 'summary', path: '', icon: 'home', shows: canListProjects },
  { key: 'setup', path: 'setup', icon: 'settings', shows: canSeeProjects },
  { key: 'volunteers', path: 'volunteers', icon: 'users', shows: canSeeProjects },
  { key: 'applications', path: 'applications', icon: 'clipboard', shows: canListProjects },
  { key: 'distribution', path: 'distribution', icon: 'package', shows: canListProjects },
  { key: 'reports', path: 'reports', icon: 'chart', shows: canListProjects },
  { key: 'activity', path: 'activity', icon: 'activity', shows: canListProjects },
];

/** The tabs the caller sees. */
export const tabsFor = (me: Pick<Me, 'roles'>) => TABS.filter((tab) => tab.shows(me));

/** The tab an address of the session opens: its first part after the session's id. */
export function tabOf(pathname: string, projectId: string): FrameTab {
  const rest = pathname.split(`/admin/projects/${projectId}`)[1] ?? '';
  const part = rest.split('/').find(Boolean) ?? '';
  return TABS.find((tab) => tab.path === part)?.key ?? 'summary';
}
