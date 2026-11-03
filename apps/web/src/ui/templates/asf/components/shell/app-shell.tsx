import type { AppShellExtendedProps } from '@/ui/contract';

import { useState } from 'react';
import { Link } from 'react-router';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

import { Icon } from '../icon';
import { useLabels } from '../labels';
import { APP_NAME } from '../../config';
import { CommandPalette } from './command-palette';
import { ColorModeButton } from './color-mode-button';
import { NavMini, NavSection } from './nav-section';

// ----------------------------------------------------------------------

const WIDE = 280;
const MINI = 88;
const HEADER = 72;
const COLLAPSED_KEY = 'asf-nav-collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function Brand({ brand, compact }: { brand: AppShellExtendedProps['brand']; compact?: boolean }) {
  const name = brand?.name ?? APP_NAME;
  return (
    <Box
      component={Link}
      to="/"
      aria-label={compact ? name : undefined}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textDecoration: 'none', color: 'inherit', minWidth: 0 }}
    >
      {brand?.logoSrc ? (
        <Box component="img" src={brand.logoSrc} alt="" sx={{ height: 40, width: 'auto', flexShrink: 0 }} />
      ) : (
        <Box
          aria-hidden
          sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', typography: 'h6', flexShrink: 0 }}
        >
          {name.charAt(0)}
        </Box>
      )}
      {!compact && (
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ typography: 'subtitle1', fontWeight: 700, color: 'primary.main', lineHeight: 1.3 }}>{name}</Box>
          {brand?.tagline && <Box sx={{ typography: 'caption', color: 'primary.main', lineHeight: 1.4 }}>{brand.tagline}</Box>}
        </Box>
      )}
    </Box>
  );
}

/**
 * The admin frame: a sidebar that folds to an icon rail on wide screens and becomes a drawer on
 * small ones, and a header with search, the colour mode switch and the app's own actions.
 */
export function AppShell({ children, navigation, headerActions, brand, search = true }: AppShellExtendedProps) {
  const labels = useLabels();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const width = collapsed ? MINI : WIDE;

  const toggle = () =>
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, v ? '0' : '1');
      } catch {
        // Storage can be blocked; the choice then lasts for this visit only.
      }
      return !v;
    });

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', bgcolor: 'background.default' }}>
      {wide && (
        <Box
          component="aside"
          sx={{
            position: 'fixed',
            inset: '0 auto 0 0',
            width,
            zIndex: theme.zIndex.appBar + 1,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', px: collapsed ? 2.5 : 2, pt: 2.5, pb: 3 }}>
            <Brand brand={brand} compact={collapsed} />
          </Box>
          <IconButton
            size="small"
            onClick={toggle}
            aria-label={collapsed ? labels.expandNavigation : labels.collapseNavigation}
            aria-expanded={!collapsed}
            sx={{
              position: 'absolute',
              top: 22,
              right: -13,
              width: 26,
              height: 26,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
              color: 'text.secondary',
              '&:hover': { bgcolor: 'background.default', color: 'text.primary' },
              '& svg': { transition: 'transform 200ms', transform: collapsed ? 'rotate(180deg)' : 'none' },
            }}
          >
            <Icon name="chevron-left" size={16} />
          </IconButton>
          <Box sx={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {collapsed ? <NavMini groups={navigation} /> : <NavSection groups={navigation} />}
          </Box>
        </Box>
      )}

      {!wide && (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          slotProps={{ paper: { sx: { width: WIDE, bgcolor: 'background.default' }, 'aria-label': labels.openNavigation } }}
        >
          <Box sx={{ px: 2, pt: 2.5, pb: 3 }}>
            <Brand brand={brand} />
          </Box>
          <NavSection groups={navigation} onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pl: wide ? `${width}px` : 0 }}>
        <Box
          component="header"
          sx={(t) => ({
            position: 'sticky',
            top: 0,
            zIndex: t.zIndex.appBar,
            height: HEADER,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 2, sm: 3, lg: 5 },
            // A solid-enough header so scrolled content never fights the controls.
            bgcolor: 'rgba(var(--asf-palette-background-defaultChannel) / 0.88)',
            backdropFilter: 'blur(8px)',
          })}
        >
          {!wide && (
            <IconButton aria-label={labels.openNavigation} onClick={() => setMobileOpen(true)} sx={{ ml: -1, color: 'text.primary' }}>
              <Icon name="menu" />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }} />
          {search && <CommandPalette navigation={navigation} />}
          <ColorModeButton />
          {headerActions}
        </Box>
        <Box component="main" sx={{ flex: 1, pb: 8 }}>
          <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3, lg: 5 }, pt: 1 }}>
            {children}
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
