import type { SectionProps } from '@/ui/contract';

import Box from '@mui/material/Box';

// ----------------------------------------------------------------------

/** One band of a public page with a centred heading and room to breathe. */
export function Section({ title, description, children, tone = 'default', action }: SectionProps) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={(t) => ({
        py: { xs: 8, md: 12 },
        px: 2,
        ...(tone === 'muted' && { bgcolor: 'grey.100', ...t.applyStyles('dark', { bgcolor: 'rgba(145 158 171 / 0.06)' }) }),
        ...(tone === 'brand' && { bgcolor: t.vars.palette.primary.dark, color: 'common.white' }),
      })}
    >
      <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
        {(title || description) && (
          <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 7 }, maxWidth: 720, mx: 'auto' }}>
            {title && (
              <Box component="h2" sx={{ m: 0, typography: 'h2', fontSize: { xs: '1.875rem', md: '2.5rem' }, textWrap: 'balance' }}>
                {title}
              </Box>
            )}
            {description && (
              <Box component="p" sx={{ m: 0, mt: 1.5, color: tone === 'brand' ? 'rgba(255 255 255 / 0.85)' : 'text.secondary' }}>
                {description}
              </Box>
            )}
          </Box>
        )}
        {children}
        {action && <Box sx={{ mt: { xs: 5, md: 6 }, display: 'flex', justifyContent: 'center' }}>{action}</Box>}
      </Box>
    </Box>
  );
}
