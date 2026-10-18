import { Alert, Button } from '@css/ui';
import { Outlet } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../components/DocumentTitle';
import { RequireAuth } from '../lib/auth';
import './admin.css';
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

/**
 * The admin area (UX-15, SYSTEM_ARCHITECTURE 4.2 management screens) inside the app shell: the
 * management audience sees the page, with the notice on a phone that setup screens are best on a
 * larger one; everyone else sees the "no access" content (the server denies anyway). Loaded as its
 * own route chunk.
 */
export function AdminLayout() {
  const t = useTranslations('admin');
  return (
    <RequireAuth>
      {(me) => (
        <div className="admin-content">
          {canOpenAdmin(me) ? (
            <>
              <Alert tone="info" className="admin-phone-notice">
                {t('phone_notice')}
              </Alert>
              <Outlet />
            </>
          ) : (
            <ForbiddenContent />
          )}
        </div>
      )}
    </RequireAuth>
  );
}
