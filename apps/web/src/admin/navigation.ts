import type { IconComponent } from '@css/ui';
import {
  ArrowRightLeft,
  FolderKanban,
  HandHeart,
  IdCard,
  KeyRound,
  Layers,
  LayoutTemplate,
  LayoutDashboard,
  Settings,
  UserCheck,
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
  STAFF_APPROVER_ROLES,
  SYSTEM_ADMIN_ROLES,
  VOLUNTEER_TAB_ROLES,
} from './roles';

/** One destination of the admin sidebar; the label is a key of the `admin.nav` messages. */
export interface AdminNavItem {
  key:
    | 'dashboard'
    | 'projects'
    | 'programs'
    | 'templates'
    | 'volunteers'
    | 'beneficiaries'
    | 'registrations'
    | 'staff'
    | 'handover'
    | 'permissions'
    | 'settings';
  href: string;
  icon: IconComponent;
  /** Only these roles see the item (the server checks the permission anyway); all when absent. */
  roles?: readonly string[];
}

/** Admin destinations in sidebar order; T1.13 (settings, audit log) and T3.3/T6.1 add theirs. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: 'dashboard', href: '/admin', icon: LayoutDashboard },
  { key: 'projects', href: '/admin/projects', icon: FolderKanban, roles: PROJECT_ROLES },
  { key: 'programs', href: '/admin/programs', icon: Layers, roles: PROGRAM_ROLES },
  {
    key: 'templates',
    href: '/admin/templates',
    icon: LayoutTemplate,
    roles: PROJECT_CREATE_ROLES,
  },
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
  {
    key: 'permissions',
    href: '/admin/permissions',
    icon: KeyRound,
    roles: PERMISSION_PANEL_ROLES,
  },
  { key: 'settings', href: '/admin/settings', icon: Settings, roles: SYSTEM_ADMIN_ROLES },
];

/** The items a user with these roles sees. */
export function navFor(roles: readonly string[]): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)));
}
