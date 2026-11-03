import type { TextFieldProps, SelectFieldExtendedProps } from '@/ui/contract';

import { useId } from 'react';

import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import MuiTextField from '@mui/material/TextField';

import { Icon } from './icon';
import { useLabels } from './labels';
import { Combobox } from './choices';

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

/** A select over a short list; above 10 options, or with `searchable`, a combobox to type into. */
export function SelectField({
  label,
  name,
  error,
  hint,
  required,
  disabled,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  searchable = options.length > 10,
  other,
}: SelectFieldExtendedProps) {
  const id = useId();
  const labels = useLabels();
  const otherBox = other && value === other.value && (
    <MuiTextField
      size="small"
      fullWidth
      label={other.label ?? labels.otherSpecify}
      value={other.text}
      onChange={(event) => other.onTextChange(event.target.value)}
      disabled={disabled}
      sx={{ mt: 1.5 }}
    />
  );
  if (searchable) {
    return (
      <Box>
        <Combobox
          label={label}
          name={name}
          error={error}
          hint={hint}
          required={required}
          disabled={disabled}
          options={options}
          value={value === '' ? null : value}
          onChange={(next) => onChange(next ?? '')}
          onBlur={onBlur}
          placeholder={placeholder}
        />
        {otherBox}
      </Box>
    );
  }
  const empty = placeholder ?? labels.selectPlaceholder;
  return (
    <Box>
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
          inputLabel: placeholder ? { shrink: true } : undefined,
          select: {
            displayEmpty: Boolean(placeholder),
            renderValue: (selected) =>
              selected === '' ? (
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {empty}
                </Box>
              ) : (
                (options.find((option) => option.value === selected)?.label ?? String(selected))
              ),
            IconComponent: (props: { className?: string }) => (
              <span {...props} style={{ right: 12, display: 'inline-flex' }}>
                <Icon name="chevron-down" size={18} />
              </span>
            ),
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </MenuItem>
        ))}
      </MuiTextField>
      {otherBox}
    </Box>
  );
}
