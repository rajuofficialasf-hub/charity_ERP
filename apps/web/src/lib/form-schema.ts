import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import type { FieldErrors, FieldValues, Path, Resolver, UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';
import { ApiFailure } from '../api/client';

/** A rule of a schema as the error function sees it: its kind and, for a length, the bound. */
type Rule = { code: string; minimum?: unknown; format?: string };

/** The errors-catalogue key of a rule that names no message of its own, by its kind. */
function ruleKey(rule: Rule): string {
  switch (rule.code) {
    case 'invalid_type':
      return 'validation.required';
    case 'too_small':
      return Number(rule.minimum) <= 1 ? 'validation.required' : 'validation.too_short';
    case 'too_big':
      return 'validation.too_long';
    case 'invalid_format':
      return rule.format === 'email' ? 'validation.email_format' : 'validation.failed';
    default:
      return 'validation.failed';
  }
}

/** Every message of the errors as the person reads it; `ref` holds a DOM node and is left alone. */
function sayAll(node: unknown, say: (message: string) => string): void {
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.message === 'string') record.message = say(record.message);
  for (const [key, child] of Object.entries(record)) if (key !== 'ref') sayAll(child, say);
}

/**
 * The resolver of a form on a zod schema, a request schema of @css/shared where one fits, so the
 * browser refuses what the API would refuse in the API's own words: a rule that names its message
 * names a key of the errors catalogue ("validation.password_too_short"), a rule without one says
 * what the field lacks by its kind (empty, too long), and a message the screen wrote itself stays
 * as it is. The values reach the submit as typed, so the request stays the one the form sends.
 */
export function useSchemaResolver<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
): Resolver<z.input<S>> {
  const t = useTranslations('errors');
  return useMemo(() => {
    type Key = Parameters<typeof t>[0];
    const say = (message: string) => (t.has(message as Key) ? t(message as Key) : message);
    const inner = zodResolver(
      schema,
      { error: (issue) => ruleKey(issue as Rule) },
      { raw: true },
    ) as unknown as Resolver<z.input<S>>;
    return async (values, context, options) => {
      const result = await inner(values, context, options);
      sayAll(result.errors, say);
      return result;
    };
  }, [schema, t]);
}

/**
 * The field messages of a form's errors by their dotted path ("educationDetails.passingYear"), for
 * the inputs that take their messages as one record.
 */
export function flatErrors(errors: FieldErrors): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    // eslint-disable-next-line security/detect-object-injection -- a path of the form's own errors
    if (path && typeof record.message === 'string' && record.message) out[path] = record.message;
    for (const [key, child] of Object.entries(record))
      if (!['ref', 'message', 'type', 'types'].includes(key))
        walk(child, path ? `${path}.${key}` : key);
  };
  walk(errors, '');
  return out;
}

/**
 * Whether a dotted path ("educationDetails.passingYear") names one field the form holds. A group of
 * fields ("title" of `title.bn` and `title.en`) is no field: nothing on screen shows its message.
 */
function holds(values: unknown, path: string): boolean {
  let node = values;
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) return false;
    // eslint-disable-next-line security/detect-object-injection -- an own key, checked just above
    node = (node as Record<string, unknown>)[key];
  }
  const group =
    Array.isArray(node) ||
    (node !== null && typeof node === 'object' && Object.getPrototypeOf(node) === Object.prototype);
  return !group;
}

/** How a refused request's details map onto the form. */
type DetailOptions = {
  /** The request carried the form's values under this key (`value` of a setting), so a detail's path starts with it. */
  under?: string;
};

/** A detail's path inside the form, or none when it points outside the form's values. */
function formPath(path: string | undefined, under: string | undefined): string | undefined {
  if (!path || !under) return path;
  return path.startsWith(`${under}.`) ? path.slice(under.length + 1) : undefined;
}

/** Puts each detail of a refused request that names a field of the form under that field. */
function placeDetails<T extends FieldValues>(
  form: UseFormReturn<T>,
  failure: ApiFailure,
  { under }: DetailOptions = {},
) {
  const values = form.getValues();
  const left: string[] = [];
  for (const detail of failure.details) {
    const path = formPath(detail.path, under);
    if (path && holds(values, path))
      form.setError(path as Path<T>, { type: 'server', message: detail.message });
    else left.push(detail.message);
  }
  return { placed: failure.details.length - left.length, left };
}

/**
 * Puts each field message of a refused request under its field. True when at least one message
 * found a field of this form, so the screen shows no second message above them; a refusal that
 * names no field of the form leaves its message to the caller.
 */
export function showFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  failure: unknown,
): boolean {
  return failure instanceof ApiFailure && placeDetails(form, failure).placed > 0;
}

/**
 * Shows a refused request on the form: its field messages under their fields, else the API's
 * message above the button, or `offline` when no answer came. With `everyDetail`, the API's
 * message also shows above when one of the details names no field of the form, beside the ones
 * placed, so no part of the refusal goes unsaid. With `firstDetail`, the message above is the
 * first detail that names no field of the form, where there is one, in place of the API's
 * general one.
 */
export function showFailure<T extends FieldValues>(
  form: UseFormReturn<T>,
  failure: unknown,
  offline: string,
  {
    everyDetail = false,
    firstDetail = false,
    ...options
  }: DetailOptions & { everyDetail?: boolean; firstDetail?: boolean } = {},
): void {
  let message = offline;
  if (failure instanceof ApiFailure) {
    const { placed, left } = placeDetails(form, failure, options);
    if (placed > 0 && !(everyDetail && left.length > 0)) return;
    message = (firstDetail ? left[0] : undefined) ?? failure.message;
  }
  form.setError('root.server' as Path<T>, { message });
}
