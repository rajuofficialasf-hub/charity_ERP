import type { ExtendedNavItem, ExtendedNavGroup } from '@/ui/contract';

import { useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';

import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ButtonBase from '@mui/material/ButtonBase';

import { Icon } from '../icon';
import { fill, useLabels } from '../labels';
import { badgeText } from './bottom-nav';
import { brandInk } from '../shared';

// ----------------------------------------------------------------------

const isActive = (item: ExtendedNavItem, path: string): boolean =>
  item.current === true ||
  (item.current === undefined &&
    item.to !== undefined && (item.to === '/' ? path === '/' : path === item.to || path.startsWith(`${item.to}/`))) ||
  (item.children ?? []).some((child) => isActive(child, path));

/** A link's count beside its label; the link's name says it in words. */
function Count({ count }: { count: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ minWidth: 22, height: 22, px: 0.75, borderRadius: 11, bgcolor: 'error.main', color: 'error.contrastText', typography: 'caption', fontWeight: 700, lineHeight: '22px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
    >
      {badgeText(count)}
    </Box>
  );
}

const itemSx = (depth: number) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  width: '100%',
  minHeight: depth === 0 ? 44 : 36,
  px: 1.5,
  py: 0.5,
  borderRadius: 1,
  typography: 'body2',
  fontWeight: 500,
  color: 'text.secondary',
  textDecoration: 'none',
  textAlign: 'left',
  transition: 'background-color 150ms, color 150ms',
  '&:hover': { bgcolor: 'action.hover' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
});

// Top level: the brand tint. Nested: a grey tint, so the parent keeps the colour.
const activeSx = (depth: number) =>
  depth === 0
    ? { ...brandInk, fontWeight: 600, bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)', '&:hover': { bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.16)' } }
    : { color: 'text.primary', fontWeight: 600, bgcolor: 'action.hover' };

function NavRow({ item, depth, onNavigate }: { item: ExtendedNavItem; depth: number; onNavigate?: () => void }) {
  const labels = useLabels();
  const { pathname } = useLocation();
  const active = isActive(item, pathname);
  const [open, setOpen] = useState(active);

  if (item.children?.length) {
    return (
      <li>
        <ButtonBase
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          sx={{ ...itemSx(depth), ...(active ? activeSx(depth) : {}) }}
        >
          {item.icon && <Icon name={item.icon} />}
          <Box component="span" sx={{ flex: 1 }}>
            {item.label}
          </Box>
          <Box component="span" sx={{ display: 'flex', transition: 'transform 200ms', transform: open ? 'rotate(90deg)' : 'none' }}>
            <Icon name="chevron-right" size={16} />
          </Box>
        </ButtonBase>
        {open && (
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: 0,
              mt: 0.5,
              pl: 4.5,
              position: 'relative',
              display: 'grid',
              gap: 0.5,
              '&::before': { content: '""', position: 'absolute', left: 22, top: 0, bottom: 18, width: '1px', bgcolor: 'divider' },
            }}
          >
            {item.children.map((child) => (
              <NavRow key={child.label} item={child} depth={depth + 1} onNavigate={onNavigate} />
            ))}
          </Box>
        )}
      </li>
    );
  }

  const content = (
    <>
      {item.icon && <Icon name={item.icon} size={depth === 0 ? 24 : 20} />}
      <Box component="span" sx={{ flex: 1 }}>
        {item.label}
      </Box>
      {item.count ? <Count count={item.count} /> : null}
    </>
  );
  const named = item.count ? fill(labels.countName, { label: item.label, count: item.count }) : undefined;
  // the app's own rule for the current page, when it gives one, wins over the router's
  return (
    <li>
      {item.current === undefined ? (
        <Box component={NavLink} to={item.to ?? '/'} end={item.to === '/'} onClick={onNavigate} aria-label={named} sx={{ ...itemSx(depth), '&.active': activeSx(depth) }}>
          {content}
        </Box>
      ) : (
        <Box
          component={Link}
          to={item.to ?? '/'}
          onClick={onNavigate}
          aria-label={named}
          aria-current={item.current ? 'page' : undefined}
          sx={{ ...itemSx(depth), ...(item.current ? activeSx(depth) : {}) }}
        >
          {content}
        </Box>
      )}
    </li>
  );
}

