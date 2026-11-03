import type { EmptyStateProps, LoadingStateProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

export function LoadingState({ label }: LoadingStateProps) {
  const labels = useLabels();
  return (
    <Box role="status" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 6, color: 'text.secondary' }}>
      <CircularProgress size={20} color="inherit" aria-hidden />
      <Box component="span" sx={{ typography: 'body2' }}>
        {label ?? labels.loading}
      </Box>
    </Box>
  );
}

/** An empty tray with a soft shadow: the asf illustration for "nothing here yet". */
function EmptyArt() {
  return (
    <Box component="svg" viewBox="0 0 160 120" aria-hidden sx={{ width: 140, height: 'auto', color: 'grey.500' }}>
      <ellipse cx="80" cy="104" rx="56" ry="6" fill="currentColor" opacity="0.12" />
      <path d="M28 62 L44 30 H116 L132 62 V92 a6 6 0 0 1 -6 6 H34 a6 6 0 0 1 -6 -6 Z" fill="currentColor" opacity="0.16" />
      <path d="M28 62 H58 l6 10 h32 l6 -10 h30 V92 a6 6 0 0 1 -6 6 H34 a6 6 0 0 1 -6 -6 Z" fill="currentColor" opacity="0.28" />
      <rect x="56" y="16" width="48" height="40" rx="5" fill="currentColor" opacity="0.2" />
      <rect x="64" y="26" width="32" height="4" rx="2" fill="currentColor" opacity="0.5" />
      <rect x="64" y="35" width="22" height="4" rx="2" fill="currentColor" opacity="0.35" />
    </Box>
  );
}

/** Says what is missing and, through `action`, how to add the first one. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1,
        py: 6,
        px: 3,
        borderRadius: 2,
        bgcolor: 'grey.100',
        ...theme.applyStyles('dark', { bgcolor: 'transparent' }),
      })}
    >
      {icon ? (
        <Box sx={{ color: 'text.disabled', mb: 1 }}>
          <Icon name={icon} size={48} />
        </Box>
      ) : (
        <EmptyArt />
      )}
      <Box component="p" sx={{ m: 0, typography: 'h6', color: 'text.secondary' }}>
        {title}
      </Box>
      {description && (
        <Box component="p" sx={{ m: 0, typography: 'body2', color: 'text.disabled', maxWidth: '48ch' }}>
          {description}
        </Box>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
