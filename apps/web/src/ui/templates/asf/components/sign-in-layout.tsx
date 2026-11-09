import type { SignInLayoutProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';

import { APP_NAME } from '../config';

// ----------------------------------------------------------------------

/** A centred card on a quiet brand-tinted background. */
export function SignInLayout({ title, description, children }: SignInLayoutProps) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 6,
        bgcolor: 'background.default',
        backgroundImage: 'radial-gradient(120% 60% at 50% 0%, rgba(var(--asf-palette-primary-mainChannel) / 0.08), transparent)',
      }}
    >
      <title>{`${title} | ${APP_NAME}`}</title>
      <Card sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 5 } }}>
        <Box sx={{ typography: 'subtitle2', color: 'primary.main', mb: 3 }}>{APP_NAME}</Box>
        <Box component="h1" sx={{ m: 0, typography: 'h4' }}>
          {title}
        </Box>
        {description && (
          <Box component="p" sx={{ m: 0, mt: 1, mb: 1, typography: 'body2', color: 'text.secondary' }}>
            {description}
          </Box>
        )}
        <Box sx={{ mt: 4 }}>{children}</Box>
      </Card>
    </Box>
  );
}
