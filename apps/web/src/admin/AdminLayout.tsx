import { Alert, Button, NavItem } from '@css/ui';
import { Outlet, useLocation } from 'react-router';
import { useTranslations } from 'use-intl';
import { LogoutButton } from '../components/AccountPage';
import { DocumentTitle } from '../components/DocumentTitle';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { RequireAuth } from '../lib/auth';
import './admin.css';
import { navFor } from './navigation';
import { canOpenAdmin } from './roles';

/** The "no access" content: inside the admin content area for a page the user may not open. */
export function ForbiddenContent() {
  const t = useTranslations('admin.forbidden');
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <p className="m-0">{t('message')}</p>
      <div>
        <Button variant="secondary" href="/">
          {t('home')}
        </Button>
      </div>
    </>
  );
}

/** Shown to a signed-in user outside the management audience (the server denies anyway). */
function Forbidden() {
  return (
    <main id="main" className="account-page">
      <ForbiddenContent />
    </main>
  );
}

/**
 * The admin area (UX-15, SYSTEM_ARCHITECTURE 4.2 management screens) on packages/ui: a top bar
 * with the system name, the signed-in user, the language switch and log out; a sidebar of
 * destinations (a row above the content on phones); the page in the content area. Loaded as its
 * own route chunk.
 */
export function AdminLayout() {
  const t = useTranslations('admin');
  const tc = useTranslations('common.app');
  // `/admin/` (trailing slash) is the same page as `/admin`.
  const pathname = useLocation().pathname.replace(/(.)\/$/, '$1');
  return (
    <RequireAuth>
      {(me) =>
        canOpenAdmin(me) ? (
          <div className="admin-shell">
            <header className="admin-bar" aria-label={t('bar.label')}>
              <a href="/admin" className="admin-brand">
                {tc('name')}
              </a>
              <div className="admin-bar-actions">
                <span className="admin-user">{t('bar.user', { name: me.displayName })}</span>
                <LanguageSwitch className="admin-language" />
                <LogoutButton />
              </div>
            </header>
            <div className="admin-body">
              <nav className="admin-sidebar" aria-label={t('nav.label')}>
                {navFor(me.roles).map((item) => (
                  <NavItem
                    key={item.key}
                    icon={item.icon}
                    label={t(`nav.${item.key}`)}
                    href={item.href}
                    active={pathname === item.href}
                  />
                ))}
              </nav>
              <main id="main" className="admin-content">
                <Alert tone="info" className="admin-phone-notice">
                  {t('phone_notice')}
                </Alert>
                <Outlet />
              </main>
            </div>
          </div>
        ) : (
          <Forbidden />
        )
      }
    </RequireAuth>
  );
}
