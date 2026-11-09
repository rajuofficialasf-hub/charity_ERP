import type { ReactNode } from 'react';
import type { SwitchProps, OtherChoice, ChoiceOption, CheckboxProps, ComboboxProps, RadioGroupProps, CheckboxGroupProps } from '@/ui/contract';

import { useId, useState } from 'react';

import Box from '@mui/material/Box';
import Radio from '@mui/material/Radio';
import MuiSwitch from '@mui/material/Switch';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import MuiCheckbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import Autocomplete from '@mui/material/Autocomplete';
import MuiRadioGroup from '@mui/material/RadioGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormControlLabel from '@mui/material/FormControlLabel';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

/** The text box an "other" choice opens, inside the same field. */
export function OtherText({ other, disabled }: { other: OtherChoice; disabled?: boolean }) {
  const labels = useLabels();
  return (
    <TextField
      size="small"
      fullWidth
      label={other.label ?? labels.otherSpecify}
      value={other.text}
      onChange={(event) => other.onTextChange(event.target.value)}
      disabled={disabled}
      sx={{ mt: 1.5 }}
    />
  );
}

/** The message under a field: its error, otherwise its hint. */
function FieldNote({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  const text = error ?? hint;
  return text ? (
    <FormHelperText id={id} error={Boolean(error)}>
      {text}
    </FormHelperText>
  ) : null;
}

/** One checkbox, named by its visible label or, in a table row, by `ariaLabel`. */
export function Checkbox({ label, ariaLabel, checked, onChange, indeterminate, disabled, hint, name }: CheckboxProps) {
  const hintId = useId();
  const box = (
    <MuiCheckbox
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      name={name}
      onChange={(event) => onChange(event.target.checked)}
      slotProps={{ input: { 'aria-label': label ? undefined : ariaLabel, 'aria-describedby': hint ? hintId : undefined } }}
    />
  );
  if (!label) return box;
  return (
    <Box>
      <FormControlLabel control={box} label={label} disabled={disabled} />
      {hint && (
        <FormHelperText id={hintId} sx={{ mt: -0.5, ml: 4 }}>
          {hint}
        </FormHelperText>
      )}
    </Box>
  );
}

/** A labelled group of choices: a fieldset named by its legend, its error and hint linked to it. */
function ChoiceFieldset({
  label,
  error,
  hint,
  required,
  disabled,
  labelId,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  labelId?: string;
  children: (noteId: string | undefined) => ReactNode;
}) {
  const noteId = useId();
  const described = error || hint ? noteId : undefined;
  return (
    <FormControl component="fieldset" error={Boolean(error)} required={required} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={described} fullWidth>
      <FormLabel component="legend" id={labelId} sx={{ mb: 0.5, typography: 'subtitle2' }}>
        {label}
      </FormLabel>
      {children(described)}
      <FieldNote id={noteId} error={error} hint={hint} />
    </FormControl>
  );
}

export function CheckboxGroup({ label, name, error, hint, required, disabled, options, value, onChange, columns = 1, other }: CheckboxGroupProps) {
  const toggle = (option: string, on: boolean) => onChange(on ? [...value, option] : value.filter((item) => item !== option));
  return (
    <ChoiceFieldset label={label} error={error} hint={hint} required={required} disabled={disabled}>
      {() => (
        <>
          <FormGroup sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }, columnGap: 2 }}>
            {options.map((option) => (
              <FormControlLabel
                key={option.value}
                label={option.label}
                disabled={disabled || option.disabled}
                control={<MuiCheckbox name={name} value={option.value} checked={value.includes(option.value)} onChange={(event) => toggle(option.value, event.target.checked)} />}
              />
            ))}
          </FormGroup>
          {other && value.includes(other.value) && <OtherText other={other} disabled={disabled} />}
        </>
      )}
    </ChoiceFieldset>
  );
}

export function RadioGroup({ label, name, error, hint, required, disabled, options, value, onChange, orientation = 'vertical', other }: RadioGroupProps) {
  const labelId = useId();
  return (
    <ChoiceFieldset label={label} labelId={labelId} error={error} hint={hint} required={required} disabled={disabled}>
      {() => (
        <>
          <MuiRadioGroup aria-labelledby={labelId} name={name} row={orientation === 'horizontal'} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
            {options.map((option) => (
              <FormControlLabel key={option.value} value={option.value} label={option.label} disabled={disabled || option.disabled} control={<Radio />} />
            ))}
          </MuiRadioGroup>
          {other && value === other.value && <OtherText other={other} disabled={disabled} />}
        </>
      )}
    </ChoiceFieldset>
  );
}

/** An on/off setting that applies at once. */
export function Switch({ label, ariaLabel, checked, onChange, disabled, hint }: SwitchProps) {
  const hintId = useId();
  const control = (
    <MuiSwitch
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      slotProps={{ input: { role: 'switch', 'aria-label': label ? undefined : ariaLabel, 'aria-describedby': hint ? hintId : undefined } }}
    />
  );
  if (!label) return control;
  return (
    <Box>
      <FormControlLabel control={control} label={label} disabled={disabled} />
      {hint && (
        <FormHelperText id={hintId} sx={{ mt: -0.5, ml: 6.5 }}>
          {hint}
        </FormHelperText>
      )}
    </Box>
  );
}

/** Type to narrow a long list; with `serverSearch` the list is what the server answered. */
export function Combobox({
  label,
  name,
  error,
  hint,
  required,
  disabled,
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  onInputChange,
  serverSearch,
  loading,
  onOpen,
  freeText,
  valueLabel,
}: ComboboxProps) {
  const labels = useLabels();
  // the last option chosen here, shown while a server search answers without it
  const [chosen, setChosen] = useState<ChoiceOption | null>(null);
  const known = options.find((option) => option.value === value) ?? (chosen?.value === value ? chosen : null);
  const selected = known ?? (value !== null && valueLabel !== undefined ? { value, label: valueLabel } : null);
  return (
    <Autocomplete<ChoiceOption, false, false, boolean>
      options={options}
      value={selected}
      freeSolo={freeText}
      loading={loading}
      disabled={disabled}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      getOptionDisabled={(option) => Boolean(option.disabled)}
      isOptionEqualToValue={(option, current) => typeof current !== 'string' && option.value === current.value}
      filterOptions={serverSearch ? (all) => all : undefined}
      onChange={(_, next) => {
        if (typeof next === 'string') return onChange(freeText ? next : null);
        setChosen(next);
        onChange(next?.value ?? null);
      }}
      onInputChange={(_, text) => onInputChange?.(text)}
      onOpen={onOpen}
      onBlur={onBlur}
      noOptionsText={labels.noResults}
      loadingText={labels.loading}
      clearText={labels.clear}
      openText={labels.showOptions}
      closeText={labels.close}
      popupIcon={<Icon name="chevron-down" size={18} />}
      renderInput={(params) => (
        <TextField {...params} name={name} label={label} placeholder={placeholder} required={required} error={Boolean(error)} helperText={error ?? hint} />
      )}
    />
  );
}
