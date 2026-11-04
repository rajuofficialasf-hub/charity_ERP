import type { BottomNavProps } from '@/ui/contract';

import { Link } from 'react-router';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';

import { Icon } from '../icon';
import { fill, useLabels } from '../labels';
import { brandInk } from '../shared';

// ----------------------------------------------------------------------

export const RAIL_WIDTH = 88;
export const TABS_HEIGHT = 64;

/** A count as the badge shows it: 99+ above 99. */
export const badgeText = (count: number) => (count > 99 ? '99+' : String(count));

function Badge({ count }: { count: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        position: 'absolute',
        top: 2,
        left: '50%',
        ml: 1,
        minWidth: 18,
        height: 18,
        px: 0.5,
        borderRadius: 9,
        bgcolor: 'error.dark',
        color: 'error.contrastText',
        typography: 'caption',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: '18px',
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {badgeText(count)}
    </Box>
  );
}

const itemSx = (variant: BottomNavProps['variant'], current: boolean) =>
  ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.25,
    flex: variant === 'tabs' ? 1 : undefined,
    minWidth: 0,
    width: variant === 'rail' ? '100%' : undefined,
    py: variant === 'rail' ? 1.25 : 0.75,
    px: 0.5,
    borderRadius: 1.5,
    color: 'text.secondary',
    fontWeight: current ? 700 : 500,
    textDecoration: 'none',
    typography: 'caption',
    textAlign: 'center',
    ...(current && brandInk),
    ...(current && variant === 'rail' && { bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' }),
    '&:hover': { bgcolor: 'action.hover' },
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
  }) as const;

const labelSx = { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/** The few main destinations at a phone's bottom (tabs) or a tablet's side (rail), and "more". */
export function BottomNav({ label, items, more, variant }: BottomNavProps) {
  const labels = useLabels();
  return (
    <Box
      component="nav"
      aria-label={label}
      data-variant={variant}
      sx={(theme) =>
        variant === 'tabs'
          ? {
              position: 'fixed',
              insetInline: 0,
              bottom: 0,
              zIndex: theme.zIndex.appBar,
              display: 'flex',
              alignItems: 'stretch',
              height: `calc(${TABS_HEIGHT}px + env(safe-area-inset-bottom))`,
              pb: 'env(safe-area-inset-bottom)',
              px: 0.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }
          : {
              position: 'fixed',
              insetBlock: 0,
              left: 0,
              zIndex: theme.zIndex.appBar + 1,
              width: RAIL_WIDTH,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 0.5,
              pt: 11,
              px: 1,
              borderRight: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
            }
      }
    >
      {items.map((item) => (
        <Box
          key={item.key}
          component={Link}
          to={item.to}
          aria-current={item.current ? 'page' : undefined}
          aria-label={item.count ? fill(labels.countName, { label: item.label, count: item.count }) : undefined}
          sx={itemSx(variant, Boolean(item.current))}
        >
          <Icon name={item.icon} size={24} />
          <Box component="span" sx={labelSx}>
            {item.label}
          </Box>
          {item.count ? <Badge count={item.count} /> : null}
        </Box>
      ))}
      {more && (
        <ButtonBase aria-haspopup="dialog" aria-current={more.current ? 'page' : undefined} onClick={more.onClick} sx={itemSx(variant, Boolean(more.current))}>
          <Icon name="menu" size={24} />
          <Box component="span" sx={labelSx}>
            {more.label}
          </Box>
        </ButtonBase>
      )}
    </Box>
  );
}
