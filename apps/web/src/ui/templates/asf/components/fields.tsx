import type { ReactNode } from 'react';
import type { FieldStates, TextFieldExtendedProps, SelectFieldExtendedProps } from '@/ui/contract';

import { useEffect, useId, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import MuiDrawer from '@mui/material/Drawer';
import FormHelperText from '@mui/material/FormHelperText';
import { alpha, type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MuiTextField from '@mui/material/TextField';

import { Icon } from './icon';
import { Combobox, OtherText } from './choices';
import { fill, useLabels } from './labels';
import { brandInk } from './shared';

// ----------------------------------------------------------------------

/** Bengali digits as English digits, so numbers are stored and compared one way. */
const toEnglishDigits = (text: string) => text.replace(/[\u09E6-\u09EF]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));

type Kind = NonNullable<TextFieldExtendedProps['type']>;

/** What each kind keeps of the typed text. */
const CLEAN = new Map<Kind, (text: string) => string>([
  ['integer', (text) => toEnglishDigits(text).replace(/\D/g, '')],
  ['nid', (text) => toEnglishDigits(text).replace(/\D/g, '')],
  ['tel', (text) => toEnglishDigits(text).replace(/[^\d+]/g, '')],
  ['decimal', decimal],
  ['money', decimal],
]);

function decimal(text: string) {
  const [whole = '', ...rest] = toEnglishDigits(text).replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

const KEYPAD = new Map<Kind, 'numeric' | 'decimal' | 'tel'>([
  ['integer', 'numeric'],
  ['nid', 'numeric'],
  ['decimal', 'decimal'],
  ['money', 'decimal'],
  ['tel', 'tel'],
]);

/** The longest an identity number or a mobile number with its country code can be. */
const MAX_LENGTH = new Map<Kind, number>([
  ['nid', 17],
  ['tel', 14],
]);

/** The marks under a field: locked with its correction link, changed with the previous value, officials only. */
function FieldMarks({ marksId, locked, onRequestCorrection, previousValue, officialOnly }: FieldStates & { marksId?: string }) {
  const labels = useLabels();
  if (!locked && previousValue === undefined && !officialOnly) return null;
  const mark = { display: 'inline-flex', alignItems: 'center', gap: 0.5, typography: 'caption', color: 'text.secondary' } as const;
  return (
    <Box id={marksId} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, mt: 0.75, px: 1.75 }}>
      {locked && (
        <Box component="span" sx={mark}>
          <Icon name="lock" size={16} />
          {labels.locked}
        </Box>
      )}
      {locked && onRequestCorrection && (
        <Button size="small" variant="text" color="inherit" onClick={onRequestCorrection} sx={{ minWidth: 0, px: 0.5, typography: 'caption', fontWeight: 600, ...brandInk }}>
          {labels.requestCorrection}
        </Button>
      )}
      {previousValue !== undefined && (
        <Box component="span" sx={(theme) => ({ ...mark, color: 'warning.darker', ...theme.applyStyles('dark', { color: 'warning.light' }) })}>
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
        <Box component="span" sx={(theme) => ({ ...mark, color: 'info.darker', ...theme.applyStyles('dark', { color: 'info.light' }) })}>
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
  const clean = CLEAN.get(type);
  const fieldId = id ?? ownId;
  // the marks under the field are read out with its help, so a locked field says so
  const marked = states.locked || states.previousValue !== undefined || states.officialOnly;
  const describedBy = [error ?? hint ? `${fieldId}-helper-text` : null, marked ? `${fieldId}-marks` : null].filter(Boolean).join(' ') || undefined;
  const native = type === 'password' ? (shown ? 'text' : 'password') : clean ? (type === 'tel' ? 'tel' : 'text') : type;
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
          <Icon name={shown ? 'eye-off' : 'eye'} size={20} />
        </IconButton>
      </InputAdornment>
    ) : endAction ? (
      <InputAdornment position="end">{endAction}</InputAdornment>
    ) : undefined;
  return (
    <Box>
      <MuiTextField
        id={fieldId}
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
            maxLength: maxLength ?? MAX_LENGTH.get(type),
            inputMode: inputMode ?? KEYPAD.get(type),
            lang,
            readOnly: readOnly || states.locked,
            'aria-describedby': describedBy,
            style: clean ? { fontVariantNumeric: 'tabular-nums' } : undefined,
          },
        }}
      />
      <FieldMarks {...states} marksId={`${fieldId}-marks`} />
    </Box>
  );
}

/**
 * A select over a short list; above 10 options, or with `searchable`, a combobox to type into. On a
 * phone it is a sheet from the bottom with nothing to type, so no keyboard opens.
 */
