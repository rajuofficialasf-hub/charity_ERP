import type { Theme } from '@mui/material/styles';

// Small helpers the app's own pieces share: hidden text for screen readers, counts in English
// digits, the looks that keep text readable, and the checks that keep a page's data from becoming a
// link or an image source that runs or loads something else.

/** Read by screen readers, not shown. */
export const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Counts with English digits and grouping, in both languages. */
export const count = new Intl.NumberFormat('en-US');

const LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/** A link a person may follow: http, https, mail, phone or a path of this site; otherwise undefined. */
export function safeHref(href: string | undefined) {
  if (!href) return undefined;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  try {
    return LINK_SCHEMES.includes(new URL(href).protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

/** A path inside the app for the router; anything else is no link. */
export function appPath(to: string | undefined) {
  return to && to.startsWith('/') && !to.startsWith('//') ? to : undefined;
}

/** An image the app made or serves: a path of this site, a local preview, or an embedded image. */
export function safeImageSrc(src: string | undefined) {
  if (!src) return undefined;
  if (src.startsWith('/') && !src.startsWith('//')) return src;
  if (src.startsWith('blob:') || src.startsWith('data:image/')) return src;
  return undefined;
}

/**
 * The brand green as the colour of text: the main green is too light for text on white (3.1:1), so
 * text takes the dark shade, and the light shade on the dark page.
 */
export const brandInk = {
  color: 'var(--asf-palette-primary-dark)',
  '[data-color-scheme="dark"] &': { color: 'var(--asf-palette-primary-light)' },
} as const;

/** The primary action of the admin screens: dark with white text, white with dark text in dark mode. */
export const darkButton = (theme: Theme) => ({
  bgcolor: theme.vars.palette.grey[800],
  color: theme.vars.palette.common.white,
  '&:hover': { bgcolor: theme.vars.palette.grey[700] },
  ...theme.applyStyles('dark', {
    bgcolor: theme.vars.palette.common.white,
    color: theme.vars.palette.grey[800],
    '&:hover': { bgcolor: theme.vars.palette.grey[400] },
  }),
});

/** A destructive confirmation: the dark red, readable with white text. */
export const dangerButton = (theme: Theme) => ({
  bgcolor: theme.vars.palette.error.dark,
  color: theme.vars.palette.common.white,
  '&:hover': { bgcolor: theme.vars.palette.error.darker },
});
