import type { IconComponent } from '@css/ui';
import { KeyRound, LayoutDashboard } from 'lucide-react';

/** One destination of the admin sidebar; the label is a key of the `admin.nav` messages. */
export interface AdminNavItem {
  key: 'dashboard' | 'permissions';
  href: string;
  icon: IconComponent;
  /** Only these roles see the item (the server checks the permission anyway); all when absent. */
  roles?: readonly string[];
}

/** The permission panel is for the Department Head and the Monitoring Team only (RBAC.md 7). */
export const PERMISSION_PANEL_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

/** Admin destinations in sidebar order; T1.13 (settings, audit log) and T3.3/T6.1 add theirs. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: 'dashboard', href: '/admin', icon: LayoutDashboard },
  {
    key: 'permissions',
    href: '/admin/permissions',
    icon: KeyRound,
    roles: PERMISSION_PANEL_ROLES,
  },
];

/** The items a user with these roles sees. */
export function navFor(roles: readonly string[]): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)));
}
