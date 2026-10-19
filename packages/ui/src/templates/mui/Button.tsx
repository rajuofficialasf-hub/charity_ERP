import MuiButton from '@mui/material/Button';
import { styled } from '@mui/material/styles';
import type { MouseEvent } from 'react';
import { Icon } from '../../components/Icon/Icon.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import type { ButtonProps, ButtonVariant } from '../../contract.js';
import { cx } from '../../utils/cx.js';

/**
 * The look of docs/ui/DESIGN_SYSTEM.md section 5.1 on MUI's button: primary is dark green with a
 * light sheen so small white text keeps at least 4.5:1, secondary is outlined, ghost has no
 * frame, danger is the status red. Hover shades, press scales down, focus shows a ring.
 */
const Root = styled(MuiButton, {
  shouldForwardProp: (prop) => prop !== 'look' && prop !== 'small' && prop !== 'square',
})<{ look: ButtonVariant; small: boolean; square: boolean }>(({ look, small, square }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  minWidth: 0,
  minHeight: small ? 36 : 'var(--control-height)',
  padding: small ? '0 var(--space-3)' : 'var(--space-1) var(--space-4)',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'inherit',
  fontSize: small ? 14 : 'var(--text-body)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--leading-heading)',
  textAlign: 'center',
  textDecoration: 'none',
  textTransform: 'none',
  position: small ? 'relative' : undefined,
  transition:
    'box-shadow var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard)',
  ...(square && { minWidth: small ? 36 : 'var(--control-height)', padding: 0 }),
  ...(look === 'primary' && {
    background:
      'var(--color-brand-primary-dark) linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 100%)',
    color: 'var(--color-text-on-brand)',
    boxShadow: 'var(--elevation-brand)',
  }),
  ...(look === 'secondary' && {
    background: 'var(--color-bg-surface)',
    color: 'var(--color-brand-primary-dark)',
    borderColor: 'rgba(0, 123, 62, 0.55)',
    boxShadow: 'var(--elevation-1)',
  }),
  ...(look === 'ghost' && {
    background: 'transparent',
    color: 'var(--color-brand-primary-dark)',
    // on a status tint ghost buttons use ink: dark green reaches only 4.49:1 on the danger tint
    '.ui-alert &, .ui-offline &': {
      color: 'var(--color-text-primary)',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
    },
  }),
  ...(look === 'danger' && {
    background: 'var(--color-status-danger)',
    color: 'var(--color-text-on-brand)',
    boxShadow: '0 6px 16px rgba(192, 57, 43, 0.22)',
  }),
  '&:hover': {
    boxShadow: 'inset 0 0 0 999px rgba(15, 41, 32, 0.06)',
    ...(look === 'primary' && {
      background:
        'var(--color-brand-primary-dark) linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 100%)',
      boxShadow:
        'inset 0 0 0 999px rgba(15, 41, 32, 0.1), 0 2px 4px rgba(0, 123, 62, 0.24), 0 10px 22px rgba(0, 123, 62, 0.28)',
      transform: 'translateY(-1px)',
    }),
    ...(look === 'secondary' && {
      background: 'var(--color-bg-brand-soft)',
      boxShadow: 'var(--elevation-2)',
    }),
    ...(look === 'ghost' && { background: 'transparent' }),
    ...(look === 'danger' && { background: 'var(--color-status-danger)' }),
  },
  '&:active': {
    transform: 'translateY(0) scale(0.98)',
    boxShadow: 'inset 0 0 0 999px rgba(15, 41, 32, 0.16)',
  },
  '&.Mui-focusVisible': {
    outline: '2px solid var(--color-brand-primary)',
    outlineOffset: 2,
  },
  '&.Mui-disabled, &[aria-disabled="true"]:not([data-pending])': {
    background: 'var(--color-bg-muted)',
    color: 'var(--color-text-secondary)',
    borderColor: 'transparent',
    cursor: 'not-allowed',
    boxShadow: 'none',
    transform: 'none',
  },
  '&[data-pending]': { cursor: 'progress' },
  // a 44 px hit area around small buttons on phones
  ...(small && {
    '&::after': { content: '""', position: 'absolute', inset: '-4px 0' },
    '@media (min-width: 1024px)': { minHeight: 32, '&::after': { display: 'none' } },
  }),
}));

/**
 * The set's button on MUI: a native button (or a link for navigation) operated by mouse, Enter
 * and Space. While loading, a spinner replaces the start icon, the button stays focusable, is
 * marked busy and ignores presses.
 */
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
  const small = size === 'sm';
  const startIcon = loading ? (
    <Spinner size={small ? 'sm' : 'md'} />
  ) : icon && iconPosition === 'start' ? (
    <Icon icon={icon} size={small ? 'sm' : 'md'} />
  ) : null;
  const endIcon =
    icon && iconPosition === 'end' && !loading ? (
      <Icon icon={icon} size={small ? 'sm' : 'md'} />
    ) : null;
  const classes = cx(
    'ui-btn',
    `ui-btn-${variant}`,
    small && 'ui-btn-sm',
    iconOnly && 'ui-btn-icon',
    fullWidth && 'ui-btn-block',
    className,
  );
  const content = (
    <>
      {startIcon}
      {iconOnly ? <span className="ui-sr-only">{children}</span> : children}
      {endIcon}
    </>
  );
  const common = {
    look: variant,
    small,
    square: iconOnly,
    className: classes,
    disableRipple: true,
    disableElevation: true,
    fullWidth,
    autoFocus,
    ...aria,
  };
  if (href)
    return (
      <Root {...common} href={href} disabled={disabled}>
        {content}
      </Root>
    );
  return (
    <Root
      {...common}
      type={type}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      data-pending={loading || undefined}
      onClick={(event: MouseEvent) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onPress?.();
      }}
    >
      {content}
    </Root>
  );
}
