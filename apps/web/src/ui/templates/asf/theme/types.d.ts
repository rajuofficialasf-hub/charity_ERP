// Theme typings: the CSS-variable theme (theme.vars), and the lighter and darker shades every
// token colour scale has.
import type {} from '@mui/material/themeCssVarsAugmentation';
import type {} from '@mui/x-date-pickers/themeAugmentation';

declare module '@mui/material/styles' {
  interface PaletteColor {
    lighter: string;
    darker: string;
  }
  interface SimplePaletteColorOptions {
    lighter?: string;
    darker?: string;
  }
}
