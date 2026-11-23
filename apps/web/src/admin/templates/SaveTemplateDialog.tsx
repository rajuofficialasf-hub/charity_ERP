import { type Locale, localized } from '@css/shared/i18n';
import { Dialog, Form, FormSelectField, FormTextField, RadioGroup } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { saveAsTemplate, type Template, templates, TEMPLATES_KEY } from './templates-api';
import { DialogActions } from '../DialogActions';

/** A new template names itself in both languages; a replaced one is chosen from the library. */
const SAVE_SCHEMA = z
  .object({
    mode: z.enum(['new', 'replace']),
    name: z.object({ bn: z.string(), en: z.string() }),
    description: z.string(),
    templateId: z.string(),
  })
  .superRefine((v, ctx) => {
    const required = (path: string[]) =>
      ctx.addIssue({ code: 'custom', path, message: 'validation.required' });
    if (v.mode === 'replace' && !v.templateId) required(['templateId']);
    if (v.mode === 'new' && !v.name.bn.trim()) required(['name', 'bn']);
    if (v.mode === 'new' && !v.name.en.trim()) required(['name', 'en']);
  });
type SaveFields = z.infer<typeof SAVE_SCHEMA>;

/**
 * Saves a project's setup as a template: a new template with its name, or in place of an
 * existing one, which keeps its name and gets this project's components, settings, syllabus and
 * rules. Projects made from the template before stay as they are.
 */
export function SaveTemplateDialog({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: (template: Template) => void;
}) {
  const t = useTranslations('admin.templates.save');
  const td = useTranslations('admin.templates.dialog');
  const tw = useTranslations('admin.projects.workflow');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const form = useForm<SaveFields>({
    resolver: useSchemaResolver(SAVE_SCHEMA),
    defaultValues: { mode: 'new', name: { bn: '', en: '' }, description: '', templateId: '' },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const ready = SAVE_SCHEMA.safeParse(values).success;
  const pending = form.formState.isSubmitting;
  const library = useQuery({
    queryKey: [...TEMPLATES_KEY, true],
    queryFn: () => templates(true),
    enabled: values.mode === 'replace',
  });

  const save = async ({ mode, name, description, templateId }: SaveFields) => {
    let template: Template;
    try {
      template = await saveAsTemplate(
        projectId,
        mode === 'replace'
          ? { templateId }
          : {
              name: { bn: name.bn.trim(), en: name.en.trim() },
              ...(description.trim() ? { description: description.trim() } : {}),
            },
      );
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    onDone(template);
  };

  return (
    <Dialog
      title={t('title')}
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={onClose}
          submitLabel={t('submit')}
          onSubmit={() => void form.handleSubmit(save)()}
          pending={pending}
          disabled={!ready}
        />
      }
    >
      <Form
        form={form}
        onSubmit={save}
        label={t('title')}
        error={form.formState.errors.root?.server?.message}
      >
        <Controller
          control={form.control}
          name="mode"
          render={({ field }) => (
            <RadioGroup
              label={t('mode')}
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'new', label: t('mode_new') },
                { value: 'replace', label: t('mode_replace') },
              ]}
            />
          )}
        />
        {values.mode === 'new' ? (
          <>
            <FormTextField name="name.bn" label={td('name_bn')} required maxLength={200} />
            <FormTextField
              name="name.en"
              label={td('name_en')}
              required
              maxLength={200}
              lang="en"
            />
            <FormTextField name="description" label={td('description')} maxLength={2000} rows={3} />
          </>
        ) : (
          <FormSelectField
            name="templateId"
            label={t('template')}
            hint={t('replace_hint')}
            required
            disabled={!library.data}
            options={(library.data ?? []).map((tpl) => ({
              value: tpl.id,
              label: `${localized(tpl.name, locale)} (${tw(tpl.workflowKey)})`,
            }))}
          />
        )}
      </Form>
    </Dialog>
  );
}
