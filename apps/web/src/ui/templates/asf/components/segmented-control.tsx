import type { SegmentedControlProps } from '@/ui/contract';

import Box from '@mui/material/Box';

// ----------------------------------------------------------------------

/**
 * Two to four choices side by side, one of them chosen: each is a button that says whether it is
 * pressed, inside a group named by `label`. The language switch is this control with the
 * languages; a page uses it to switch between views of the same content.
 */
export function SegmentedControl({ label, value, options, onChange }: SegmentedControlProps) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'inline-flex', p: 0.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Box
            component="button"
            type="button"
            key={option.value}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            sx={(t) => ({
              all: 'unset',
              cursor: 'pointer',
              px: 1.25,
              py: 0.5,
              borderRadius: 0.75,
              typography: 'caption',
              fontWeight: 700,
              color: selected ? t.vars.palette.primary.dark : 'text.secondary',
              bgcolor: selected ? 'rgba(var(--asf-palette-primary-mainChannel) / 0.16)' : 'transparent',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              ...t.applyStyles('dark', { color: selected ? t.vars.palette.primary.light : t.vars.palette.text.secondary }),
            })}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}
