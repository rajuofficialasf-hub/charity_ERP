import type { ButtonProps as MuiButtonProps } from '@mui/material/Button';
import type { LinkButtonProps, ButtonExtendedProps } from '@/ui/contract';

import { Link as RouterLink } from 'react-router';

import MuiButton from '@mui/material/Button';

import { Icon } from './icon';
import { dangerButton } from './shared';
import { useSurface } from './surface-context';

// ----------------------------------------------------------------------

type Look = Pick<ButtonExtendedProps, 'variant' | 'startIcon' | 'endIcon' | 'fullWidth'>;

/** The contract's look as MUI props. Primary is dark on admin screens and the brand colour on public pages. */
function useLook({ variant = 'primary', startIcon, endIcon, fullWidth }: Look): Pick<MuiButtonProps, 'variant' | 'color' | 'sx' | 'fullWidth' | 'startIcon' | 'endIcon'> {
  const surface = useSurface();
  const common = {
    fullWidth,
    startIcon: startIcon ? <Icon name={startIcon} size={20} /> : undefined,
    endIcon: endIcon ? <Icon name={endIcon} size={20} /> : undefined,
  };
  // Public pages use roomier buttons than dense admin screens.
  const roomy = surface === 'public' ? { minHeight: 44, px: 2.75 } : {};
  switch (variant) {
    case 'secondary':
      return { ...common, variant: 'outlined', color: 'inherit', sx: roomy };
    case 'text':
      return { ...common, variant: 'text', color: 'inherit' };
    case 'danger':
      // the main red with white text reads 3.0:1; the dark red reads with it
      return { ...common, variant: 'contained', color: 'inherit', sx: dangerButton };
    default:
      return surface === 'public'
        ? { ...common, variant: 'contained', color: 'primary', sx: roomy }
        : {
            ...common,
            variant: 'contained',
            color: 'inherit',
            sx: (theme) => ({
              bgcolor: 'grey.800',
              color: 'common.white',
              '&:hover': { bgcolor: 'grey.700' },
              ...theme.applyStyles('dark', { bgcolor: 'common.white', color: 'grey.800', '&:hover': { bgcolor: 'grey.400' } }),
            }),
          };
  }
}

export function Button({ children, onClick, type = 'button', disabled, loading, size = 'medium', ...look }: ButtonExtendedProps) {
  const props = useLook(look);
  return (
    <MuiButton {...props} type={type} onClick={onClick} disabled={disabled} loading={loading} size={size}>
      {children}
    </MuiButton>
  );
}

export function LinkButton({ to, children, ...look }: LinkButtonProps) {
  const props = useLook(look);
  return (
    <MuiButton {...props} component={RouterLink} to={to}>
      {children}
    </MuiButton>
  );
}