/** The full navigation: group titles, links, and parents that open their children. */
export function NavSection({ groups, onNavigate }: { groups: ExtendedNavGroup[]; onNavigate?: () => void }) {
  const labels = useLabels();
  const navId = useId();
  return (
    <Box component="nav" aria-label={labels.mainNavigation} sx={{ px: 2, pb: 2 }}>
      {groups.map((group, index) => (
        <Box
          key={group.title ?? index}
          role={group.title ? 'group' : undefined}
          aria-labelledby={group.title ? `${navId}-group-${index}` : undefined}
          sx={{ mt: index === 0 ? 0 : 2 }}
        >
          {group.title && (
            <Box id={`${navId}-group-${index}`} sx={{ typography: 'overline', textTransform: 'uppercase', color: 'text.secondary', px: 1.5, py: 1 }}>
              {group.title}
            </Box>
          )}
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
            {group.items.map((item) => (
              <NavRow key={item.label} item={item} depth={0} onNavigate={onNavigate} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ----------------------------------------------------------------------

function MiniRow({ item }: { item: ExtendedNavItem }) {
  const labels = useLabels();
  const { pathname } = useLocation();
  const active = isActive(item, pathname);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const sx = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0.5,
    width: '100%',
    py: 1,
    borderRadius: 1,
    color: 'text.secondary',
    textDecoration: 'none',
    fontSize: '0.625rem',
    fontWeight: 600,
    lineHeight: 1.3,
    textAlign: 'center',
    '&:hover': { bgcolor: 'action.hover' },
    '& > span': { display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 0.5 },
  } as const;
  const activeLook = { ...brandInk, bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' };

  if (item.children?.length) {
    return (
      <li>
        <ButtonBase
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ ...sx, ...(active ? activeLook : {}) }}
        >
          {item.icon && <Icon name={item.icon} />}
          <span>{item.label}</span>
        </ButtonBase>
        <Menu
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { ml: 1, minWidth: 200 } } }}
        >
          {item.children.map((child) => (
            <MenuItem key={child.label} component={NavLink} to={child.to ?? '/'} onClick={() => setAnchor(null)}>
              {child.label}
            </MenuItem>
          ))}
        </Menu>
      </li>
    );
  }
  const named = item.count ? fill(labels.countName, { label: item.label, count: item.count }) : item.label;
  const content = (
    <>
      {item.icon && <Icon name={item.icon} />}
      <span aria-hidden>{item.label}</span>
      {item.count ? (
        <Box component="span" aria-hidden sx={{ position: 'absolute', top: 4, right: 8, minWidth: 18, height: 18, px: 0.5, borderRadius: 9, bgcolor: 'error.main', color: 'error.contrastText', fontSize: 10, lineHeight: '18px', fontWeight: 700, width: 'auto !important' }}>
          {badgeText(item.count)}
        </Box>
      ) : null}
    </>
  );
  // the app's own rule for the current page, when it gives one, wins over the router's
  return (
    <li>
      {item.current === undefined ? (
        <Box component={NavLink} to={item.to ?? '/'} end={item.to === '/'} aria-label={named} sx={{ ...sx, position: 'relative', '&.active': activeLook }}>
          {content}
        </Box>
      ) : (
        <Box component={Link} to={item.to ?? '/'} aria-label={named} aria-current={item.current ? 'page' : undefined} sx={{ ...sx, position: 'relative', ...(item.current ? activeLook : {}) }}>
          {content}
        </Box>
      )}
    </li>
  );
}

/** The narrow rail: icon over a short label; parents open their children in a menu. */
export function NavMini({ groups }: { groups: ExtendedNavGroup[] }) {
  const labels = useLabels();
  return (
    <Box component="nav" aria-label={labels.mainNavigation} sx={{ px: 0.75, pb: 2 }}>
      {/* minmax(0, 1fr) lets a long label shrink to the rail and end in an ellipsis. */}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>
        {groups.flatMap((group) => group.items).map((item) => (
          <MiniRow key={item.label} item={item} />
        ))}
      </Box>
    </Box>
  );
}

/** Every link in the navigation with its group and parent, for the search. */
export function flattenNav(groups: ExtendedNavGroup[]) {
  const out: { label: string; to: string; trail: string[] }[] = [];
  const walk = (items: ExtendedNavItem[], trail: string[]) => {
    for (const item of items) {
      if (item.to && !item.children?.length) out.push({ label: item.label, to: item.to, trail });
      if (item.children) walk(item.children, [...trail, item.label]);
    }
  };
  for (const group of groups) walk(group.items, group.title ? [group.title] : []);
  return out;
}
