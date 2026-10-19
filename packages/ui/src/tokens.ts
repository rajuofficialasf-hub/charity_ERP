/**
 * The design tokens as data (DESIGN_SYSTEM.md section 2.9): the same names and values as
 * src/styles/tokens.css, so the MUI theme (src/templates/mui/theme.ts) and the page CSS read one
 * source. src/styles/styles.test.ts keeps both equal to the design system. Add a token to the
 * design system first.
 */
export const ROOT_TOKENS = {
  'color-brand-primary': '#008e48',
  'color-brand-primary-dark': '#007b3e',
  'color-brand-ink': '#0f2920',
  'color-brand-accent': '#e8b65d',
  'color-brand-accent-ink': '#9b6119',
  'color-bg-canvas': '#f2f3f7',
  'color-bg-surface': '#ffffff',
  'color-bg-muted': '#eef2f0',
  'color-bg-brand-soft': '#cef5e3',
  'color-bg-success-soft': '#e6efea',
  'color-bg-warning-soft': '#f7efe2',
  'color-bg-danger-soft': '#f7e7e6',
  'color-bg-info-soft': '#e6edf6',
  'color-border-default': '#dfe3e8',
  'color-border-strong': '#7f8e9d',
  'color-text-primary': '#0f2920',
  'color-text-secondary': '#526961',
  'color-text-on-brand': '#ffffff',
  'color-status-success': '#2e7d4f',
  'color-status-warning': '#b9770e',
  'color-status-danger': '#c0392b',
  'color-status-info': '#2b6cb0',
  'color-scrim': 'rgba(15, 41, 32, 0.48)',
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-5': '24px',
  'space-6': '32px',
  'radius-sm': '6px',
  'radius-md': '8px',
  'radius-lg': '16px',
  'radius-full': '9999px',
  'font-sans': 'UbuntuSans, Bornomala, sans-serif',
  'font-weight-regular': '400',
  'font-weight-bold': '700',
  'text-display': '20px',
  'text-title': '16px',
  'text-body': '16px',
  'text-label': '12px',
  'text-caption': '12px',
  'text-input': '16px',
  'leading-body': '1.5',
  'leading-heading': '1.4',
  'elevation-0': 'none',
  'elevation-1': '0 1px 2px rgba(15, 41, 32, 0.04), 0 2px 8px rgba(15, 41, 32, 0.05)',
  'elevation-2': '0 2px 4px rgba(15, 41, 32, 0.05), 0 8px 24px rgba(15, 41, 32, 0.09)',
  'elevation-3': '0 4px 8px rgba(15, 41, 32, 0.06), 0 20px 48px rgba(15, 41, 32, 0.16)',
  'elevation-hover': '0 4px 8px rgba(15, 41, 32, 0.06), 0 14px 32px rgba(15, 41, 32, 0.12)',
  'elevation-brand': '0 1px 2px rgba(0, 123, 62, 0.24), 0 6px 16px rgba(0, 123, 62, 0.22)',
  'border-subtle': 'rgba(15, 41, 32, 0.08)',
  'gradient-brand':
    'linear-gradient( 135deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100% )',
  'gradient-hero':
    'linear-gradient( 135deg, var(--color-brand-primary-dark) 0%, var(--color-brand-ink) 100% )',
  'gradient-soft':
    'linear-gradient( 180deg, var(--color-bg-brand-soft) 0%, var(--color-bg-surface) 100% )',
  'gradient-accent-line':
    'linear-gradient( 90deg, var(--color-brand-primary) 0%, var(--color-brand-accent) 100% )',
  'glow-accent':
    'radial-gradient( circle at 88% 0%, rgba(232, 182, 93, 0.16) 0, rgba(232, 182, 93, 0) 38% )',
  'ring-brand': '0 0 0 4px rgba(0, 142, 72, 0.16)',
  'focus-ring': '0 0 0 2px var(--color-bg-surface), 0 0 0 4px var(--color-brand-primary)',
  'motion-fast': '120ms',
  'motion-base': '200ms',
  'motion-slow': '320ms',
  'ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  'z-sticky': '10',
  'z-nav': '20',
  'z-banner': '30',
  'z-drawer': '40',
  'z-modal': '50',
  'z-toast': '60',
  'control-height': '44px',
  'app-bar-height': '56px',
  'sidebar-width': '248px',
  'rail-width': '72px',
  'content-max': '1280px',
} as const;

/** The values that change from the desktop breakpoint (1024 px) on. */
export const DESKTOP_TOKENS = {
  'text-body': '14px',
  'text-input': '14px',
  'control-height': '40px',
  'app-bar-height': '64px',
} as const satisfies Partial<Record<keyof typeof ROOT_TOKENS, string>>;

export type TokenName = keyof typeof ROOT_TOKENS;

/** The value of a token at phone width. */
export const token = (name: TokenName): string => ROOT_TOKENS[name];

/** A token as a CSS variable reference, for styles that follow the breakpoint values. */
export const tokenVar = (name: TokenName): string => `var(--${name})`;
