import type { Me } from '@css/shared/auth';
import type { IconComponent } from '@css/ui';
import {
  ArrowRightLeft,
  Activity,
  Bell,
  FolderKanban,
  HandHeart,
  House,
  IdCard,
  KeyRound,
  Layers,
  MessageSquareText,
  Send,
  LayoutTemplate,
  MonitorSmartphone,
  Scale,
  ScrollText,
  Settings,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react';
import {
  BENEFICIARY_TAB_ROLES,
  HANDOVER_ROLES,
  PERMISSION_PANEL_ROLES,
  PROGRAM_ROLES,
  PROJECT_CREATE_ROLES,
  PROJECT_ROLES,
  EDIT_REQUEST_ROLES,
  STAFF_DIRECTORY_ROLES,
  NISAB_ROLES,
  STAFF_APPROVER_ROLES,
  SYSTEM_ADMIN_ROLES,
  VOLUNTEER_TAB_ROLES,
} from './roles';

/** A destination of the app shell; the label is a key of the `nav` messages. */
export interface NavDestination {
  key:
    | 'my_work'
    | 'home'
    | 'my_projects'
    | 'notifications'
    | 'people'
    | 'projects'
    | 'programs'
    | 'templates'
    | 'volunteers'
    | 'beneficiaries'
    | 'registrations'
    | 'staff'
    | 'handover'
    | 'permissions'
    | 'settings'
    | 'nisab'
    | 'audit'
    | 'sessions'
    | 'health'
    | 'notification_templates'
    | 'deliveries'
    | 'profile'
    | 'devices';
  href: string;
  icon: IconComponent;
  /** Only these roles see it (the server checks the permission anyway); everyone when absent. */
  roles?: readonly string[];
  /** Other paths under which the destination counts as the current one. */
  also?: readonly string[];
}

export type NavGroup = 'work' | 'people' | 'admin';

/**
 * The officials' destinations in sidebar order, by group (docs/ui/DESIGN_SYSTEM.md, section
 * "App shell"): My Work first; each item names the roles that see it.
 */
export const SIDEBAR: readonly { group: NavGroup; items: readonly NavDestination[] }[] = [
  {
    group: 'work',
    items: [
      { key: 'my_work', href: '/', icon: House },
      { key: 'projects', href: '/admin/projects', icon: FolderKanban, roles: PROJECT_ROLES },
      { key: 'programs', href: '/admin/programs', icon: Layers, roles: PROGRAM_ROLES },
      {
        key: 'templates',
        href: '/admin/templates',
        icon: LayoutTemplate,
        roles: PROJECT_CREATE_ROLES,
      },
    ],
  },
  {
    group: 'people',
    items: [
      { key: 'volunteers', href: '/admin/volunteers', icon: Users, roles: VOLUNTEER_TAB_ROLES },
      {
        key: 'beneficiaries',
        href: '/admin/beneficiaries',
        icon: HandHeart,
        roles: BENEFICIARY_TAB_ROLES,
      },
      {
        key: 'registrations',
        href: '/admin/registrations',
        icon: UserCheck,
        roles: [...new Set([...STAFF_APPROVER_ROLES, ...EDIT_REQUEST_ROLES])],
      },
      { key: 'staff', href: '/admin/staff', icon: IdCard, roles: STAFF_DIRECTORY_ROLES },
      { key: 'handover', href: '/admin/handover', icon: ArrowRightLeft, roles: HANDOVER_ROLES },
    ],
  },
  {
    group: 'admin',
    items: [
      {
        key: 'permissions',
        href: '/admin/permissions',
        icon: KeyRound,
        roles: PERMISSION_PANEL_ROLES,
      },
      { key: 'settings', href: '/admin/settings', icon: Settings, roles: SYSTEM_ADMIN_ROLES },
      { key: 'nisab', href: '/admin/nisab', icon: Scale, roles: NISAB_ROLES },
      { key: 'audit', href: '/admin/audit', icon: ScrollText, roles: SYSTEM_ADMIN_ROLES },
      {
        key: 'sessions',
        href: '/admin/sessions',
        icon: MonitorSmartphone,
        roles: SYSTEM_ADMIN_ROLES,
      },
      { key: 'health', href: '/admin/health', icon: Activity, roles: SYSTEM_ADMIN_ROLES },
      {
        key: 'notification_templates',
        href: '/admin/notification-templates',
        icon: MessageSquareText,
        roles: SYSTEM_ADMIN_ROLES,
      },
      { key: 'deliveries', href: '/admin/deliveries', icon: Send, roles: SYSTEM_ADMIN_ROLES },
    ],
  },
];

const HOME: NavDestination = { key: 'home', href: '/', icon: House };
const NOTIFICATIONS: NavDestination = { key: 'notifications', href: '/notifications', icon: Bell };
/** The account pages close the "more" sheet for everyone. */
const ACCOUNT: readonly NavDestination[] = [
  { key: 'profile', href: '/account/profile', icon: UserRound },
  { key: 'devices', href: '/account/sessions', icon: MonitorSmartphone },
];

const allowed = (item: NavDestination, roles: readonly string[]) =>
  !item.roles || item.roles.some((r) => roles.includes(r));

/** The sidebar groups an official sees, empty groups left out. */
export function sidebarFor(me: Pick<Me, 'roles'>) {
  return SIDEBAR.map(({ group, items }) => ({
    group,
    items: items.filter((item) => allowed(item, me.roles)),
  })).filter((g) => g.items.length > 0);
}

/**
 * The phone tabs (and the rail) before "more": a volunteer's home, projects and notifications; an
 * official's home, people, projects and notifications, a tab they may not use left out.
 */
export function tabsFor(me: Pick<Me, 'kind' | 'roles'>): NavDestination[] {
  if (me.kind === 'volunteer')
    return [HOME, { key: 'my_projects', href: '/my-projects', icon: FolderKanban }, NOTIFICATIONS];
  const holds = (roles: readonly string[]) => roles.some((r) => me.roles.includes(r));
  const people = holds(VOLUNTEER_TAB_ROLES)
    ? '/admin/volunteers'
    : holds(BENEFICIARY_TAB_ROLES)
      ? '/admin/beneficiaries'
      : null;
  return [
    HOME,
    ...(people
      ? [
          {
            key: 'people' as const,
            href: people,
            icon: Users,
            also: ['/admin/volunteers', '/admin/beneficiaries'],
          },
        ]
      : []),
    ...(holds(PROJECT_ROLES)
      ? [{ key: 'projects' as const, href: '/admin/projects', icon: FolderKanban }]
      : []),
    NOTIFICATIONS,
  ];
}

/** What "more" offers: the destinations the tabs do not hold, then the account pages. */
export function moreFor(me: Pick<Me, 'kind' | 'roles'>): NavDestination[] {
  const tabs = tabsFor(me);
  // a tab's own page is not repeated; the people tab's other list (beneficiaries) is
  const covered = new Set(tabs.map((t) => t.href));
  const rest =
    me.kind === 'volunteer'
      ? []
      : sidebarFor(me)
          .flatMap((g) => g.items)
          .filter((item) => !covered.has(item.href));
  return [...rest, ...ACCOUNT];
}

/** Whether a destination is the page shown (a section counts for the pages under it). */
export function isCurrent(item: NavDestination, pathname: string): boolean {
  const path = pathname.replace(/(.)\/$/, '$1');
  return [item.href, ...(item.also ?? [])].some((href) =>
    href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`),
  );
}
