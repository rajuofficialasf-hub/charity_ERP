import { createTheme, type Shadows, type Theme } from '@mui/material/styles';
import type { ElementType } from 'react';
import { BREAKPOINTS } from '../../breakpoints.js';
import { ROOT_TOKENS, tokenVar } from '../../tokens.js';

/** Pixels per MUI spacing step: the 4 px spacing scale of docs/ui/DESIGN_SYSTEM.md. */
export const SPACING_PX = 4;

/** The MUI shadows from the elevation tokens: none, the three levels, then the top level. */
function shadows(): Shadows {
  const levels = [
    ROOT_TOKENS['elevation-0'],
    ROOT_TOKENS['elevation-1'],
    ROOT_TOKENS['elevation-2'],
  ];
  return Array.from({ length: 25 }, (_, i) => levels[i] ?? ROOT_TOKENS['elevation-3']) as Shadows;
}

/**
 * The MUI theme of the set, built from the design tokens so the approved brand look stays
 * (docs/ui/brand/colors.md and the token block of docs/ui/DESIGN_SYSTEM.md): green for actions, amber only as decoration,
 * status colours only for status, UbuntuSans and Bornomala at 400 and 700, radius 8 for
 * controls and the 4 px spacing scale. Sizes that change at the desktop breakpoint are read
 * through their CSS variables. `linkComponent` gives every MUI link client-side navigation.
 */
export function createUiTheme(linkComponent?: ElementType): Theme {
  return createTheme({
    cssVariables: true,
    palette: {
      mode: 'light',
      primary: {
        main: ROOT_TOKENS['color-brand-primary'],
        dark: ROOT_TOKENS['color-brand-primary-dark'],
        light: ROOT_TOKENS['color-bg-brand-soft'],
        contrastText: ROOT_TOKENS['color-text-on-brand'],
      },
      secondary: {
        main: ROOT_TOKENS['color-brand-accent'],
        dark: ROOT_TOKENS['color-brand-accent-ink'],
        contrastText: ROOT_TOKENS['color-brand-ink'],
      },
      success: {
        main: ROOT_TOKENS['color-status-success'],
        light: ROOT_TOKENS['color-bg-success-soft'],
      },
      warning: {
        main: ROOT_TOKENS['color-status-warning'],
        light: ROOT_TOKENS['color-bg-warning-soft'],
      },
      error: {
        main: ROOT_TOKENS['color-status-danger'],
        light: ROOT_TOKENS['color-bg-danger-soft'],
      },
      info: { main: ROOT_TOKENS['color-status-info'], light: ROOT_TOKENS['color-bg-info-soft'] },
      text: {
        primary: ROOT_TOKENS['color-text-primary'],
        secondary: ROOT_TOKENS['color-text-secondary'],
      },
      background: {
        default: ROOT_TOKENS['color-bg-canvas'],
        paper: ROOT_TOKENS['color-bg-surface'],
      },
      divider: ROOT_TOKENS['color-border-default'],
    },
    typography: {
      fontFamily: ROOT_TOKENS['font-sans'],
      fontWeightLight: 400,
      fontWeightRegular: 400,
      // the brand fonts have no medium or semibold: bold stands in for both
      fontWeightMedium: 700,
      fontWeightBold: 700,
      h1: { fontSize: tokenVar('text-display'), fontWeight: 700, lineHeight: 1.4 },
      h2: { fontSize: tokenVar('text-title'), fontWeight: 700, lineHeight: 1.4 },
      h3: { fontSize: tokenVar('text-title'), fontWeight: 700, lineHeight: 1.4 },
      body1: { fontSize: tokenVar('text-body'), lineHeight: 1.5 },
      body2: { fontSize: tokenVar('text-body'), lineHeight: 1.5 },
      caption: { fontSize: tokenVar('text-caption'), lineHeight: 1.5 },
      button: { fontSize: tokenVar('text-body'), fontWeight: 700, textTransform: 'none' },
    },
    shape: { borderRadius: Number.parseInt(ROOT_TOKENS['radius-md'], 10) },
    spacing: SPACING_PX,
    breakpoints: {
      values: { xs: 0, sm: BREAKPOINTS.sm, md: BREAKPOINTS.lg, lg: BREAKPOINTS.xl, xl: 1536 },
    },
    shadows: shadows(),
    zIndex: {
      appBar: Number(ROOT_TOKENS['z-nav']),
      drawer: Number(ROOT_TOKENS['z-drawer']),
      modal: Number(ROOT_TOKENS['z-modal']),
      snackbar: Number(ROOT_TOKENS['z-toast']),
    },
    components: linkComponent
      ? {
          MuiButtonBase: { defaultProps: { LinkComponent: linkComponent } },
          MuiLink: { defaultProps: { component: linkComponent } },
        }
      : {},
  });
}
