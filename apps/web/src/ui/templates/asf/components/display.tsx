import type { AvatarProps, CardProps, ChipProps, GridProps, DescriptionListProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import MuiCard from '@mui/material/Card';
import MuiAvatar from '@mui/material/Avatar';

import { Icon } from './icon';
import { toneVars, toneAlpha } from './tone';

// ----------------------------------------------------------------------

/** A titled surface. The title is a level 2 heading; put tables in with padding "none". */
export function Card({ title, icon, action, children, padding = 'normal', headingLevel = 2 }: CardProps) {
  return (
    <MuiCard component="section">
      {(title || action) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, pt: 3, pb: padding === 'none' ? 2.5 : 0 }}>
          {icon && (
            <Box sx={{ display: 'flex', color: 'text.secondary' }}>
              <Icon name={icon} />
            </Box>
          )}
          {title && (
            <Box component={`h${headingLevel}`} sx={{ m: 0, flex: 1, typography: 'h6', fontWeight: 700 }}>
              {title}
            </Box>
          )}
          {action && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      <Box sx={{ p: padding === 'none' ? 0 : 3, pt: padding === 'none' ? 0 : title ? 2.5 : 3 }}>{children}</Box>
    </MuiCard>
  );
}

export function Grid({ children, columns, gap = 3 }: GridProps) {
  const cols = (count?: number) => (count ? `repeat(${count}, minmax(0, 1fr))` : undefined);
  return (
    <Box
      sx={{
        display: 'grid',
        gap,
        gridTemplateColumns: { xs: cols(columns.base ?? 1), sm: cols(columns.sm), md: cols(columns.md), lg: cols(columns.lg) },
      }}
    >
      {children}
    </Box>
  );
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/** Label and value pairs. "rows" for a record's details; "grid" for a header summary. */
export function DescriptionList({ items, layout = 'rows', columns = 4, emptyValue = '—' }: DescriptionListProps) {
  if (layout === 'grid') {
    return (
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          columnGap: 3,
          rowGap: 2.5,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${columns}, minmax(0, 1fr))` },
        }}
      >
        {items.map((item) => (
          <Box key={item.label} sx={{ minWidth: 0 }}>
            <Box component="dt" sx={{ typography: 'caption', color: 'text.secondary' }}>
              {item.label}
            </Box>
            <Box component="dd" sx={{ m: 0, mt: 0.25, typography: 'subtitle2', overflowWrap: 'anywhere' }}>
              {isEmpty(item.value) ? emptyValue : item.value}
            </Box>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)', columnGap: 3, rowGap: 1.5 }}>
      {items.map((item) => (
        <Box key={item.label} sx={{ display: 'contents' }}>
          <Box component="dt" sx={{ typography: 'subtitle2' }}>
            {item.label}
          </Box>
          <Box component="dd" sx={{ m: 0, typography: 'body2', color: 'text.secondary', textAlign: 'right', overflowWrap: 'anywhere' }}>
            {isEmpty(item.value) ? emptyValue : item.value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function Chip({ children, tone = 'neutral', variant = 'soft', size = 'small' }: ChipProps) {
  return (
    <Box
      component="span"
      sx={(theme) => {
        const t = toneVars(theme, tone);
        const look =
          variant === 'solid'
            ? { bgcolor: t.main, color: tone === 'neutral' ? theme.vars.palette.common.white : theme.vars.palette[tone].contrastText }
            : variant === 'outline'
              ? { border: `1px solid ${toneAlpha(t.channel, 0.48)}`, color: t.dark, ...theme.applyStyles('dark', { color: t.light }) }
              : // the darkest shade on the tint: the dark one reads 3.6:1 for warning
                { bgcolor: toneAlpha(t.channel, 0.16), color: t.darker, ...theme.applyStyles('dark', { color: t.light }) };
        return {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          height: size === 'small' ? 24 : 32,
          minWidth: 24,
          px: size === 'small' ? 0.75 : 1.5,
          borderRadius: 0.75,
          typography: size === 'small' ? 'caption' : 'subtitle2',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          ...look,
        };
      }}
    >
      {children}
    </Box>
  );
}

const AVATAR_SIZE = { small: 32, medium: 40, large: 56, xlarge: 96 } as const;

/** A photo, or the first letter of the name on a colour when there is none. */
export function Avatar({ name, src, size = 'medium', decorative }: AvatarProps) {
  const px = AVATAR_SIZE[size];
  return (
    <MuiAvatar
      src={src}
      alt={decorative ? '' : name}
      aria-hidden={decorative || undefined}
      sx={(theme) => ({
        width: px,
        height: px,
        fontSize: px * 0.4,
        bgcolor: theme.vars.palette.info.main,
        color: theme.vars.palette.common.white,
        ...(px >= 56 && { border: `3px solid ${theme.vars.palette.background.paper}` }),
      })}
    >
      {!src &&
        (decorative ? (
          name.trim().charAt(0).toUpperCase()
        ) : (
          <span role="img" aria-label={name}>
            {name.trim().charAt(0).toUpperCase()}
          </span>
        ))}
    </MuiAvatar>
  );
}
