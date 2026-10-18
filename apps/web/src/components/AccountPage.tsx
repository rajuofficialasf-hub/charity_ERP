import type { Me } from '@css/shared/auth';
import type { ReactNode } from 'react';
import './auth-shell.css';
import { RequireAuth } from '../lib/auth';

/**
 * A signed-in page of the account and the volunteer's work inside the app shell: the heading and
 * the page. Only for signed-in users.
 */
export function AccountPage({
  title,
  children,
  wide = false,
}: {
  title: (me: Me) => string;
  children: (me: Me) => ReactNode;
  /** A page with a side navigation (the profile) gets a wider frame. */
  wide?: boolean;
}) {
  return (
    <RequireAuth>
      {(me) => (
        <div className={wide ? 'account-page account-page-wide' : 'account-page'}>
          <h1>{title(me)}</h1>
          {children(me)}
        </div>
      )}
    </RequireAuth>
  );
}
