import { useMemo } from 'react';
import { type Path, useForm, type UseFormReturn, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';

/**
 * The form of a profile section's edit mode: the ticked details, the new value of each, and one
 * optional reason. Each value is checked by the server, one request per detail, so the form only
 * holds them.
 */
export type EditFields<F extends string> = {
  picked: Partial<Record<F, boolean>>;
  values: Partial<Record<F, unknown>>;
  note: string;
};

export function useEditForm<F extends string>(): UseFormReturn<EditFields<F>> {
  const schema = useMemo(
    () =>
      z.object({
        picked: z.custom<Partial<Record<F, boolean>>>(),
        values: z.custom<Partial<Record<F, unknown>>>(),
        note: z.string(),
      }),
    [],
  );
  return useForm<EditFields<F>>({
    resolver: useSchemaResolver(schema),
    defaultValues: { picked: {}, values: {}, note: '' } as EditFields<F>,
    reValidateMode: 'onSubmit',
  });
}

/** The ticked details, as the form holds them now. */
export function usePicked<F extends string>(form: UseFormReturn<EditFields<F>>): F[] {
  const picked = useWatch({ control: form.control, name: 'picked' as Path<EditFields<F>> }) as
    Partial<Record<F, boolean>> | undefined;
  return (Object.entries(picked ?? {}) as [F, boolean | undefined][])
    .filter(([, on]) => on)
    .map(([field]) => field);
}

/**
 * Ticks or clears a detail: its message goes, and a newly ticked detail starts from what the
 * person has now, so a change is an edit, not a new entry.
 */
export function toggleDetail<F extends string>(
  form: UseFormReturn<EditFields<F>>,
  field: F,
  on: boolean,
  initial: () => unknown,
) {
  form.setValue(`picked.${field}` as Path<EditFields<F>>, on as never);
  form.clearErrors(`values.${field}` as Path<EditFields<F>>);
  if (on && !(field in form.getValues().values))
    form.setValue(`values.${field}` as Path<EditFields<F>>, initial() as never);
}

/**
 * The result of a send: the sent details leave the mode, each refused one keeps its tick with its
 * message, and a refusal no field explains (or a partial send) says so above the buttons.
 */
export function showSendResult<F extends string>(
  form: UseFormReturn<EditFields<F>>,
  sent: F[],
  failed: [F, string][],
  alert: string | null,
) {
  for (const field of sent) form.setValue(`picked.${field}` as Path<EditFields<F>>, false as never);
  for (const [field, message] of failed)
    form.setError(`values.${field}` as Path<EditFields<F>>, { type: 'server', message });
  if (alert) form.setError('root.server', { message: alert });
}
