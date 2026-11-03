import type { DrawerProps } from '@/ui/contract';

import { useId } from 'react';

import Box from '@mui/material/Box';
import MuiDrawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

/** A side panel for details or a short task, closed by its button, Escape or a click outside. */
export function Drawer({ open, onClose, title, children, actions, side = 'right' }: DrawerProps) {
  const titleId = useId();
  const labels = useLabels();
  return (
    <MuiDrawer
      anchor={side}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { role: 'dialog', 'aria-labelledby': titleId, sx: { width: 'min(400px, 100vw)', display: 'flex' } },
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
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>{children}</Box>
      {actions && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, p: 2.5, borderTop: 1, borderColor: 'divider' }}>{actions}</Box>
      )}
    </MuiDrawer>
  );
}
