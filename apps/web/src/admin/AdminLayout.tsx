import { Alert, LinkButton, Page, Text } from '@/ui';
import { Outlet, useMatches } from 'react-router';
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
      <Page title={t('title')} documentTitle={false}>
        <Text>{t('message')}</Text>
        <div>
          <LinkButton variant="secondary" to="/">
            {t('home')}
          </LinkButton>
        </div>
      </Page>
    </>
  );
}

/**
 * What a route of the admin area says about itself: `desktopFirst` marks a setup screen (the form
 * builder, the project setup, the permission panel, the template editors), which says on a phone
 * that it is best on a larger screen. Every other page is used on a phone as much as on a
 * computer (docs/ui/DESIGN_BRIEF.md, the phone and desktop decisions) and says nothing.
 */
export type AdminRouteHandle = { desktopFirst?: boolean };

/** Whether the page open now is a setup screen meant for a computer first. */
function useDesktopFirst() {
  const matches = useMatches();
  return matches.some((match) => (match.handle as AdminRouteHandle | undefined)?.desktopFirst);
}

/**
 * The admin area (docs/architecture/SYSTEM_ARCHITECTURE.md, section "Route groups of the PWA") inside the app shell: the
 * management audience sees the page, with the notice on a phone that a setup screen (a page
 * marked `desktopFirst`) is best on a larger one; everyone else sees the "no access" content (the
 * server denies anyway). Loaded as its own route chunk.
 */
export function AdminLayout() {
  const t = useTranslations('admin');
  const desktopFirst = useDesktopFirst();
  return (
    <RequireAuth>
      {(me) => (
        <div className="admin-content">
          {canOpenAdmin(me) ? (
            <>
              {desktopFirst && (
                <div className="admin-phone-notice">
                  <Alert tone="info">{t('phone_notice')}</Alert>
                </div>
              )}
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
