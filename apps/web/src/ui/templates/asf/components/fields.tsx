import type { ReactNode } from 'react';
import type { FieldStates, TextFieldExtendedProps, SelectFieldExtendedProps } from '@/ui/contract';

import { useId, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MuiTextField from '@mui/material/TextField';

import { Icon } from './icon';
import { Combobox } from './choices';
import { fill, useLabels } from './labels';

// ----------------------------------------------------------------------

/** Bengali digits as English digits, so numbers are stored and compared one way. */
const toEnglishDigits = (text: string) => text.replace(/[\u09E6-\u09EF]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));

/** What each kind keeps of the typed text. */
const CLEAN: Partial<Record<NonNullable<TextFieldExtendedProps['type']>, (text: string) => string>> = {
  integer: (text) => toEnglishDigits(text).replace(/\D/g, ''),
  nid: (text) => toEnglishDigits(text).replace(/\D/g, ''),
  tel: (text) => toEnglishDigits(text).replace(/[^\d+]/g, ''),
  decimal: decimal,
  money: decimal,
};

function decimal(text: string) {
  const [whole = '', ...rest] = toEnglishDigits(text).replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

const KEYPAD: Partial<Record<NonNullable<TextFieldExtendedProps['type']>, 'numeric' | 'decimal' | 'tel'>> = {
  integer: 'numeric',
  nid: 'numeric',
  decimal: 'decimal',
  money: 'decimal',
  tel: 'tel',
};

/** The marks under a field: locked with its correction link, changed with the previous value, officials only. */
function FieldMarks({ locked, onRequestCorrection, previousValue, officialOnly }: FieldStates) {
  const labels = useLabels();
  if (!locked && previousValue === undefined && !officialOnly) return null;
  const mark = { display: 'inline-flex', alignItems: 'center', gap: 0.5, typography: 'caption', color: 'text.secondary' } as const;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, mt: 0.75, px: 1.75 }}>
      {locked && (
        <Box component="span" sx={mark}>
          <Icon name="shield" size={16} />
          {labels.locked}
        </Box>
      )}
      {locked && onRequestCorrection && (
        <Button size="small" variant="text" onClick={onRequestCorrection} sx={{ minWidth: 0, px: 0.5, typography: 'caption', fontWeight: 600 }}>
          {labels.requestCorrection}
        </Button>
      )}
      {previousValue !== undefined && (
        <Box component="span" sx={{ ...mark, color: 'warning.dark' }}>
          <Icon name="refresh" size={16} />
          {labels.changed}
        </Box>
      )}
      {previousValue !== undefined && (
        <Box component="span" sx={mark}>
          {fill(labels.previousValue, { value: previousValue })}
        </Box>
      )}
      {officialOnly && (
        <Box component="span" sx={{ ...mark, color: 'info.dark' }}>
          <Icon name="eye" size={16} />
          {labels.officialOnly}
        </Box>
      )}
    </Box>
  );
}

/**
 * A text field. Besides the plain kinds it takes the app's: identity numbers, integers, decimals and
 * money (English digits whatever was typed), a mobile number, and a password with a show button;
 * and the states of a record's field: locked, changed, officials only.
 */
export function TextField({
  id,
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
  maxLength,
  inputMode,
  lang,
  endAction,
  readOnly,
  ...states
}: TextFieldExtendedProps) {
  const ownId = useId();
  const labels = useLabels();
  const [shown, setShown] = useState(false);
  const clean = CLEAN[type];
  const native = type === 'password' ? (shown ? 'text' : 'password') : clean ? (type === 'tel' ? 'tel' : 'text') : type;
  const lengths: Partial<Record<string, number>> = { nid: 17, tel: 14 };
  const start: ReactNode =
    type === 'search' ? (
      <InputAdornment position="start" sx={{ color: 'text.disabled' }}>
        <Icon name="search" size={20} />
      </InputAdornment>
    ) : type === 'money' ? (
      <InputAdornment position="start">
        <span aria-hidden="true">৳</span>
      </InputAdornment>
    ) : undefined;
  const end: ReactNode =
    type === 'password' ? (
      <InputAdornment position="end">
        <IconButton aria-label={shown ? labels.hidePassword : labels.showPassword} aria-pressed={shown} onClick={() => setShown((now) => !now)} edge="end">
          <Icon name="eye" size={20} />
        </IconButton>
      </InputAdornment>
    ) : endAction ? (
      <InputAdornment position="end">{endAction}</InputAdornment>
    ) : undefined;
  return (
    <Box>
      <MuiTextField
        id={id ?? ownId}
        fullWidth
        label={label}
        name={name}
        type={native}
        value={value}
        onChange={(event) => onChange(clean ? clean(event.target.value) : event.target.value)}
        onBlur={onBlur}
        error={Boolean(error)}
        helperText={error ?? hint}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete ?? (type === 'tel' || clean ? 'off' : undefined)}
        placeholder={placeholder}
        multiline={rows !== undefined && rows > 1}
        minRows={rows}
        slotProps={{
          input: { startAdornment: start, endAdornment: end },
          htmlInput: {
            maxLength: maxLength ?? lengths[type],
            inputMode: inputMode ?? KEYPAD[type],
            lang,
            readOnly: readOnly || states.locked,
            style: clean ? { fontVariantNumeric: 'tabular-nums' } : undefined,
          },
        }}
      />
      <FieldMarks {...states} />
    </Box>
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
