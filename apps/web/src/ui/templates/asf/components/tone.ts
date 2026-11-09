import type { Theme } from '@mui/material/styles';
import type { ColorTone } from '@/ui/contract';

// ----------------------------------------------------------------------

/** The CSS colour variables for a tone, so one style works in light and dark mode. */
export function toneVars(theme: Theme, tone: ColorTone = 'neutral') {
  if (tone === 'neutral') {
    const g = theme.vars.palette.grey;
    return { main: g[600], light: g[400], lighter: g[200], dark: g[700], darker: g[800], channel: 'var(--asf-neutral-500-channel)' };
  }
  const c = theme.vars.palette[tone];
  return { main: c.main, light: c.light, lighter: c.lighter, dark: c.dark, darker: c.darker, channel: c.mainChannel };
}

/** `rgba(var(--…Channel) / a)`: a tone's main colour at an opacity, from CSS variables. */
export const toneAlpha = (channel: string, a: number) => `rgba(${channel} / ${a})`;
