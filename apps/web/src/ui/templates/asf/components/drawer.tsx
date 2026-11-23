import type { DrawerProps } from '@/ui/contract';

import type { Theme } from '@mui/material/styles';

import { useId } from 'react';

import Box from '@mui/material/Box';
import MuiDrawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';

import { Icon } from './icon';
import { useLabels } from './labels';
import { SheetContext } from './sheet-context';

// ----------------------------------------------------------------------

/**
 * A side panel for details or a short task, closed by its button, Escape or a click outside. On a
 * phone, and with `side="bottom"`, it is a sheet from the bottom.
 */
export function Drawer({ open, onClose, title, children, actions, side = 'right' }: DrawerProps) {
  const titleId = useId();
  const labels = useLabels();
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'), { noSsr: true });
  const anchor = phone ? 'bottom' : side;
  const sheet = { width: '100%', maxHeight: '90vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 };
  return (
    <MuiDrawer
      anchor={anchor}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { role: 'dialog', 'aria-labelledby': titleId, sx: { display: 'flex', ...(anchor === 'bottom' ? sheet : { width: 'min(400px, 100vw)' }) } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box component="h2" id={titleId} sx={{ m: 0, flex: 1, typography: 'h6' }}>
          {title}
        </Box>
        <IconButton aria-label={labels.close} onClick={onClose}>
          <Icon name="close" size={20} />
        </IconButton>
      </Box>
      {/* a list opened in a bottom sheet opens inside it and scrolls with it */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
        <SheetContext.Provider value={anchor === 'bottom'}>{children}</SheetContext.Provider>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, p: 2.5, borderTop: 1, borderColor: 'divider' }}>{actions}</Box>
      )}
    </MuiDrawer>
  );
}
