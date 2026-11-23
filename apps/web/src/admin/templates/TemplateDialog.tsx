import { Dialog, Form, FormTextField, Switch } from '@/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { type Template, updateTemplate } from './templates-api';
import { DialogActions } from '../DialogActions';

/** A template keeps a name in both languages. */
const TEMPLATE_SCHEMA = z.object({
  name: z.object({ bn: z.string().trim().min(1), en: z.string().trim().min(1) }),
  description: z.string(),
  active: z.boolean(),
});
type TemplateFields = z.infer<typeof TEMPLATE_SCHEMA>;

/**
 * Renames, describes, deactivates or activates a template. Its contents change only by saving a
 * project onto it; a template is never deleted.
 */
export function TemplateDialog({
  template,
  onClose,
  onDone,
}: {
  template: Template;
  onClose: () => void;
  onDone: (template: Template) => void;
}) {
  const t = useTranslations('admin.templates.dialog');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<TemplateFields>({
    resolver: useSchemaResolver(TEMPLATE_SCHEMA),
    defaultValues: {
      name: { bn: template.name.bn, en: template.name.en },
      description: template.description ?? '',
      active: template.active,
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;

  const save = async (v: TemplateFields) => {
    const name = { bn: v.name.bn.trim(), en: v.name.en.trim() };
    const renamed = name.bn !== template.name.bn || name.en !== template.name.en;
    const described = v.description.trim() !== (template.description ?? '');
    let saved: Template;
    try {
      saved = await updateTemplate(template.id, {
        ...(renamed ? { name } : {}),
        ...(described ? { description: v.description.trim() || null } : {}),
        ...(v.active !== template.active ? { active: v.active } : {}),
      });
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone(saved);
  };
  const changed =
    values.name?.bn?.trim() !== template.name.bn ||
    values.name?.en?.trim() !== template.name.en ||
    values.description?.trim() !== (template.description ?? '') ||
    values.active !== template.active;
  const ready = TEMPLATE_SCHEMA.safeParse(values).success && changed;

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
          submitLabel={tc('save')}
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
        <FormTextField name="name.bn" label={t('name_bn')} required maxLength={200} />
        <FormTextField name="name.en" label={t('name_en')} required maxLength={200} lang="en" />
        <FormTextField name="description" label={t('description')} maxLength={2000} rows={3} />
        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <Switch label={t('active')} checked={field.value} onChange={field.onChange} />
          )}
        />
      </Form>
    </Dialog>
  );
}
