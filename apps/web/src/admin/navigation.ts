import type { IconComponent } from '@css/ui';
import { ArrowRightLeft, KeyRound, LayoutDashboard, UserCheck } from 'lucide-react';
import { HANDOVER_ROLES, PERMISSION_PANEL_ROLES, REGISTRATION_ROLES } from './roles';

/** One destination of the admin sidebar; the label is a key of the `admin.nav` messages. */
export interface AdminNavItem {
  key: 'dashboard' | 'registrations' | 'handover' | 'permissions';
  href: string;
  icon: IconComponent;
  /** Only these roles see the item (the server checks the permission anyway); all when absent. */
  roles?: readonly string[];
}

/** Admin destinations in sidebar order; T1.13 (settings, audit log) and T3.3/T6.1 add theirs. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: 'dashboard', href: '/admin', icon: LayoutDashboard },
  {
    key: 'registrations',
    href: '/admin/registrations',
    icon: UserCheck,
    roles: REGISTRATION_ROLES,
  },
  { key: 'handover', href: '/admin/handover', icon: ArrowRightLeft, roles: HANDOVER_ROLES },
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
