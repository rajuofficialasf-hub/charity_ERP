import { uuidv7 } from '@css/shared';
import { useMemo, useRef } from 'react';
import { type Path, useForm, type UseFormReturn, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
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

/** What a send of the ticked details came to: all of them sent, or none with the reason. */
export type TogetherOutcome<F extends string> =
  { sent: F[]; refused: []; error: null } | { sent: []; refused: [F, string][]; error: unknown };

/**
 * Sends the ticked details in one request, so all of them are asked for or none is: a refusal names
 * the details it is about, each kept ticked with its message.
 */
export async function sendTogether<F extends string>(
  requests: { field: F; newValue?: unknown; note?: string }[],
  post: (requests: { field: F; newValue?: unknown; note?: string }[]) => Promise<unknown>,
): Promise<TogetherOutcome<F>> {
  try {
    await post(requests);
    return { sent: requests.map((r) => r.field), refused: [], error: null };
  } catch (error) {
    const asked = new Set<string>(requests.map((r) => r.field));
    const refused =
      error instanceof ApiFailure
        ? error.details
            .filter((d) => d.path !== undefined && asked.has(d.path))
            .map((d): [F, string] => [d.path as F, d.message])
        : [];
    return { sent: [], refused, error };
  }
}

/**
 * The key of one send: a retry of the same details repeats the same request, so a send the network
 * cut short is never asked for twice; other details get a new key.
 */
export function useSendKey(): (body: unknown) => string {
  const last = useRef<{ body: string; key: string } | null>(null);
  return (body) => {
    const text = JSON.stringify(body);
    if (last.current?.body !== text) last.current = { body: text, key: uuidv7() };
    return last.current.key;
  };
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
