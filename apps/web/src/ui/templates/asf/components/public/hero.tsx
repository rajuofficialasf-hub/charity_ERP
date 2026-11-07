import type { HeroProps } from '@/ui/contract';

import Box from '@mui/material/Box';

// ----------------------------------------------------------------------

/** The opening band of a public page: photo with a legible scrim, title, text and actions. */
export function Hero({ title, description, image, actions, size = 'large', overlap }: HeroProps) {
  const large = size === 'large';
  return (
    <Box component="section" aria-label={title} sx={{ position: 'relative', mb: overlap ? { xs: 2, md: 12 } : 0 }}>
      <Box
        sx={(t) => ({
          position: 'relative',
          isolation: 'isolate',
          overflow: 'hidden',
          minHeight: large ? { xs: 560, md: 680 } : { xs: 260, md: 320 },
          display: 'flex',
          alignItems: large ? 'center' : 'flex-end',
          justifyContent: large ? 'flex-start' : 'center',
          color: 'common.white',
          bgcolor: t.vars.palette.primary.darker,
          pt: { xs: 14, md: 16 },
          pb: large ? (overlap ? { xs: 6, md: 18 } : 10) : { xs: 6, md: 7 },
        })}
      >
        {image && (
          <Box component="img" src={image.src} alt={image.alt} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }} />
        )}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            background: large
              ? 'linear-gradient(90deg, rgba(0 0 0 / 0.78) 0%, rgba(0 0 0 / 0.55) 45%, rgba(0 0 0 / 0.15) 100%)'
              : 'linear-gradient(180deg, rgba(0 20 12 / 0.55), rgba(0 20 12 / 0.78))',
          }}
        />
        <Box sx={{ width: '100%', maxWidth: 1080, mx: 'auto', px: 2, textAlign: large ? 'left' : 'center' }}>
          <Box
            component="h1"
            sx={{ m: 0, typography: large ? 'h1' : 'h2', fontSize: large ? { xs: '2.5rem', md: '4rem' } : { xs: '1.75rem', md: '2.25rem' }, textWrap: 'balance', maxWidth: large ? '16ch' : 'none', mx: large ? 0 : 'auto' }}
          >
            {title}
          </Box>
          {description && (
            <Box sx={{ mt: 2.5, typography: large ? 'h6' : 'body1', fontWeight: 400, lineHeight: 1.7, maxWidth: '56ch', mx: large ? 0 : 'auto', color: 'rgba(255 255 255 / 0.9)' }}>
              {description}
            </Box>
          )}
          {actions && <Box sx={{ mt: 4, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: large ? 'flex-start' : 'center' }}>{actions}</Box>}
        </Box>
      </Box>
      {overlap && (
        <Box sx={{ position: { md: 'absolute' }, left: 0, right: 0, bottom: { md: -96 }, px: 2, mt: { xs: -4, md: 0 }, zIndex: 1 }}>
          <Box sx={{ maxWidth: 960, mx: 'auto' }}>{overlap}</Box>
        </Box>
      )}
    </Box>
  );
}
