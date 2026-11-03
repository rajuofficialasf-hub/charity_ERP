import type { TextFieldProps, SelectFieldProps } from '@/ui/contract';

import { useId } from 'react';

import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import MuiTextField from '@mui/material/TextField';

import { Icon } from './icon';

// ----------------------------------------------------------------------

export function TextField({
  label,
  name,
  error,
  hint,
  required,
  disabled,
  value,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
  placeholder,
  rows,
}: TextFieldProps) {
  const id = useId();
  return (
    <MuiTextField
      id={id}
      fullWidth
      label={label}
      name={name}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      error={Boolean(error)}
      helperText={error ?? hint}
      required={required}
      disabled={disabled}
      autoComplete={autoComplete}
      placeholder={placeholder}
      multiline={rows !== undefined && rows > 1}
      minRows={rows}
      slotProps={{
        input:
          type === 'search'
            ? {
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.disabled' }}>
                    <Icon name="search" size={20} />
                  </InputAdornment>
                ),
              }
            : undefined,
      }}
    />
  );
}

export function SelectField({ label, name, error, hint, required, disabled, value, onChange, onBlur, options }: SelectFieldProps) {
  const id = useId();
  return (
    <MuiTextField
      id={id}
      select
      fullWidth
      label={label}
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      error={Boolean(error)}
      helperText={error ?? hint}
      required={required}
      disabled={disabled}
      slotProps={{
        select: {
          IconComponent: (props: { className?: string }) => (
            <span {...props} style={{ right: 12, display: 'inline-flex' }}>
              <Icon name="chevron-down" size={18} />
            </span>
          ),
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </MuiTextField>
  );
}
