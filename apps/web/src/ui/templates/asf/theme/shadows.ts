// Elevations, from the admin panel: a hairline outline plus a soft drop, tinted with the given colour
// (the neutral 500 in light mode, black in dark mode).
import { alpha } from '@mui/material/styles';

export const shadows = {
  z1: (c: string) => `0 1px 2px 0 ${alpha(c, 0.16)}`,
  card: (c: string) => `0 0 2px 0 ${alpha(c, 0.2)}, 0 12px 24px -4px ${alpha(c, 0.12)}`,
  dialog: (c: string) => `-40px 40px 80px -8px ${alpha(c, 0.24)}`,
  dropdown: (c: string) => `0 0 2px 0 ${alpha(c, 0.24)}, -20px 20px 40px -4px ${alpha(c, 0.24)}`,
};
