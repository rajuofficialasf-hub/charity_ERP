import type { TextProps, HeadingProps } from '@/ui/contract';

import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

const HEADING_VARIANT = { 2: 'h5', 3: 'h6', 4: 'subtitle1' } as const;

/** A section heading. The page title is the only level 1, so levels start at 2. */
export function Heading({ children, level = 2 }: HeadingProps) {
  return (
    <Typography component={`h${level}`} variant={HEADING_VARIANT[level]} sx={{ textWrap: 'balance' }}>
      {children}
    </Typography>
  );
}

const TONE = { default: 'text.primary', muted: 'text.secondary', error: 'error.main' } as const;

export function Text({ children, tone = 'default', size = 'body' }: TextProps) {
  return (
    <Typography variant={size === 'small' ? 'body2' : 'body1'} sx={{ color: TONE[tone], textWrap: 'pretty' }}>
      {children}
    </Typography>
  );
}
