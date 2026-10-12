import type { IconComponent } from '@css/ui';
import { LayoutDashboard } from 'lucide-react';

/** One destination of the admin sidebar; the label is a key of the `admin.nav` messages. */
export interface AdminNavItem {
  key: 'dashboard';
  href: string;
  icon: IconComponent;
}

/** Admin destinations in sidebar order; T1.13 (settings, audit log) and T3.3/T6.1 add theirs. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: 'dashboard', href: '/admin', icon: LayoutDashboard },
];
