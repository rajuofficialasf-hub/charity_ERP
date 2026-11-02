import type { Me } from '@css/shared/auth';
import { PageHeader } from '@css/ui';
import type { ReactNode } from 'react';
import './auth-shell.css';
import { RequireAuth } from '../lib/auth';

/**
 * A signed-in page of the account and the volunteer's work inside the app shell: the page header
 * (docs/ui/DESIGN_SYSTEM.md, section "Page header") and the page. Only for signed-in users.
 */
export function AccountPage({
  title,
  eyebrow,
  description,
  children,
  wide = false,
}: {
  title: (me: Me) => string;
  /** The area label above the title. */
  eyebrow?: string;
  /** One line under the title: what the page is for. */
  description?: string;
  children: (me: Me) => ReactNode;
  /** The full frame of the admin pages, for a page with a side column (the profile, the home). */
  wide?: boolean;
}) {
  return (
    <RequireAuth>
      {(me) => (
        <div className={wide ? 'account-page account-page-wide' : 'account-page'}>
          <PageHeader title={title(me)} eyebrow={eyebrow} description={description} />
          {children(me)}
        </div>
      )}
    </RequireAuth>
  );
}
