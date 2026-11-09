import type { Me } from '@css/shared/auth';
import {
  AppShell as Frame,
  Breadcrumbs,
  OfflineBanner,
  type Crumb,
  type ExtendedNavGroup,
  type OfflineBannerProps,
} from '@/ui';
import { PersonTile } from '../PersonPhoto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import {
  attentionCounts,
  isCurrent,
  moreFor,
  placeOf,
  sidebarFor,
  tabsFor,
} from '../../admin/navigation';
import { ATTENTION_KEY, attention } from '../../features/home/home-api';
import { RequireAuth } from '../../lib/auth';
import { useOffline } from '../../offline/OfflineProvider';
import type { SyncStatus } from '../../offline/sync-engine';
import { HeaderActions } from './AppBar';
import { CrumbsProvider, useCrumbsHolder, type TrailItem } from './breadcrumb';
import { MoreSheet } from './MoreSheet';
import './shell.css';
import { UpdateReady } from './UpdateReady';
import { useOnline, useShellWidth } from './use-online';

/**
 * The frame of every signed-in page on the asf shell (docs/architecture/ADR/ADR-016-asf-ui-system.md):
 * an official's sidebar on a wide screen, the rail on a tablet (and for a volunteer on every
 * width), the tabs and "more" on a phone; the header with the trail or the brand and the actions;
 * the offline banner. Destinations follow the person's roles; the server checks every request.
 */
export function AppShell() {
  return <RequireAuth>{(me) => <Shell me={me} />}</RequireAuth>;
}

function Shell({ me }: { me: Me }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useTranslations('nav');
  const ta = useTranslations('common.app');
  const ts = useTranslations('sync');
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
  const crumbs = useCrumbsHolder(sidebar);
  const trail = useTrail(me, pathname, sidebar, crumbs.items);
  const counts = attentionCounts(me, useWaiting());
  const navigation: ExtendedNavGroup[] =
    me.kind === 'volunteer'
      ? []
      : sidebarFor(me).map(({ group, items }) => ({
          title: t(`group.${group}`),
          items: items.map((item) => ({
            label: t(item.key),
            to: item.href,
            icon: item.icon,
            current: isCurrent(item, pathname),
            count: counts[item.key],
          })),
        }));
  const inMore = moreFor(me).some((item) => isCurrent(item, pathname));
  return (
    <>
      <Frame
        search={false}
        brand={{ name: ta('organization'), tagline: ta('name'), logoSrc: '/brand/logo.svg' }}
        navigation={navigation}
        compactNav={{
          label: t('label'),
          items: tabsFor(me).map((item) => ({
            key: item.key,
            label: t(item.key),
            to: item.href,
            icon: item.icon,
            current: isCurrent(item, pathname),
            count: counts[item.key],
          })),
          more: { label: t('more'), current: inMore, onClick: () => setMoreOpen(true) },
        }}
        headerStart={
          sidebar ? (
            trail && <Breadcrumbs items={trail} />
          ) : (
            <Link to="/" className="app-brand">
              <img src="/brand/logo.svg" alt={ta('organization')} width={36} height={23} />
              <span>{ta('name')}</span>
            </Link>
          )
        }
        headerActions={<HeaderActions me={me} phone={width === 'phone'} />}
        banner={
          <>
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
          </>
        }
        sidebarFooter={<SidebarFoot me={me} />}
      >
        <CrumbsProvider value={crumbs.value}>
          <Outlet />
        </CrumbsProvider>
      </Frame>
      <MoreSheet me={me} isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

/** How often the sidebar's counts are read while a page stays open, as the bell's count is. */
const COUNTS_REFRESH_MS = 60_000;

/**
 * What waits for the person, as the home counts it (the same cached list): read again every
 * minute and on every move to another page, so a decision made a moment ago leaves its count.
 */
function useWaiting() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const waiting = useQuery({
    queryKey: ATTENTION_KEY,
    queryFn: attention,
    refetchInterval: COUNTS_REFRESH_MS,
    staleTime: COUNTS_REFRESH_MS / 2,
  });
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    void queryClient.invalidateQueries({ queryKey: ATTENTION_KEY });
  }, [pathname, queryClient]);
  return waiting.data ?? [];
}

/**
 * The trail of the header beside the sidebar: the destination's group, then the page's own
 * crumbs, or the destination itself when the page has none. None without the sidebar.
 */
function useTrail(
  me: Me,
  pathname: string,
  sidebar: boolean,
  pageCrumbs: TrailItem[] | null,
): Crumb[] | null {
  const t = useTranslations('nav');
  if (!sidebar) return null;
  const place = placeOf(me, pathname);
  const items: Crumb[] = [
    ...(place ? [{ label: t(`group.${place.group}`) }] : []),
    ...(pageCrumbs?.map((item) => ({ label: item.label, to: item.to ?? item.href })) ??
      (place ? [{ label: t(place.item.key) }] : [])),
  ];
  return items.length > 1 ? items : null;
}

type Banner = Pick<OfflineBannerProps, 'state' | 'pendingCount' | 'onHidden'>;

/**
 * The banner under the header (docs/ui/DESIGN_SYSTEM.md, "OfflineBanner"): offline for everyone
 * (an official's says that the lists, the review and the approvals need the connection); for a
 * volunteer also the sync on its way, a sync that failed, and "back online" for a moment after the
 * connection returned. The counts are the engine's; an official's are zero.
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

/** Under the sidebar's links: the help card and the signed-in person. */
function SidebarFoot({ me }: { me: Me }) {
  const t = useTranslations('nav');
  return (
    <div className="app-sidebar-foot" data-testid="sidebar-foot">
      <div className="app-help">
        <p className="app-help-title">{t('help.title')}</p>
        <p>{t('help.text')}</p>
      </div>
      <div className="app-sidebar-person">
        <PersonTile name={me.displayName} fileId={me.photoFileId} size="sm" />
        <span className="app-sidebar-person-name">{me.displayName}</span>
      </div>
    </div>
  );
}
