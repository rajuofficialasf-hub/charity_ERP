import {
  type FieldOption,
  type FieldType,
  type FormDefinition,
  isChoiceType,
} from '@css/shared/forms';
import { Button, Dialog, Form, FormSelectField, FormTextField, SelectField, TextField } from '@/ui';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import { parentCandidates } from './candidates';
import type { OwnQuestion } from './draft';
import { startTable } from './TableSettings';
import { emptyOption, OptionsEditor } from './OptionsEditor';

const NONE = '-';
const filled = (text: { bn: string; en: string }) => text.bn.trim() !== '' && text.en.trim() !== '';

/**
 * Both labels, and for a choice at least one option with its label in both languages; the
 * messages are the dialog's own, given already in the person's words.
 */
function ownQuestionSchema(choice: boolean, needLabels: string, needOption: string) {
  return z
    .object({
      sectionKey: z.string(),
      label: z.object({ bn: z.string(), en: z.string() }),
      options: z.array(z.custom<FieldOption>()),
      dependsOn: z.string(),
      group: z.string(),
    })
    .superRefine((v, ctx) => {
      for (const lang of ['bn', 'en'] as const)
        // eslint-disable-next-line security/detect-object-injection -- one of the two languages
        if (v.label[lang].trim() === '')
          ctx.addIssue({ code: 'custom', path: ['label', lang], message: needLabels });
      if (choice && !(v.options.length > 0 && v.options.every((o) => filled(o.label))))
        ctx.addIssue({ code: 'custom', path: ['options'], message: needOption });
    });
}
type OwnQuestionFields = z.infer<ReturnType<typeof ownQuestionSchema>>;

/**
 * A question of this project's own, of the type chosen in the left pane: its label in both
 * languages, the section it goes to (fixed when it was dropped at a place), and for a choice its
 * options, the option that opens a text box, and the earlier answer the options may follow.
 * Inside a section with a repeat group it may join the group as a row question. The parent opens
 * it afresh each time (a new key), so it always starts empty.
 */
export function OwnQuestionDialog({
  open,
  definition,
  type,
  sectionKey: initialSection,
  placed = false,
  groupKey,
  onClose,
  onAdd,
}: {
  open: boolean;
  definition: FormDefinition;
  type: FieldType;
  sectionKey: string;
  /** The question was dropped at a place, so its section cannot change. */
  placed?: boolean;
  /** The repeat group chosen on the canvas: the question starts as one of its row questions. */
  groupKey?: string;
  onClose: () => void;
  onAdd: (question: OwnQuestion, sectionKey: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const locale = useLocale();
  const choice = isChoiceType(type);
  const needLabels = t('own_need_labels');
  const needOption = t('own_need_option');
  const schema = useMemo(
    () => ownQuestionSchema(choice, needLabels, needOption),
    [choice, needLabels, needOption],
  );
  const form = useForm<OwnQuestionFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      sectionKey: initialSection,
      label: { bn: '', en: '' },
      // a choice starts with one empty option to fill in
      options: choice ? [emptyOption([])] : [],
      dependsOn: NONE,
      group: groupKey ?? NONE,
    },
  });
  const values = useWatch({ control: form.control });
  const sectionKey = values.sectionKey ?? initialSection;
  const section = definition.sections.find((s) => s.key === sectionKey);
  const groups = (section?.fields ?? []).filter((f) => f.type === 'repeat_group');
  const parents = parentCandidates(definition, sectionKey);
  const parent = choice ? parents.find((p) => p.fieldKey === values.dependsOn) : undefined;
  const { errors } = form.formState;
  // the labels are named first, then the options
  const problem = errors.label ? needLabels : errors.options ? needOption : undefined;

  const add = (v: OwnQuestionFields) => {
    const group = v.group === NONE ? null : v.group;
    onAdd(
      {
        type,
        label: { bn: v.label.bn.trim(), en: v.label.en.trim() },
        ...(choice
          ? {
              options: v.options.map((o) => ({
                ...o,
                label: { bn: o.label.bn.trim(), en: o.label.en.trim() },
                dependsOnOptionCode: parent ? (o.dependsOnOptionCode ?? null) : null,
              })),
            }
          : {}),
        ...(parent ? { dependsOn: parent.fieldKey } : {}),
        // a table never sits in a group's rows, and starts with one row and one column
        ...(group && type !== 'repeat_group' && type !== 'number_table' ? { group } : {}),
        ...(type === 'number_table'
          ? { table: startTable(t('table_row', { n: '1' }), t('table_col', { n: '1' })) }
          : {}),
      },
      v.sectionKey,
    );
  };

  return (
    <Dialog
      title={t('own_title')}
      open={open}
      onClose={onClose}
      size="large"
      fullScreenOnPhone
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void form.handleSubmit(add)()}>{t('own_add_confirm')}</Button>
        </>
      }
    >
      <Form form={form} onSubmit={add} label={t('own_title')} error={problem}>
        <TextField label={t('own_type')} value={tt(type)} onChange={() => undefined} readOnly />
        <FormTextField name="label.bn" label={t('label_bn')} required maxLength={500} />
        <FormTextField name="label.en" label={t('label_en')} required lang="en" maxLength={500} />
        {placed ? null : (
          <Controller
            control={form.control}
            name="sectionKey"
            render={({ field }) => (
              <SelectField
                label={t('own_section')}
                required
                value={field.value}
                onChange={(id) => {
                  if (!id || !definition.sections.some((s) => s.key === id)) return;
                  field.onChange(id);
                  // the group and the earlier answer belong to the section
                  form.setValue('group', NONE);
                  form.setValue('dependsOn', NONE);
                }}
                options={definition.sections.map((s) => ({
                  value: s.key,
                  label: s.title[locale],
                }))}
              />
            )}
          />
        )}
        {groups.length > 0 && type !== 'repeat_group' ? (
          <FormSelectField
            name="group"
            label={t('own_group')}
            hint={t('own_group_hint')}
            options={[
              { value: NONE, label: t('own_group_none') },
              ...groups.map((g) => ({ value: g.fieldKey, label: g.label[locale] })),
            ]}
          />
        ) : null}
        {choice && parents.length > 0 ? (
          <FormSelectField
            name="dependsOn"
            label={t('depends_on')}
            hint={t('depends_on_hint')}
            options={[
              { value: NONE, label: t('depends_none') },
              ...parents.map((p) => ({ value: p.fieldKey, label: p.label[locale] })),
            ]}
          />
        ) : null}
        {choice ? (
          <Controller
            control={form.control}
            name="options"
            render={({ field }) => (
              <OptionsEditor
                options={field.value}
                onChange={field.onChange}
                mode="full"
                parent={parent}
              />
            )}
          />
        ) : null}
      </Form>
    </Dialog>
  );
}
