/**
 * Breakpoints of the design system (DESIGN_SYSTEM 2.8, O-40 item 7). CSS variables cannot be read
 * inside media queries, so these numbers are also written into tailwind.css and the component CSS;
 * a test keeps all of them equal.
 */
export const BREAKPOINTS = { sm: 640, lg: 1024, xl: 1280 } as const;

/** The narrowest supported screen and the two verification viewports of T1.4. */
export const MIN_WIDTH = 360;
export const VERIFY_VIEWPORTS = {
  phone: { width: 360, height: 640 },
  desktop: { width: 1280, height: 800 },
} as const;
