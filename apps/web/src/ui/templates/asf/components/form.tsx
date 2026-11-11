import type { FieldValues } from 'react-hook-form';
import type {
  FormProps,
  FormDateFieldProps,
  FormTimeFieldProps,
  FormSubmitButtonProps,
  FormTextFieldExtendedProps,
  FormSelectFieldExtendedProps,
} from '@/ui/contract';

import { FormProvider, useController, useFormContext } from 'react-hook-form';

import Box from '@mui/material/Box';

import { Alert } from './alert';
import { Button } from './button';
import { TextField, SelectField } from './fields';
import { DateField, TimeField } from './pickers';

// ----------------------------------------------------------------------

/** A react-hook-form form: fields stack with even gaps; a form-level error shows on top. */
export function Form<T extends FieldValues>({ form, onSubmit, children, error, label }: FormProps<T>) {
  return (
    <FormProvider {...form}>
      <Box
        component="form"
        noValidate
        aria-label={label}
        onSubmit={form.handleSubmit(onSubmit)}
        sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        {children}
      </Box>
    </FormProvider>
  );
}

const asText = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));

/** A text field bound by name; `normalize` turns what is typed into the value kept. */
export function FormTextField({ name, normalize, ...other }: FormTextFieldExtendedProps) {
  const { field, fieldState } = useController({ name });
  return (
    <TextField
      {...other}
      name={field.name}
      value={asText(field.value)}
      onChange={(value) => field.onChange(normalize ? normalize(value) : value)}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}

export function FormSelectField({ name, ...other }: FormSelectFieldExtendedProps) {
  const { field, fieldState } = useController({ name });
  return (
    <SelectField
      {...other}
      name={field.name}
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}

export function FormDateField({ name, ...other }: FormDateFieldProps) {
  const { field, fieldState } = useController({ name });
  return (
    <DateField
      {...other}
      name={field.name}
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}

export function FormTimeField({ name, ...other }: FormTimeFieldProps) {
  const { field, fieldState } = useController({ name });
  return (
    <TimeField
      {...other}
      name={field.name}
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}

export function FormSubmitButton({ children, ...look }: FormSubmitButtonProps) {
  const { formState } = useFormContext();
  return (
    <Button {...look} type="submit" loading={formState.isSubmitting}>
      {children}
    </Button>
  );
}
