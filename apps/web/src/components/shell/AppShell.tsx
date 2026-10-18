import type { Me } from '@css/shared/auth';
import { NavItem, OfflineBanner } from '@css/ui';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { isCurrent, sidebarFor } from '../../admin/navigation';
import { RequireAuth } from '../../lib/auth';
import { AppProviders } from '../AppProviders';
import { AppBar } from './AppBar';
import { BottomTabs } from './BottomTabs';
import { MoreSheet } from './MoreSheet';
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
  // the sheet stays open on the page it was opened on; a destination chosen in it closes it
  const [moreOn, setMoreOn] = useState<string | null>(null);
  const moreOpen = moreOn === pathname;
  const sidebar = width === 'desktop' && me.kind !== 'volunteer';
  return (
    <AppProviders navigate={(href) => void navigate(href)}>
      <div
        className={`app-shell app-shell-${sidebar ? 'sidebar' : width === 'phone' ? 'tabs' : 'rail'}`}
      >
        <AppBar me={me} phone={width === 'phone'} />
        {sidebar ? (
          <Sidebar me={me} pathname={pathname} />
        ) : (
          <BottomTabs
            me={me}
            variant={width === 'phone' ? 'tab-bar' : 'rail'}
            onMore={() => setMoreOn(pathname)}
          />
        )}
        <div className="app-main">
          {!online && <OfflineBanner state="offline" />}
          <main id="main" className="app-content">
            <Outlet />
          </main>
        </div>
        <MoreSheet me={me} isOpen={moreOpen} onClose={() => setMoreOn(null)} />
      </div>
    </AppProviders>
  );
}

function Sidebar({ me, pathname }: { me: Me; pathname: string }) {
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
          {items.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={t(item.key)}
              href={item.href}
              active={isCurrent(item, pathname)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
