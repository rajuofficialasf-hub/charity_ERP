import type { ReadyFormCreate } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Dialog, Form, FormSelectField, FormTextField, RadioGroup } from '@/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { createReadyForm, READY_KEY, type ReadyFormView } from './forms-api';
import { DialogActions } from '../DialogActions';

/** Both names, and the ready form a copy starts from. */
const READY_FORM_SCHEMA = z
  .object({
    title: z.object({ bn: z.string(), en: z.string() }),
    kind: z.enum(['beneficiary_application', 'other']),
    start: z.enum(['blank', 'copy']),
    copyFrom: z.string(),
  })
  .superRefine((v, ctx) => {
    const required = (path: string[]) =>
      ctx.addIssue({ code: 'custom', path, message: 'validation.required' });
    if (!v.title.bn.trim()) required(['title', 'bn']);
    if (!v.title.en.trim()) required(['title', 'en']);
    if (v.start === 'copy' && !v.copyFrom) required(['copyFrom']);
  });
type ReadyFormFields = z.infer<typeof READY_FORM_SCHEMA>;

/** A key for a new ready form from its English name: small letters, digits and underscores. */
export function readyKeyOf(nameEn: string, stamp: string): string {
  const base = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 30);
  return `${base || 'form'}_${stamp}`.slice(0, 40);
}

/**
 * Starts a ready form outside the projects: its name in both languages, what it is for, and an
 * empty start (one section) or a copy of another ready form's published version.
 */
export function NewReadyFormDialog({
  forms,
  open,
  onClose,
  onCreated,
}: {
  /** The ready forms already there, for the copy. */
  forms: readonly ReadyFormView[];
  open: boolean;
  onClose: () => void;
  onCreated: (formId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tr = useTranslations('forms.ready');
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const form = useForm<ReadyFormFields>({
    resolver: useSchemaResolver(READY_FORM_SCHEMA),
    defaultValues: {
      title: { bn: '', en: '' },
      kind: 'beneficiary_application',
      start: 'blank',
      copyFrom: '',
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const ready = READY_FORM_SCHEMA.safeParse(values).success;
  const published = forms.filter((f) => f.publishedVersionId !== null);
  const create = useMutation({
    mutationFn: (v: ReadyFormFields) => {
      const source: ReadyFormCreate['source'] =
        v.start === 'copy' ? { kind: 'copy', formId: v.copyFrom } : { kind: 'blank' };
      return createReadyForm({
        key: readyKeyOf(v.title.en, Date.now().toString(36)),
        title: { bn: v.title.bn.trim(), en: v.title.en.trim() },
        kind: v.kind,
        source,
      });
    },
    onSuccess: async (made) => {
      await queries.invalidateQueries({ queryKey: READY_KEY });
      onCreated(made.id);
    },
    onError: (failure) => showFailure(form, failure, ts('text'), { firstDetail: true }),
  });
  // the send button's own path: nothing it would refuse, and nothing twice while one is on its way
  const send = (v: ReadyFormFields) => {
    if (ready && !create.isPending) create.mutate(v);
  };
  return (
    <Dialog
      title={tr('new')}
      open={open}
      onClose={onClose}
      dismissible={!create.isPending}
      actions={
        <DialogActions
          cancelLabel={t('cancel')}
          onCancel={onClose}
          submitLabel={t('create')}
          onSubmit={() => void form.handleSubmit(send)()}
          pending={create.isPending}
          disabled={!ready}
        />
      }
    >
      <Form
        form={form}
        onSubmit={send}
        label={tr('new')}
        error={form.formState.errors.root?.server?.message}
      >
        <FormTextField name="title.bn" label={t('name_bn')} required maxLength={200} />
        <FormTextField name="title.en" label={t('name_en')} required maxLength={200} lang="en" />
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <RadioGroup
              label={tr('kind')}
              hint={tr('kind_hint')}
              value={field.value}
              onChange={(id) =>
                field.onChange(id === 'other' ? 'other' : 'beneficiary_application')
              }
              options={[
                { value: 'beneficiary_application', label: t('kind.beneficiary_application') },
                { value: 'other', label: t('kind.other') },
              ]}
            />
          )}
        />
        <Controller
          control={form.control}
          name="start"
          render={({ field }) => (
            <RadioGroup
              label={tr('start')}
              value={field.value}
              onChange={(id) => field.onChange(id === 'copy' ? 'copy' : 'blank')}
              options={[
                { value: 'blank', label: tr('start_blank') },
                { value: 'copy', label: tr('start_copy') },
              ]}
            />
          )}
        />
        {values.start === 'copy' ? (
          <FormSelectField
            name="copyFrom"
            label={tr('copy_from')}
            required
            hint={published.length === 0 ? tr('copy_none') : undefined}
            options={published.map((f) => ({ value: f.id, label: localized(f.title, locale) }))}
          />
        ) : null}
      </Form>
    </Dialog>
  );
}
