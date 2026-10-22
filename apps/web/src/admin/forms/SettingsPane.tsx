import type { Condition } from '@css/shared';
import {
  type FieldSettings,
  type FieldValidation,
  type FormDefinition,
  type FormField,
  type FormSection,
  isChoiceType,
  isCoreFieldKey,
  isTextType,
  PATTERN_KEYS,
  validationOf,
} from '@css/shared/forms';
import { Select, Stack, Switch, Text, TextField } from '@css/ui';
import { useLocale, useTranslations } from 'use-intl';
import { CalculationEditor } from './CalculationEditor';
import { ConditionEditor } from './ConditionEditor';
import {
  setOptions,
  coreLocks,
  setSectionCondition,
  setSectionVisibility,
  updateField,
} from './draft';
import type { Selection } from './selection';
import { OptionsEditor } from './OptionsEditor';
import { parentCandidates } from './candidates';
import { LimitPair, RepeatSettings } from './RepeatSettings';

const NONE = '-';
const NUMBER_TYPES = new Set(['number', 'decimal', 'money']);

/** Drops the keys a change left empty, so the draft holds no `undefined` and no empty object. */
function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * The settings of the chosen section or question. On a phone only the texts change (labels and
 * option texts in both languages); on a computer every setting does: the help text, required,
 * the named check of a text, the limits, the options and their branching, a repeat group's rows,
 * the conditions, the calculation, and a section's visibility, condition and own questions.
 */
export function SettingsPane({
  definition,
  selected,
  mode,
  onChange,
}: {
  definition: FormDefinition;
  selected: Selection | null;
  mode: 'full' | 'texts';
  onChange: (definition: FormDefinition) => void;
}) {
  const t = useTranslations('forms.builder');
  const section = definition.sections.find((s) => s.key === selected?.section);
  const field = section?.fields.find((f) => f.fieldKey === selected?.field);
  if (!section) return <Text tone="muted">{t('pick_hint')}</Text>;
  if (!field)
    return (
      <SectionSettings
        key={section.key}
        definition={definition}
        section={section}
        mode={mode}
        onChange={onChange}
      />
    );
  return (
    <FieldSettingsView
      key={field.fieldKey}
      definition={definition}
      section={section}
      field={field}
      mode={mode}
      onChange={onChange}
    />
  );
}

function SectionSettings({
  definition,
  section,
  mode,
  onChange,
}: {
  definition: FormDefinition;
  section: FormSection;
  mode: 'full' | 'texts';
  onChange: (definition: FormDefinition) => void;
}) {
  const t = useTranslations('forms.builder');
  const core = section.fields.some((f) => isCoreFieldKey(f.fieldKey));
  const setTitle = (title: FormSection['title']) =>
    onChange({
      sections: definition.sections.map((s) => (s.key === section.key ? { ...s, title } : s)),
    });
  return (
    <Stack gap={3}>
      <Texts value={section.title} onChange={setTitle} />
      {mode === 'full' ? (
        <>
          <Select
            label={t('visibility')}
            value={section.visibility}
            disabled={core}
            helper={core ? t('core_section') : undefined}
            onChange={(id) =>
              id === 'volunteer' || id === 'official_only'
                ? onChange(setSectionVisibility(definition, section.key, id))
                : undefined
            }
            options={[
              { id: 'volunteer', label: t('visibility_volunteer') },
              { id: 'official_only', label: t('visibility_official') },
            ]}
          />
          {core ? null : (
            <ConditionEditor
              title={t('section_condition')}
              definition={definition}
              asker={{ group: null }}
              condition={section.condition}
              onChange={(condition: Condition | undefined) =>
                onChange(setSectionCondition(definition, section.key, condition ?? null))
              }
            />
          )}
        </>
      ) : null}
    </Stack>
  );
}

