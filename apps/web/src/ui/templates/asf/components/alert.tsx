import type { AlertProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

const TONE_ICON = { info: 'info', success: 'success', warning: 'warning', error: 'error' } as const;

/** A tinted note in the page. Errors interrupt (role alert); the rest are polite (role status). */
export function Alert({ tone, title, children, action, onDismiss }: AlertProps) {
  const labels = useLabels();
  return (
    <Box
      role={tone === 'error' ? 'alert' : 'status'}
      sx={(theme) => ({
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        p: 2,
        borderRadius: 1.5,
        border: `1px solid ${alpha(theme.palette[tone].main, 0.24)}`,
        bgcolor: alpha(theme.palette[tone].main, 0.08),
        color: theme.vars.palette[tone].darker,
        ...theme.applyStyles('dark', { color: theme.vars.palette[tone].lighter }),
      })}
    >
      <Box sx={(theme) => ({ color: theme.vars.palette[tone].main, display: 'flex', pt: '1px' })}>
        <Icon name={TONE_ICON[tone]} size={22} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, typography: 'body2' }}>
        {title && <Box sx={{ typography: 'subtitle2', mb: 0.5 }}>{title}</Box>}
        {children}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      {onDismiss && (
        <IconButton size="small" aria-label={labels.dismiss} onClick={onDismiss} sx={{ mt: -0.5, mr: -0.5, color: 'inherit' }}>
          <Icon name="close" size={18} />
        </IconButton>
      )}
    </Box>
  );
}
