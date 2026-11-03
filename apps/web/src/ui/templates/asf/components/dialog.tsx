import type { DialogProps } from '@/ui/contract';

import { useId } from 'react';

import MuiDialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

const WIDTH = { small: 'xs', medium: 'sm', large: 'md' } as const;

export function Dialog({ open, onClose, title, children, actions, size = 'medium' }: DialogProps) {
  const titleId = useId();
  const labels = useLabels();
  return (
    <MuiDialog open={open} onClose={onClose} fullWidth maxWidth={WIDTH[size]} aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ pr: 7 }}>
        {title}
      </DialogTitle>
      <IconButton aria-label={labels.close} onClick={onClose} sx={{ position: 'absolute', top: 20, right: 16 }}>
        <Icon name="close" size={20} />
      </IconButton>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </MuiDialog>
  );
}