function FieldSettingsView({
  definition,
  section,
  field,
  mode,
  onChange,
}: {
  definition: FormDefinition;
  section: FormSection;
  field: FormField;
  mode: 'full' | 'texts';
  onChange: (definition: FormDefinition) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const locks = coreLocks(field);
  const group = field.settings?.repeat?.group ?? null;
  const asker = { fieldKey: field.fieldKey, group };
  const patch = (next: Partial<FormField>) =>
    onChange(updateField(definition, field.fieldKey, next));
  const setSettings = (next: Partial<FieldSettings>) =>
    patch({ settings: compact({ ...field.settings, ...next }) ?? {} });
  const setValidation = (next: Partial<FieldValidation>) =>
    setSettings({ validation: compact({ ...field.settings?.validation, ...next }) });
  const setLogic = (next: Partial<NonNullable<FormField['logic']>>) =>
    patch({ logic: compact({ ...field.logic, ...next }) });
  const rules = validationOf(field);
  const choice = isChoiceType(field.type);
  const parents = choice ? parentCandidates(definition, section.key, field.fieldKey) : [];
  const parent = parents.find((p) => p.fieldKey === field.logic?.options_depend_on) ?? null;
  const answers = field.type !== 'note' && field.type !== 'calculation';

  if (mode === 'texts')
    return (
      <Stack gap={2}>
        <Texts value={field.label} onChange={(label) => patch({ label })} />
        {choice ? (
          <OptionsEditor
            options={field.options ?? []}
            mode="texts"
            onChange={(options) => onChange(setOptions(definition, field.fieldKey, options))}
          />
        ) : null}
      </Stack>
    );

  return (
    <Stack gap={3}>
      <Texts value={field.label} onChange={(label) => patch({ label })} />
      <TextField
        label={t('help_bn')}
        helper={t('help_hint')}
        value={field.settings?.help?.bn ?? ''}
        onChange={(bn) => setSettings({ help: helpOf(bn, field.settings?.help?.en ?? '') })}
      />
      <TextField
        label={t('help_en')}
        lang="en"
        value={field.settings?.help?.en ?? ''}
        onChange={(en) => setSettings({ help: helpOf(field.settings?.help?.bn ?? '', en) })}
      />
      {answers ? (
        <Switch
          isSelected={field.required}
          isDisabled={locks.optional}
          onChange={(required) => patch({ required })}
        >
          {t('required')}
        </Switch>
      ) : null}
      {isTextType(field.type) ? (
        <>
          <Select
            label={t('pattern')}
            value={rules.pattern ?? NONE}
            onChange={(id) =>
              setValidation({ pattern: PATTERN_KEYS.find((k) => k === id) ?? undefined })
            }
            options={[
              { id: NONE, label: t('pattern_none') },
              ...PATTERN_KEYS.map((k) => ({ id: k, label: t(`patterns.${k}`) })),
            ]}
          />
          <LimitPair
            minLabel={t('min_length')}
            maxLabel={t('max_length')}
            integer
            min={rules.min_length}
            max={rules.max_length}
            orderMessage={t('limits_order')}
            onApply={(min, max) => setValidation({ min_length: min, max_length: max })}
          />
        </>
      ) : null}
      {NUMBER_TYPES.has(field.type) ? (
        <LimitPair
          minLabel={t('min_value')}
          maxLabel={t('max_value')}
          integer={field.type === 'number'}
          min={rules.min}
          max={rules.max}
          orderMessage={t('limits_order')}
          onApply={(min, max) => setValidation({ min, max })}
        />
      ) : null}
      {choice ? (
        <>
          {parents.length > 0 ? (
            <Select
              label={t('depends_on')}
              helper={t('depends_on_hint')}
              value={parent?.fieldKey ?? NONE}
              onChange={(id) => {
                const next = id && id !== NONE ? id : undefined;
                // options that followed the old question follow nothing until set again
                patch({
                  options: (field.options ?? []).map((o) => ({ ...o, dependsOnOptionCode: null })),
                  logic: compact({ ...field.logic, options_depend_on: next }),
                });
              }}
              options={[
                { id: NONE, label: t('depends_none') },
                ...parents.map((p) => ({ id: p.fieldKey, label: p.label[locale] })),
              ]}
            />
          ) : null}
          <OptionsEditor
            options={field.options ?? []}
            mode="full"
            parent={parent}
            onChange={(options) => onChange(setOptions(definition, field.fieldKey, options))}
          />
        </>
      ) : null}
      {field.type === 'repeat_group' ? (
        <RepeatSettings
          definition={definition}
          field={field}
          onRows={(min, max) =>
            setSettings({
              repeat: compact({ ...field.settings?.repeat, min_rows: min, max_rows: max }),
            })
          }
        />
      ) : null}
      {field.type === 'calculation' ? (
        <CalculationEditor
          definition={definition}
          field={field}
          asker={asker}
          onChange={(calculation) => patch({ calculation })}
        />
      ) : null}
      {locks.condition ? (
        <Text tone="muted">{t('core')}</Text>
      ) : (
        <>
          <ConditionEditor
            title={t('show_if')}
            definition={definition}
            asker={asker}
            condition={field.logic?.show_if}
            onChange={(show_if) => setLogic({ show_if })}
          />
          {answers ? (
            <ConditionEditor
              title={t('required_if')}
              definition={definition}
              asker={asker}
              condition={field.logic?.required_if}
              onChange={(required_if) => setLogic({ required_if })}
            />
          ) : null}
        </>
      )}
    </Stack>
  );
}

/** A help text is kept in both languages or not at all; one language alone waits for the other. */
function helpOf(bn: string, en: string): FieldSettings['help'] {
  return bn === '' && en === '' ? undefined : { bn, en };
}

/** A text in both languages, each required. */
function Texts({
  value,
  onChange,
}: {
  value: { bn: string; en: string };
  onChange: (value: { bn: string; en: string }) => void;
}) {
  const t = useTranslations('forms.builder');
  return (
    <>
      <TextField
        label={t('label_bn')}
        required
        value={value.bn}
        onChange={(bn) => onChange({ ...value, bn })}
      />
      <TextField
        label={t('label_en')}
        required
        lang="en"
        value={value.en}
        onChange={(en) => onChange({ ...value, en })}
      />
    </>
  );
}
