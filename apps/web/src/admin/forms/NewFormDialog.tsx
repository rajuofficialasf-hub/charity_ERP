import type { FormSource } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Dialog, Form, FormSelectField, FormTextField, RadioGroup, SelectField } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { pickerProjects, PROJECTS_KEY } from '../projects/projects-api';
import { createForm, FORMS_KEY, library, projectForms } from './forms-api';
import { DialogActions } from '../DialogActions';

/** Both names, and the template or the copied form the chosen start needs. */
const NEW_FORM_SCHEMA = z
  .object({
    title: z.object({ bn: z.string(), en: z.string() }),
    kind: z.enum(['template', 'blank', 'copy']),
    templateKey: z.string(),
    copyProject: z.string(),
    copyForm: z.string(),
  })
  .superRefine((v, ctx) => {
    const required = (path: string[]) =>
      ctx.addIssue({ code: 'custom', path, message: 'validation.required' });
    if (!v.title.bn.trim()) required(['title', 'bn']);
    if (!v.title.en.trim()) required(['title', 'en']);
    if (v.kind === 'template' && !v.templateKey) required(['templateKey']);
    if (v.kind === 'copy' && !v.copyProject) required(['copyProject']);
    if (v.kind === 'copy' && !v.copyForm) required(['copyForm']);
  });
type NewFormFields = z.infer<typeof NEW_FORM_SCHEMA>;

/** The starting point the fields name. */
function sourceOf(v: NewFormFields): FormSource {
  if (v.kind === 'template') return { kind: 'template', templateKey: v.templateKey };
  return v.kind === 'copy' ? { kind: 'copy', formId: v.copyForm } : { kind: 'blank' };
}

/**
 * Starts a new form of the project from a library template, from the mandatory core alone, or as
 * a copy of the published form of another project the caller reaches (the server refuses any
 * other). The first form of a project is its default application form.
 */
export function NewFormDialog({
  projectId,
  firstForm,
  open,
  onClose,
  onCreated,
}: {
  projectId: string;
  firstForm: boolean;
  open: boolean;
  onClose: () => void;
  onCreated: (formId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const form = useForm<NewFormFields>({
    resolver: useSchemaResolver(NEW_FORM_SCHEMA),
    defaultValues: {
      title: { bn: '', en: '' },
      kind: 'template',
      templateKey: '',
      copyProject: '',
      copyForm: '',
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const ready = NEW_FORM_SCHEMA.safeParse(values).success;
  const lib = useQuery({ queryKey: [...FORMS_KEY, 'library'], queryFn: library, enabled: open });
  const projects = useQuery({
    queryKey: [...PROJECTS_KEY, 'picker'],
    queryFn: pickerProjects,
    enabled: open && values.kind === 'copy',
  });
  const sourceForms = useQuery({
    queryKey: [...FORMS_KEY, values.copyProject],
    queryFn: () => projectForms(values.copyProject!),
    enabled: open && values.kind === 'copy' && Boolean(values.copyProject),
  });
  const published = (sourceForms.data ?? []).filter((f) => f.publishedVersionId !== null);
  const create = useMutation({
    mutationFn: (v: NewFormFields) =>
      createForm(projectId, {
        // the first form is the project's application form; another gets a key of its own
        key: firstForm ? 'default' : `form_${Date.now().toString(36)}`,
        title: { bn: v.title.bn.trim(), en: v.title.en.trim() },
        source: sourceOf(v),
      }),
    onSuccess: async (made) => {
      await queries.invalidateQueries({ queryKey: [...FORMS_KEY, projectId] });
      onCreated(made.id);
    },
    onError: (failure) => showFailure(form, failure, ts('text'), { firstDetail: true }),
  });
  // the send button's own path: nothing it would refuse, and nothing twice while one is on its way
  const send = (v: NewFormFields) => {
    if (ready && !create.isPending) create.mutate(v);
  };
  return (
    <Dialog
      title={t('new_title')}
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
        label={t('new_title')}
        error={form.formState.errors.root?.server?.message}
      >
        <FormTextField name="title.bn" label={t('name_bn')} required maxLength={200} />
        <FormTextField name="title.en" label={t('name_en')} required maxLength={200} lang="en" />
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <RadioGroup
              label={t('source')}
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'template', label: t('source_template') },
                { value: 'blank', label: t('source_blank') },
                { value: 'copy', label: t('source_copy') },
              ]}
            />
          )}
        />
        {values.kind === 'template' ? (
          <FormSelectField
            name="templateKey"
            label={t('template')}
            required
            options={(lib.data?.templates ?? []).map((tpl) => ({
              value: tpl.key,
              label: localized(tpl.name, locale),
            }))}
          />
        ) : null}
        {values.kind === 'copy' ? (
          <>
            <Controller
              control={form.control}
              name="copyProject"
              render={({ field }) => (
                <SelectField
                  label={t('copy_project')}
                  required
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    // the form chosen belonged to the project before
                    form.setValue('copyForm', '');
                  }}
                  options={(projects.data ?? [])
                    .filter((p) => p.id !== projectId)
                    .map((p) => ({
                      value: p.id,
                      label: `${localized(p.name, locale)} (${p.year})`,
                    }))}
                />
              )}
            />
            {values.copyProject ? (
              <FormSelectField
                name="copyForm"
                label={t('copy_form')}
                required
                hint={sourceForms.isSuccess && published.length === 0 ? t('copy_none') : undefined}
                options={published.map((f) => ({
                  value: f.id,
                  label: localized(f.title, locale),
                }))}
              />
            ) : null}
          </>
        ) : null}
      </Form>
    </Dialog>
  );
}
