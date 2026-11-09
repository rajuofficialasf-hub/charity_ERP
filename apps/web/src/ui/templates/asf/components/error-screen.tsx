import type { ErrorScreenProps } from '@/ui/contract';

import Box from '@mui/material/Box';

import { Icon } from './icon';
import { APP_NAME } from '../config';

// ----------------------------------------------------------------------

const KIND = { 'not-found': { code: '404', icon: 'search' }, forbidden: { code: '403', icon: 'shield' }, error: { code: '500', icon: 'error' } } as const;

export function ErrorScreen({ title, message, action, kind = 'error' }: ErrorScreenProps) {
  const look = KIND[kind];
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, py: 8, textAlign: 'center' }}>
      <title>{`${title} | ${APP_NAME}`}</title>
      <Box sx={{ maxWidth: 480 }}>
        <Box
          aria-hidden
          sx={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 88,
            height: 88,
            mb: 3,
            borderRadius: '50%',
            color: 'primary.main',
            bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.1)',
          }}
        >
          <Icon name={look.icon} size={40} />
        </Box>
        <Box sx={{ typography: 'overline', color: 'text.disabled' }}>{look.code}</Box>
        <Box component="h1" sx={{ m: 0, mt: 1, typography: 'h4' }}>
          {title}
        </Box>
        <Box component="p" sx={{ mt: 1.5, mb: 4, color: 'text.secondary' }}>
          {message}
        </Box>
        {action}
      </Box>
    </Box>
  );
}
