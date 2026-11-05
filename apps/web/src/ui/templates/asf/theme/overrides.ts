// MUI component defaults and styles for asf. Each block names what it matches in the reference
// screens; anything not listed keeps MUI's own look.
import type { ThemeTokens } from '@/ui/contract';
import type { Theme, CSSObject, Components } from '@mui/material/styles';

import { alpha } from '@mui/material/styles';

import { shadows } from './shadows';

/** '#919EAB' as '145 158 171', for rgba(var(--…) / a) in styles. */
const hexChannel = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

export function componentOverrides(theme: Theme, tokens: ThemeTokens): Components<Theme> {
  const n = tokens.colors.neutral;
  const { radius } = tokens;
  const dark = (styles: CSSObject) => theme.applyStyles('dark', styles);
  const focusRing = {
    outline: `2px solid ${tokens.colors.primary.main}`,
    outlineOffset: 2,
  };

  return {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { '--asf-neutral-500-channel': hexChannel(n['500']) },
        html: { WebkitTextSizeAdjust: '100%', scrollbarColor: `${alpha(n['500'], 0.48)} transparent` },
        body: { textRendering: 'optimizeLegibility' },
        '::selection': { backgroundColor: alpha(tokens.colors.primary.main, 0.24) },
        ':focus-visible': focusRing,
        'a': { textUnderlineOffset: '0.2em' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
        },
      },
    },

    // Buttons: bold label, medium radius. "inherit" contained is the dark primary action of the admin
    // screens ("Apply Leave", "Export").
    MuiButtonBase: { defaultProps: { disableRipple: false } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: radius.medium, minHeight: 36, paddingInline: 16, '&.Mui-focusVisible': focusRing },
        sizeLarge: { minHeight: 48, paddingInline: 22, fontSize: '0.9375rem' },
        sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: '0.8125rem' },
        outlined: { borderColor: alpha(n['500'], 0.32), '&:hover': { borderColor: 'currentColor' } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { '&.Mui-focusVisible': focusRing } } },

    // Surfaces.
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: radius.large,
          boxShadow: shadows.card(n['500']),
          position: 'relative',
          ...dark({ boxShadow: shadows.card('#000000') }),
        },
      },
    },

    // The legend of a radio or checkbox group: the text colour while a choice has the focus, as a
    // field's label; the main green there reads 3.1:1 on white.
    MuiFormLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { color: theme.vars.palette.text.primary },
          '&.Mui-error': { color: theme.vars.palette.error.dark },
          ...dark({ '&.Mui-error': { color: theme.vars.palette.error.light } }),
        },
      },
    },
    // Fields: outlined with a floating label, hairline border, dark border when focused.
    MuiInputLabel: {
      styleOverrides: {
        // the secondary grey reads on white and on the dark page; the disabled grey does not (2.7:1)
        root: {
          color: theme.vars.palette.text.secondary,
          '&.Mui-focused': { color: theme.vars.palette.text.primary },
          '&.Mui-error': { color: theme.vars.palette.error.dark },
          ...dark({ '&.Mui-error': { color: theme.vars.palette.error.light } }),
        },
        shrink: { fontWeight: 600, color: theme.vars.palette.text.secondary },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.medium,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(n['500'], 0.2) },
          '&:hover:not(.Mui-disabled, .Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.text.primary },
          '&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.text.primary, borderWidth: 2 },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: alpha(n['500'], 0.16) },
        },
        input: { '&::placeholder': { color: theme.vars.palette.text.disabled, opacity: 1 } },
      },
    },
    // The date and time pickers draw their own outlined input; same look as the text fields.
    MuiPickersOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.medium,
          '& .MuiPickersOutlinedInput-notchedOutline': { borderColor: alpha(n['500'], 0.2) },
          '&:hover:not(.Mui-disabled, .Mui-error) .MuiPickersOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.text.primary },
          '&.Mui-focused:not(.Mui-error) .MuiPickersOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.text.primary, borderWidth: 2 },
        },
      },
    },
    // the main red is too light for small text on white (3.2:1): errors take the dark red, the
    // light red on the dark page
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          marginInline: 12,
          '&.Mui-error': { color: theme.vars.palette.error.dark },
          ...dark({ '&.Mui-error': { color: theme.vars.palette.error.light } }),
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: radius.medium + 2, boxShadow: shadows.dropdown(n['500']), padding: 4, ...dark({ boxShadow: shadows.dropdown('#000000') }) },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: radius.small,
          fontSize: '0.875rem',
          minHeight: 36,
          '&.Mui-selected': { fontWeight: 600, backgroundColor: theme.vars.palette.action.selected },
        },
      },
    },

    // Tables: grey header row, roomy rows, hairline dividers.
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomStyle: 'dashed', borderBottomColor: alpha(n['500'], 0.2), fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' },
        head: {
          fontWeight: 600,
          color: theme.vars.palette.text.secondary,
          backgroundColor: n['200'],
          borderBottom: 'none',
          whiteSpace: 'nowrap',
          ...dark({ backgroundColor: alpha(n['500'], 0.12) }),
        },
        paddingCheckbox: { paddingLeft: 8 },
      },
    },

    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: n['800'], fontSize: '0.75rem', fontWeight: 500, ...dark({ backgroundColor: n['700'] }) } },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radius.large, boxShadow: shadows.dialog(n['500']), ...dark({ boxShadow: shadows.dialog('#000000') }) },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { padding: 24, fontSize: '1.125rem', fontWeight: 700 } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '0 24px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: 24, gap: 8 } } },
    MuiDrawer: {
      styleOverrides: {
        paper: { boxShadow: shadows.dialog(n['500']), backgroundImage: 'none', ...dark({ boxShadow: shadows.dialog('#000000') }) },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: { variants: [{ props: { invisible: false }, style: { backgroundColor: alpha(n['800'], 0.48) } }] },
      },
    },

    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: theme.vars.palette.text.primary, height: 2 } },
    },
    MuiTab: {
      defaultProps: { disableRipple: true, iconPosition: 'start' },
      styleOverrides: {
        root: {
          minHeight: 48,
          minWidth: 0,
          padding: '0 0 0 0',
          marginRight: 40,
          fontSize: '0.875rem',
          fontWeight: 600,
          color: theme.vars.palette.text.secondary,
          '&.Mui-selected': { color: theme.vars.palette.text.primary },
          '&.Mui-focusVisible': focusRing,
          gap: 8,
          '& > svg': { margin: 0 },
        },
      },
    },

    MuiChip: { styleOverrides: { root: { borderRadius: radius.small, fontWeight: 700 } } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiLink: { defaultProps: { underline: 'hover' } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: alpha(n['500'], 0.12) } } },
  };
}
