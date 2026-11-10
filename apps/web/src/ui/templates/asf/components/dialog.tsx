import type { Theme } from '@mui/material/styles';
import type { ConfirmDialogProps, DialogExtendedProps } from '@/ui/contract';

import { useId } from 'react';
import { useForm, useController } from 'react-hook-form';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MuiDialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import useMediaQuery from '@mui/material/useMediaQuery';

import { Icon } from './icon';
import { useLabels } from './labels';
import { darkButton, dangerButton } from './shared';

// ----------------------------------------------------------------------

const WIDTH = { small: 'xs', medium: 'sm', large: 'md' } as const;

export function Dialog({ open, onClose, title, children, actions, size = 'medium', dismissible = true, fullScreenOnPhone }: DialogExtendedProps) {
  const titleId = useId();
  const labels = useLabels();
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'), { noSsr: true });
  return (
    <MuiDialog
      open={open}
      onClose={dismissible ? onClose : undefined}
      fullWidth
      fullScreen={Boolean(fullScreenOnPhone) && phone}
      maxWidth={WIDTH[size]}
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId} sx={{ pr: 7 }}>
        {title}
      </DialogTitle>
      <IconButton aria-label={labels.close} onClick={onClose} disabled={!dismissible} sx={{ position: 'absolute', top: 20, right: 16 }}>
        <Icon name="close" size={20} />
      </IconButton>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </MuiDialog>
  );
}

/** The reason box and the buttons; inside the dialog, so the reason starts empty each time it opens. */
function ConfirmBody({
  titleId,
  title,
  message,
  tone,
  confirmLabel,
  consequences,
  reasonRequired,
  reasonLabel,
  onConfirm,
  onCancel,
  pending,
}: Omit<ConfirmDialogProps, 'open'> & { titleId: string }) {
  const labels = useLabels();
  const { control, handleSubmit } = useForm({ defaultValues: { reason: '' } });
  const { field } = useController({ control, name: 'reason', rules: { validate: (value) => !reasonRequired || value.trim() !== '' } });
  const ready = !reasonRequired || field.value.trim() !== '';
  // the button confirms, never twice while the action runs; Enter in the reason writes a new line
  const confirm = handleSubmit(({ reason }) => {
    if (!pending) onConfirm(reason.trim());
  });
  return (
    <>
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {message && <Box sx={{ typography: 'body2', color: 'text.secondary' }}>{message}</Box>}
        {consequences && consequences.length > 0 && (
          <Box component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2' }}>
            {consequences.map((consequence) => (
              <li key={consequence}>{consequence}</li>
            ))}
          </Box>
        )}
        {reasonRequired && (
          <TextField
            label={reasonLabel ?? labels.reason}
            name={field.name}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            inputRef={field.ref}
            required
            multiline
            minRows={2}
            fullWidth
            disabled={pending}
            sx={{ mt: 1 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onCancel} disabled={pending}>
          {labels.cancel}
        </Button>
        <Button variant="contained" color="inherit" sx={tone === 'danger' ? dangerButton : darkButton} onClick={() => void confirm()} disabled={!ready} loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </>
  );
}

/** Asks before an action that matters, with what follows and, where needed, a written reason. */
export function ConfirmDialog({ open, onCancel, pending, ...props }: ConfirmDialogProps) {
  const titleId = useId();
  return (
    <MuiDialog
      open={open}
      onClose={pending ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      aria-labelledby={titleId}
      slotProps={{ paper: { role: 'alertdialog' } }}
    >
      <ConfirmBody titleId={titleId} onCancel={onCancel} pending={pending} {...props} />
    </MuiDialog>
  );
}
