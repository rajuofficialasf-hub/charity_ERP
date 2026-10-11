'use client';

import type { ReactNode } from 'react';
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';
import { Spinner } from '../Spinner/Spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  /** primary (one per region), secondary, ghost (tertiary and row actions), danger (DESIGN_SYSTEM 5.1). */
  variant?: ButtonVariant;
  /** md: 44 px on phones, 40 px on desktop; sm: 36/32 px with a 44 px hit area on phones. */
  size?: 'md' | 'sm';
  icon?: IconComponent;
  iconPosition?: 'start' | 'end';
  /** Shows only the icon; the children become the accessible name (visually hidden). */
  iconOnly?: boolean;
  /**
   * Spinner replaces the start icon, the label stays, presses are ignored. React Aria marks the
   * button aria-disabled while it keeps focus, and announces the pending state.
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

/** Button of DESIGN_SYSTEM 5.1 on React Aria (keyboard, press and focus-visible handling). */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'start',
  iconOnly = false,
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onPress,
  href,
  autoFocus,
  className,
  children,
  ...aria
}: ButtonProps) {
  const classes = cx(
    'ui-btn',
    `ui-btn-${variant}`,
    size === 'sm' && 'ui-btn-sm',
    iconOnly && 'ui-btn-icon',
    fullWidth && 'ui-btn-block',
    className,
  );
  const startIcon = loading ? (
    <Spinner size={size === 'sm' ? 'sm' : 'md'} />
  ) : icon && iconPosition === 'start' ? (
    <Icon icon={icon} size={size === 'sm' ? 'sm' : 'md'} />
  ) : null;
  const endIcon =
    icon && iconPosition === 'end' && !loading ? (
      <Icon icon={icon} size={size === 'sm' ? 'sm' : 'md'} />
    ) : null;
  const content = (
    <>
      {startIcon}
      {iconOnly ? <span className="ui-sr-only">{children}</span> : children}
      {endIcon}
    </>
  );

  if (href) {
    return (
      <AriaLink
        href={href}
        className={classes}
        isDisabled={disabled}
        autoFocus={autoFocus}
        {...aria}
      >
        {content}
      </AriaLink>
    );
  }
  return (
    <AriaButton
      type={type}
      className={classes}
      isDisabled={disabled}
      isPending={loading}
      onPress={onPress}
      autoFocus={autoFocus}
      {...aria}
    >
      {content}
    </AriaButton>
  );
}
