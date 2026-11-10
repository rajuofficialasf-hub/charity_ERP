import { passwordChangeRequestSchema } from '@css/shared/auth';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiFailure } from '../api/client';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { flatErrors, showFailure, useSchemaResolver } from './form-schema';
import { createQueryClient } from './query-client';

const inEnglish = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    <LocaleProvider initial="en">{children}</LocaleProvider>
  </QueryClientProvider>
);

const resolveWith = async <S extends z.ZodType<Record<string, unknown>, Record<string, unknown>>>(
  schema: S,
  values: Record<string, unknown>,
) => {
  const { result } = renderHook(() => useSchemaResolver(schema), { wrapper: inEnglish });
  return result.current(values as z.input<S>, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
};

describe('useSchemaResolver', () => {
  it("says a rule's own catalogue key in the API's words and an empty field by its kind", async () => {
    const { errors } = await resolveWith(passwordChangeRequestSchema, {
      currentPassword: '',
      newPassword: 'a1',
    });
    expect(errors.currentPassword?.message).toBe('Fill in this field.');
    expect(errors.newPassword?.message).toBe('The password is too short.');
  });

  it('keeps a message the screen wrote itself and passes valid values through as typed', async () => {
    const schema = z
      .object({ a: z.string(), b: z.string() })
      .refine((v) => v.a === v.b, { path: ['b'], message: 'The two do not match.' });
    const refused = await resolveWith(schema, { a: 'x', b: 'y' });
    expect(refused.errors.b?.message).toBe('The two do not match.');
    const accepted = await resolveWith(schema, { a: ' x', b: ' x' });
    expect(accepted.errors).toEqual({});
    expect(accepted.values).toEqual({ a: ' x', b: ' x' });
  });
});

describe('flatErrors', () => {
  it('gives each nested message by its dotted path and leaves the rest out', () => {
    expect(
      flatErrors({
        name: { type: 'server', message: 'Too long.' },
        educationDetails: { passingYear: { type: 'server', message: 'Not a year.' } },
        empty: { type: 'server', message: '' },
      }),
    ).toEqual({ name: 'Too long.', 'educationDetails.passingYear': 'Not a year.' });
  });
});

describe('showFailure', () => {
  const useTwoFields = () => {
    const form = useForm<{ code: string; address: { village: string } }>({
      defaultValues: { code: '', address: { village: '' } },
    });
    // the form state is a proxy: reading the errors once subscribes the hook to them, as a screen does
    void form.formState.errors;
    return form;
  };

  it('shows a message about a group of fields above the button, where it can be read', () => {
    const { result } = renderHook(useTwoFields);
    const failure = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'address', code: 'validation.failed', message: 'Not a place.' },
    ]);
    act(() => showFailure(result.current, failure, 'Offline.'));
    expect(result.current.formState.errors.root?.server?.message).toBe(
      'Some information is not valid.',
    );
  });

  it('puts a field message under its field and shows nothing above the button', () => {
    const { result } = renderHook(useTwoFields);
    const failure = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'address.village', code: 'validation.too_long', message: 'Too long.' },
    ]);
    act(() => showFailure(result.current, failure, 'Offline.'));
    expect(result.current.getFieldState('address.village').error?.message).toBe('Too long.');
    expect(result.current.formState.errors.root).toBeUndefined();
  });

  it("shows the API's message above the button when no detail names a field of this form", () => {
    const { result } = renderHook(useTwoFields);
    const failure = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'loginId', code: 'validation.failed', message: 'Unknown.' },
      { path: '', code: 'validation.failed', message: 'Whole request.' },
    ]);
    act(() => showFailure(result.current, failure, 'Offline.'));
    expect(result.current.formState.errors.root?.server?.message).toBe(
      'Some information is not valid.',
    );
  });

  it('also shows the message above, when asked, for a detail that names no field of this form', () => {
    const { result } = renderHook(useTwoFields);
    const failure = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'code', code: 'validation.too_long', message: 'Too long.' },
      { path: 'userId', code: 'validation.required', message: 'Fill in this field.' },
    ]);
    act(() => showFailure(result.current, failure, 'Offline.', { everyDetail: true }));
    expect(result.current.getFieldState('code').error?.message).toBe('Too long.');
    expect(result.current.formState.errors.root?.server?.message).toBe(
      'Some information is not valid.',
    );
    act(() => result.current.clearErrors());
    const placed = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'code', code: 'validation.too_long', message: 'Too long.' },
    ]);
    act(() => showFailure(result.current, placed, 'Offline.', { everyDetail: true }));
    expect(result.current.formState.errors.root).toBeUndefined();
  });

  it('shows, when asked, the first detail that names no field above the button', () => {
    const { result } = renderHook(useTwoFields);
    const failure = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'source.templateKey', code: 'validation.failed', message: 'Unknown template.' },
      { path: 'key', code: 'validation.failed', message: 'Bad key.' },
    ]);
    act(() => showFailure(result.current, failure, 'Offline.', { firstDetail: true }));
    expect(result.current.formState.errors.root?.server?.message).toBe('Unknown template.');
    act(() => result.current.clearErrors());
    const bare = new ApiFailure(409, 'form.key_taken', 'Taken.', []);
    act(() => showFailure(result.current, bare, 'Offline.', { firstDetail: true }));
    expect(result.current.formState.errors.root?.server?.message).toBe('Taken.');
  });

  it('reads the paths of a request that carried the values under a key', () => {
    const { result } = renderHook(useTwoFields);
    const failure = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'value.address.village', code: 'validation.too_long', message: 'Too long.' },
    ]);
    act(() => showFailure(result.current, failure, 'Offline.', { under: 'value' }));
    expect(result.current.getFieldState('address.village').error?.message).toBe('Too long.');
    expect(result.current.formState.errors.root).toBeUndefined();
    act(() => result.current.clearErrors());
    // a path outside the key is no field of the form
    const outside = new ApiFailure(422, 'validation.failed', 'Some information is not valid.', [
      { path: 'code', code: 'validation.too_long', message: 'Too long.' },
    ]);
    act(() => showFailure(result.current, outside, 'Offline.', { under: 'value' }));
    expect(result.current.getFieldState('code').error).toBeUndefined();
    expect(result.current.formState.errors.root?.server?.message).toBe(
      'Some information is not valid.',
    );
  });

  it('says the device is offline when no answer came', () => {
    const { result } = renderHook(useTwoFields);
    act(() => showFailure(result.current, new TypeError('fetch failed'), 'Offline.'));
    expect(result.current.formState.errors.root?.server?.message).toBe('Offline.');
  });
});
