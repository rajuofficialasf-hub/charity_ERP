import type { AnchorHTMLAttributes, ComponentType, ReactNode, RefAttributes } from 'react';
import type { IconComponent } from './components/Icon/Icon.js';

/**
 * The contract of the component set (the organization's UI rules, recorded in
 * docs/architecture/ADR/ADR-015-mui-core-component-set.md): the props every template implements. Pages see these types through `@css/ui`; the template in
 * src/templates/<name>/ imports them with `import type` and checks itself with
 * `satisfies UiTemplate`, so a template that misses a component or changes its props fails the
 * typecheck. A component's props move here when its implementation moves into the template.
 */

/** The template's own provider: theme, styles and client-side links. */
export interface TemplateProviderProps {
  /** Client-side navigation for same-site links. */
  navigate?: ((href: string) => void) | undefined;
  children: ReactNode;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  /** primary (one per region), secondary, ghost (tertiary and row actions), danger. */
  variant?: ButtonVariant;
  /** md: 44 px on phones, 40 px on desktop; sm: 36/32 px with a 44 px hit area on phones. */
  size?: 'md' | 'sm';
  icon?: IconComponent;
  iconPosition?: 'start' | 'end';
  /** Shows only the icon; the children become the accessible name (visually hidden). */
  iconOnly?: boolean;
  /**
   * A spinner replaces the start icon and the label stays; the button stays focusable, is marked
   * busy and disabled for assistive technology, and ignores presses.
   */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  onPress?: () => void;
  /** Renders a link styled as a button; only for navigation. */
  href?: string;
  autoFocus?: boolean;
  /** Layout only (margin, grid placement); never colours or typography. */
  className?: string;
  'aria-describedby'?: string;
  children: ReactNode;
}

/** Everything a template supplies. */
export interface UiTemplate {
  TemplateProvider: ComponentType<TemplateProviderProps>;
  /** A plain anchor whose same-site clicks go through the app's router (cards, navigation). */
  Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & RefAttributes<HTMLAnchorElement>>;
  Button: ComponentType<ButtonProps>;
}
