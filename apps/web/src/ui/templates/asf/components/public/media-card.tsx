import type { MediaCardProps } from '@/ui/contract';

import { Link } from 'react-router';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';

import { Icon } from '../icon';

// ----------------------------------------------------------------------

const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) as const;

/**
 * An image card for an activity, fund or article. With `to`, the title's link stretches over the
 * whole card, so the card is one tab stop and `action` stays separately clickable above it.
 */
export function MediaCard({ image, title, description, category, meta, action, to, orientation = 'vertical', headingLevel = 3 }: MediaCardProps) {
  const horizontal = orientation === 'horizontal';
  return (
    <Card
      component="article"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: { xs: 'column', md: horizontal ? 'row' : 'column' },
        transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms',
        ...(to && { '&:hover': { transform: 'translateY(-2px)' }, '&:hover img': { transform: 'scale(1.03)' }, '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }),
      }}
    >
      <Box sx={{ overflow: 'hidden', flexShrink: 0, aspectRatio: horizontal ? { xs: '16 / 10', md: 'auto' } : '16 / 10', width: { md: horizontal ? '48%' : '100%' } }}>
        <Box component="img" src={image.src} alt={image.alt} loading="lazy" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
      </Box>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, p: { xs: 2.5, md: horizontal ? 5 : 2.5 }, justifyContent: horizontal ? 'center' : 'flex-start' }}>
        {category && (
          <Box sx={(t) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, typography: 'caption', fontWeight: 600, color: t.vars.palette.warning.dark, ...t.applyStyles('dark', { color: t.vars.palette.warning.light }) })}>
            <Icon name="star" size={14} />
            {category}
          </Box>
        )}
        <Box component={`h${headingLevel}`} sx={{ m: 0, typography: 'h6', fontWeight: 700, ...clamp(2) }}>
          {to ? (
            <Box component={Link} to={to} sx={{ color: 'inherit', textDecoration: 'none', '&::after': { content: '""', position: 'absolute', inset: 0 }, '&:focus-visible': { outline: 'none' } }}>
              {title}
            </Box>
          ) : (
            title
          )}
        </Box>
        {description && <Box sx={{ typography: 'body2', color: 'text.secondary', ...clamp(horizontal ? 3 : 2) }}>{description}</Box>}
        {meta && <Box sx={{ typography: 'caption', color: 'text.secondary', mt: 0.5 }}>{meta}</Box>}
        {action && <Box sx={{ mt: 'auto', pt: 2, position: 'relative', zIndex: 1, '& > *': { width: '100%' } }}>{action}</Box>}
      </Box>
    </Card>
  );
}
