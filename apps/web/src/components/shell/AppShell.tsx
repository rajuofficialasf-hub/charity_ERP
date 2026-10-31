import type { Me } from '@css/shared/auth';
import { OfflineBanner, type OfflineBannerProps } from '@css/ui';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { sidebarFor } from '../../admin/navigation';
import { RequireAuth } from '../../lib/auth';
import { useOffline } from '../../offline/OfflineProvider';
import type { SyncStatus } from '../../offline/sync-engine';
import { AppProviders } from '../AppProviders';
import { AppBar } from './AppBar';
import { BottomTabs } from './BottomTabs';
import { MoreSheet } from './MoreSheet';
import { NavLinks } from './NavLinks';
import './shell.css';
import { useOnline, useShellWidth } from './use-online';

/**
 * The frame of every signed-in page (docs/ui/DESIGN_SYSTEM.md, section "App shell"): the app bar,
 * the offline banner, and the navigation of the screen's width: an official's sidebar on a
 * desktop, the side rail on a tablet (and for a volunteer on a desktop), and the bottom tabs with
 * "more" on a phone. Destinations follow the person's roles; the server checks every request.
 */
export function AppShell() {
  return <RequireAuth>{(me) => <Shell me={me} />}</RequireAuth>;
}

function Shell({ me }: { me: Me }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const width = useShellWidth();
  const online = useOnline();
  const { status } = useOffline();
  const banner = useBanner(online, status, me.kind === 'volunteer');
  const [moreOpen, setMoreOpen] = useState(false);
  // any change of page (a destination of the sheet, the back button) closes the sheet
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setMoreOpen(false);
  }
  const sidebar = width === 'desktop' && me.kind !== 'volunteer';
  return (
    <AppProviders navigate={(href) => void navigate(href)}>
      <div
        className={`app-shell app-shell-${sidebar ? 'sidebar' : width === 'phone' ? 'tabs' : 'rail'}`}
      >
        <AppBar me={me} phone={width === 'phone'} />
        {sidebar ? (
          <Sidebar me={me} />
        ) : (
          <BottomTabs
            me={me}
            variant={width === 'phone' ? 'tab-bar' : 'rail'}
            onMore={() => setMoreOpen(true)}
          />
        )}
        <div className="app-main">
          {banner && (
            <OfflineBanner
              {...banner}
              onOpenOutbox={
                me.kind === 'volunteer' && banner.state !== 'syncing'
                  ? () => void navigate('/sync')
                  : undefined
              }
            />
          )}
          <main id="main" className="app-content">
            <Outlet />
          </main>
        </div>
        <MoreSheet me={me} isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
      </div>
    </AppProviders>
  );
}

type Banner = Pick<OfflineBannerProps, 'state' | 'pendingCount' | 'onHidden'>;

/**
 * The banner under the app bar (docs/ui/DESIGN_SYSTEM.md, "OfflineBanner"): offline for
 * everyone; for a volunteer also the sync on its way, a sync that failed, and "back online" for
 * a moment after the connection returned. The counts are the engine's; an official's are zero.
 */
function useBanner(online: boolean, status: SyncStatus, volunteer: boolean): Banner | null {
  const [back, setBack] = useState(false);
  // the moment the connection returns is read from the change itself, during the render
  const [seenOnline, setSeenOnline] = useState(online);
  if (seenOnline !== online) {
    setSeenOnline(online);
    setBack(online);
  }
  const waiting = status.pending + status.syncing + status.failed;
  const count = volunteer && waiting > 0 ? { pendingCount: waiting } : {};
  if (!online) return { state: 'offline', ...count };
  if (back) return { state: 'back_online', onHidden: () => setBack(false) };
  if (!volunteer) return null;
  if (status.state === 'syncing') return { state: 'syncing', ...count };
  if (status.failed > 0 || (status.lastError && status.state === 'idle'))
    return { state: 'sync_failed', ...count };
  return null;
}

function Sidebar({ me }: { me: Me }) {
  const t = useTranslations('nav');
  return (
    <nav className="app-sidebar" aria-label={t('label')}>
      {sidebarFor(me).map(({ group, items }) => (
        <div
          key={group}
          role="group"
          aria-labelledby={`nav-group-${group}`}
          className="app-nav-group"
        >
          <span id={`nav-group-${group}`} className="app-nav-group-title">
            {t(`group.${group}`)}
          </span>
          <NavLinks items={items} />
        </div>
      ))}
    </nav>
  );
}
