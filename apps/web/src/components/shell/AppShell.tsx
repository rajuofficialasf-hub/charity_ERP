import type { Me } from '@css/shared/auth';
import { type BreadcrumbItem, IconTile, OfflineBanner, type OfflineBannerProps } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { attentionCounts, placeOf, sidebarFor } from '../../admin/navigation';
import { ATTENTION_KEY, attention } from '../../features/home/home-api';
import { RequireAuth } from '../../lib/auth';
import { useOffline } from '../../offline/OfflineProvider';
import type { SyncStatus } from '../../offline/sync-engine';
import { AppProviders } from '../AppProviders';
import { AppBar } from './AppBar';
import { CrumbsProvider, useCrumbsHolder } from './breadcrumb';
import { BottomTabs } from './BottomTabs';
import { MoreSheet } from './MoreSheet';
import { NavLinks } from './NavLinks';
import './shell.css';
import { UpdateReady } from './UpdateReady';
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
  const ts = useTranslations('sync');
  const banner = useBanner(online, status, me.kind === 'volunteer');
  const [moreOpen, setMoreOpen] = useState(false);
  // any change of page (a destination of the sheet, the back button) closes the sheet
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setMoreOpen(false);
  }
  const sidebar = width === 'desktop' && me.kind !== 'volunteer';
  const crumbs = useCrumbsHolder(sidebar);
  const trail = useTrail(me, pathname, sidebar, crumbs.items);
  return (
    <AppProviders navigate={(href) => void navigate(href)}>
      <div
        className={`app-shell app-shell-${sidebar ? 'sidebar' : width === 'phone' ? 'tabs' : 'rail'}`}
      >
        <AppBar me={me} phone={width === 'phone'} withBrand={!sidebar} trail={trail} />
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
          <UpdateReady />
          {banner && (
            <OfflineBanner
              {...banner}
              // an official keeps no work on the device: the banner says what needs the connection
              text={
                me.kind !== 'volunteer' && banner.state === 'offline'
                  ? ts('banner.official_offline')
                  : undefined
              }
              onOpenOutbox={
                me.kind === 'volunteer' && banner.state !== 'syncing'
                  ? () => void navigate('/sync')
                  : undefined
              }
            />
          )}
          <main id="main" className="app-content">
            <CrumbsProvider value={crumbs.value}>
              <Outlet />
            </CrumbsProvider>
          </main>
        </div>
        <MoreSheet me={me} isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
      </div>
    </AppProviders>
  );
}

/**
 * The trail of the app bar beside the sidebar: the destination's group, then the page's own
 * crumbs, or the destination itself when the page has none. None without the sidebar.
 */
function useTrail(
  me: Me,
  pathname: string,
  sidebar: boolean,
  pageCrumbs: BreadcrumbItem[] | null,
): BreadcrumbItem[] | null {
  const t = useTranslations('nav');
  if (!sidebar) return null;
  const place = placeOf(me, pathname);
  const items: BreadcrumbItem[] = [
    ...(place ? [{ id: 'group', label: t(`group.${place.group}`) }] : []),
    ...(pageCrumbs ?? (place ? [{ id: 'page', label: t(place.item.key) }] : [])),
  ];
  return items.length > 1 ? items : null;
}

type Banner = Pick<OfflineBannerProps, 'state' | 'pendingCount' | 'onHidden'>;

/**
 * The banner under the app bar (docs/ui/DESIGN_SYSTEM.md, "OfflineBanner"): offline for
 * everyone (an official's says that the lists, the review and the approvals need the
 * connection); for a volunteer also the sync on its way, a sync that failed, and "back online"
 * for a moment after the connection returned. The counts are the engine's; an official's are zero.
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
  // a failed flush matters only while something waits: a volunteer without a project has
  // nothing to sync and is not told of a refused pull
  if (status.failed > 0 || (status.lastError && status.state === 'idle' && waiting > 0))
    return { state: 'sync_failed', ...count };
  return null;
}

/**
 * The official's sidebar on a desktop, on the brand ink: the Foundation's mark and name, the
 * destinations by group, a help card and the signed-in person at the bottom.
 */
function Sidebar({ me }: { me: Me }) {
  const t = useTranslations('nav');
  const ta = useTranslations('common.app');
  // the same counted list as the home's, read from its cache when the home already loaded it
  const waiting = useQuery({ queryKey: ATTENTION_KEY, queryFn: attention });
  const counts = attentionCounts(me, waiting.data ?? []);
  return (
    <div className="app-sidebar" data-testid="sidebar">
      <a href="/" className="app-sidebar-brand">
        <span className="app-sidebar-mark">
          <img src="/brand/logo.svg" alt="" width={30} height={19} />
        </span>
        <span className="app-sidebar-names">
          <strong>{ta('organization')}</strong>
          <small>{ta('name')}</small>
        </span>
      </a>
      <nav className="app-sidebar-nav" aria-label={t('label')}>
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
            <NavLinks items={items} surface="dark" counts={counts} />
          </div>
        ))}
      </nav>
      <div className="app-sidebar-foot">
        <div className="app-help">
          <p className="app-help-title">{t('help.title')}</p>
          <p>{t('help.text')}</p>
        </div>
        <div className="app-sidebar-person">
          <IconTile name={me.displayName} size="sm" />
          <span className="app-sidebar-person-text">
            <span className="app-sidebar-person-name">{me.displayName}</span>
            <span className="app-sidebar-person-kind">{t(`kind.${me.kind}`)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