export function SelectField(props: SelectFieldExtendedProps) {
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'), { noSsr: true });
  return phone ? <SheetSelect {...props} /> : <MenuSelect {...props} />;
}

function MenuSelect({
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
  const otherBox = other && value === other.value && <OtherText other={other} disabled={disabled} />;
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

/**
 * The phone's select: the field shows its label and the chosen value, and a tap opens the options
 * as a sheet from the bottom, one row each, the chosen one ticked. Nothing is typed, so no keyboard
 * opens (DECISION_LOG D-166).
 */
function SheetSelect({
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
  other,
  autoOpen,
}: SelectFieldExtendedProps) {
  const id = useId();
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  // the next level of an address opens by itself once the one above it is picked
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (autoOpen && wasDisabled.current && !disabled && !value && options.length > 0) setOpen(true);
    wasDisabled.current = disabled;
  }, [autoOpen, disabled, value, options.length]);
  const close = () => {
    setOpen(false);
    onBlur?.();
  };
  const helper = error ?? hint;
  return (
    <Box>
      <ButtonBase
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        aria-describedby={helper ? `${id}-helper` : undefined}
        onClick={() => setOpen(true)}
        sx={(theme) => ({
          width: '100%',
          minHeight: 56,
          px: 1.75,
          py: 1,
          gap: 1.5,
          justifyContent: 'space-between',
          textAlign: 'left',
          borderRadius: 1,
          border: '1px solid',
          borderColor: error ? theme.vars.palette.error.main : alpha(theme.palette.grey[500], 0.32),
          bgcolor: theme.vars.palette.background.paper,
          transition: 'border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          '&:hover': { borderColor: error ? theme.vars.palette.error.main : theme.vars.palette.text.secondary },
          '&.Mui-disabled': { opacity: 0.5 },
          '&.Mui-focusVisible': { outline: `2px solid ${theme.vars.palette.primary.main}`, outlineOffset: 2 },
        })}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box component="span" sx={{ typography: 'caption', fontWeight: 600, color: error ? 'error.main' : 'text.secondary' }}>
            {label}
            {required ? ' *' : ''}
          </Box>
          <Box
            component="span"
            sx={{
              typography: 'body1',
              fontWeight: chosen ? 600 : 400,
              color: chosen ? 'text.primary' : 'text.disabled',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {chosen?.label ?? placeholder ?? labels.selectPlaceholder}
          </Box>
        </Box>
        <Icon name="chevron-down" size={20} />
      </ButtonBase>
      {helper ? (
        <FormHelperText id={`${id}-helper`} error={Boolean(error)} sx={{ mx: 1.75 }}>
          {helper}
        </FormHelperText>
      ) : null}
      <MuiDrawer
        anchor="bottom"
        open={open}
        onClose={close}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-labelledby': `${id}-title`,
            sx: {
              mx: 'auto',
              width: 'min(560px, 100%)',
              maxHeight: '78vh',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              pb: 'calc(16px + env(safe-area-inset-bottom, 0px))',
              display: 'flex',
            },
          },
        }}
      >
        <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: 4, bgcolor: 'divider', mx: 'auto', mt: 1, mb: 1.5, flex: 'none' }} />
        <Box component="h2" id={`${id}-title`} sx={{ m: 0, px: 2.5, pb: 1, typography: 'h6', flex: 'none' }}>
          {label}
        </Box>
        <Box
          role="listbox"
          aria-labelledby={`${id}-title`}
          sx={{ overflowY: 'auto', px: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <ButtonBase
                key={option.value}
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                autoFocus={selected}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                sx={(theme) => ({
                  minHeight: 52,
                  px: 1.5,
                  gap: 1.5,
                  borderRadius: 1.5,
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  typography: 'body1',
                  fontWeight: selected ? 700 : 500,
                  color: selected ? theme.vars.palette.primary.dark : theme.vars.palette.text.primary,
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  '&:hover': {
                    bgcolor: selected ? alpha(theme.palette.primary.main, 0.14) : theme.vars.palette.action.hover,
                  },
                  '&.Mui-focusVisible': { outline: `2px solid ${theme.vars.palette.primary.main}`, outlineOffset: -2 },
                  ...theme.applyStyles('dark', {
                    color: selected ? theme.vars.palette.primary.light : theme.vars.palette.text.primary,
                  }),
                })}
              >
                <span>{option.label}</span>
                {selected ? <Icon name="check" size={20} /> : null}
              </ButtonBase>
            );
          })}
        </Box>
      </MuiDrawer>
      {other && value === other.value && <OtherText other={other} disabled={disabled} />}
    </Box>
  );
}
