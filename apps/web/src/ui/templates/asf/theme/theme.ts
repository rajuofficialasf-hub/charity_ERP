// The asf theme: the app's tokens (src/ui/tokens.ts) mapped onto MUI's theme, light and dark. The
// design comes from the org's own admin panel and public site (../../design/screens in the kit);
// every value here is either a token or derived from one.
import type { ThemeTokens, ColorScale, ColorTone } from '@/ui/contract';

import { alpha, createTheme } from '@mui/material/styles';

import { componentOverrides } from './overrides';

// Bengali has no letters in Public Sans; Noto Sans Bengali takes over for those characters only.
const BENGALI_FALLBACK = '"Noto Sans Bengali Variable"';
const SYSTEM_FALLBACK = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function fontStack(family: string) {
  return `"${family}", ${BENGALI_FALLBACK}, ${SYSTEM_FALLBACK}`;
}

const scale = (c: ColorScale) => ({ ...c });

export function createAsfTheme(tokens: ThemeTokens) {
  const { colors, radius, spacing, typography } = tokens;
  const n = colors.neutral;
  const common = {
    primary: scale(colors.primary),
    secondary: scale(colors.secondary),
    info: scale(colors.info),
    success: scale(colors.success),
    warning: scale(colors.warning),
    error: scale(colors.error),
    grey: n,
  };

  const theme = createTheme({
    cssVariables: { colorSchemeSelector: 'data-color-scheme', cssVarPrefix: 'asf' },
    colorSchemes: {
      light: {
        palette: {
          ...common,
          text: { primary: n['800'], secondary: n['600'], disabled: n['500'] },
          background: { default: '#FFFFFF', paper: '#FFFFFF' },
          divider: alpha(n['500'], 0.2),
          action: {
            hover: alpha(n['500'], 0.08),
            selected: alpha(n['500'], 0.16),
            focus: alpha(n['500'], 0.24),
            disabled: alpha(n['500'], 0.8),
            disabledBackground: alpha(n['500'], 0.24),
          },
        },
      },
      dark: {
        palette: {
          ...common,
          text: { primary: '#FFFFFF', secondary: n['500'], disabled: n['600'] },
          background: { default: n['900'], paper: n['800'] },
          divider: alpha(n['500'], 0.2),
          action: {
            hover: alpha(n['500'], 0.08),
            selected: alpha(n['500'], 0.16),
            focus: alpha(n['500'], 0.24),
            disabled: alpha(n['500'], 0.8),
            disabledBackground: alpha(n['500'], 0.24),
          },
        },
      },
    },
    spacing,
    shape: { borderRadius: radius.medium },
    typography: {
      fontFamily: fontStack(typography.fontFamily),
      fontSize: typography.fontSize,
      htmlFontSize: 16,
      fontWeightMedium: 500,
      fontWeightBold: 700,
      // A tight product scale (about 1.2 per step). Display sizes are for public pages only.
      h1: { fontFamily: fontStack(typography.headingFontFamily), fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.15 },
      h2: { fontFamily: fontStack(typography.headingFontFamily), fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.25 },
      h3: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.4 },
      h4: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.4 },
      h5: { fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.5 },
      h6: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.55 },
      subtitle1: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
      subtitle2: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.57 },
      body1: { fontSize: '1rem', lineHeight: 1.5 },
      body2: { fontSize: '0.875rem', lineHeight: 1.57 },
      caption: { fontSize: '0.75rem', lineHeight: 1.5 },
      // 12 px, the smallest text size; the letters spaced apart in Latin only, never in Bengali
      overline: { fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.5, letterSpacing: 'var(--asf-overline-tracking, 0.04em)' },
      button: { fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.7, textTransform: 'none' },
    },
    breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
  });

  // The overrides read the finished theme (its CSS variables), so they are added after it is built.
  theme.components = componentOverrides(theme, tokens) as typeof theme.components;
  return theme;
}

export type AsfTheme = ReturnType<typeof createAsfTheme>;

/** The colours a ColorTone stands for, in light mode (the dark scheme reuses the same scales). */
export function toneScale(tokens: ThemeTokens, tone: ColorTone = 'neutral'): ColorScale {
  if (tone === 'neutral') {
    const n = tokens.colors.neutral;
    return { lighter: n['100'], light: n['300'], main: n['600'], dark: n['700'], darker: n['800'], contrastText: '#FFFFFF' };
  }
  return tokens.colors[tone];
}
