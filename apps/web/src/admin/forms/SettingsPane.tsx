import {
  type FieldSettings,
  type FieldValidation,
  type FormDefinition,
  type FormField,
  type FormSection,
  isChoiceType,
  CORE_FIELD_KEYS,
  identityRoleOf,
  isTextType,
  PATTERN_KEYS,
  validationOf,
} from '@css/shared/forms';
import { Disclosure, Icon, Select, Stack, Switch, Text, TextField } from '@css/ui';
import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import {
  setOptions,
  canMarkIdentity,
  coreLocks,
  hasIdentity,
  setIdentityRole,
  setSectionCondition,
  setSectionVisibility,
  updateField,
} from './draft';
import type { Selection } from './selection';
import { OptionsEditor } from './OptionsEditor';
import { ScoreSettings } from './ScoreSettings';
import { parentCandidates } from './candidates';
import { LimitPair, RepeatSettings } from './RepeatSettings';
import { CalcGroup, ConditionGroup } from './RuleGroups';

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
  identityMarks = false,
  onChange,
}: {
  definition: FormDefinition;
  selected: Selection | null;
  mode: 'full' | 'texts';
  /** Whether questions take identity marks: a beneficiary application form and the library. */
  identityMarks?: boolean;
  onChange: (definition: FormDefinition) => void;
}) {
  const section = definition.sections.find((s) => s.key === selected?.section);
  const field = section?.fields.find((f) => f.fieldKey === selected?.field);
  if (!section) return <StartCard />;
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
      identityMarks={identityMarks}
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
  const core = hasIdentity(section);
  const setTitle = (title: FormSection['title']) =>
    onChange({
      sections: definition.sections.map((s) => (s.key === section.key ? { ...s, title } : s)),
    });
  return (
    <Stack gap={2}>
      <Disclosure title={t('group_basics')} headingLevel={2} defaultOpen>
        <Stack gap={3}>
          <Texts value={section.title} onChange={setTitle} />
          {mode === 'full' ? (
            <Select
              label={t('visibility')}
              value={section.visibility}
              disabled={core}
              helper={core ? t('identity.section') : undefined}
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
          ) : null}
        </Stack>
      </Disclosure>
      {mode === 'full' && !core ? (
        <ConditionGroup
          kind="section"
          definition={definition}
          asker={{ group: null }}
          condition={section.condition}
          onChange={(condition) =>
            onChange(setSectionCondition(definition, section.key, condition ?? null))
          }
          defaultOpen
        />
      ) : null}
    </Stack>
  );
}

function FieldSettingsView({
  definition,
  section,
  field,
  mode,
  identityMarks,
  onChange,
}: {
  definition: FormDefinition;
  section: FormSection;
  field: FormField;
  mode: 'full' | 'texts';
  identityMarks: boolean;
  onChange: (definition: FormDefinition) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const locks = coreLocks(field);
  const role = identityRoleOf(field);
  const markable = canMarkIdentity(section, field);
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
    <Stack gap={2}>
      <Disclosure title={t('group_basics')} headingLevel={2} defaultOpen>
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
          {/* a mark a form of another kind still holds (a copy) shows, so it can be cleared */}
          {(identityMarks && markable) || role ? (
            <Select
              label={t('identity.label')}
              helper={markable ? t('identity.hint') : t('identity.blocked')}
              value={role ?? NONE}
              disabled={!markable}
              onChange={(id) =>
                onChange(
                  setIdentityRole(
                    definition,
                    field.fieldKey,
                    CORE_FIELD_KEYS.find((k) => k === id) ?? null,
                  ),
                )
              }
              options={[
                { id: NONE, label: t('identity.none') },
                ...CORE_FIELD_KEYS.map((k) => ({ id: k, label: t(`identity.roles.${k}`) })),
              ]}
            />
          ) : null}
        </Stack>
      </Disclosure>
      {choice ? (
        <Disclosure title={t('options')} headingLevel={2} defaultOpen>
          <Stack gap={3}>
            {parents.length > 0 ? (
              <Select
                label={t('depends_on')}
                helper={t('depends_on_hint')}
                value={parent?.fieldKey ?? NONE}
                onChange={(id) => {
                  const next = id && id !== NONE ? id : undefined;
                  // options that followed the old question follow nothing until set again
                  patch({
                    options: (field.options ?? []).map((o) => ({
                      ...o,
                      dependsOnOptionCode: null,
                    })),
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
              heading={false}
              options={field.options ?? []}
              mode="full"
              parent={parent}
              onChange={(options) => onChange(setOptions(definition, field.fieldKey, options))}
            />
          </Stack>
        </Disclosure>
      ) : null}
      {isTextType(field.type) ? (
        <Disclosure title={t('group_rules')} hint={t('optional')} headingLevel={2}>
          <Stack gap={3}>
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
          </Stack>
        </Disclosure>
      ) : NUMBER_TYPES.has(field.type) ? (
        <Disclosure title={t('group_rules')} hint={t('optional')} headingLevel={2}>
          <LimitPair
            minLabel={t('min_value')}
            maxLabel={t('max_value')}
            integer={field.type === 'number'}
            min={rules.min}
            max={rules.max}
            orderMessage={t('limits_order')}
            onApply={(min, max) => setValidation({ min, max })}
          />
        </Disclosure>
      ) : null}
      {field.type === 'repeat_group' ? (
        <Disclosure title={t('group_rows')} headingLevel={2} defaultOpen>
          <RepeatSettings
            definition={definition}
            field={field}
            onRows={(min, max) =>
              setSettings({
                repeat: compact({ ...field.settings?.repeat, min_rows: min, max_rows: max }),
              })
            }
          />
        </Disclosure>
      ) : null}
      {/* points inside a group's rows are refused at publish, so a group's question offers none */}
      {group === null ? (
        <ScoreSettings field={field} onChange={(score) => setSettings({ score })} />
      ) : null}
      {field.type === 'calculation' ? (
        <CalcGroup
          definition={definition}
          field={field}
          asker={asker}
          onChange={(calculation) => patch({ calculation })}
        />
      ) : null}
      {locks.condition ? (
        <Text tone="muted">{t('identity.locked')}</Text>
      ) : (
        <>
          <ConditionGroup
            kind="show"
            definition={definition}
            asker={asker}
            condition={field.logic?.show_if}
            onChange={(show_if) => setLogic({ show_if })}
            defaultOpen
          />
          {answers ? (
            <ConditionGroup
              kind="required"
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

/** What to do first, shown while nothing on the canvas is chosen. */
function StartCard() {
  const t = useTranslations('forms.builder');
  return (
    <div className="fb-start">
      <span className="fb-start-icon">
        <Icon icon={Sparkles} />
      </span>
      <Text weight="bold">{t('start_title')}</Text>
      <ol className="fb-start-steps">
        <li>{t('start_1')}</li>
        <li>{t('start_2')}</li>
        <li>{t('start_3')}</li>
      </ol>
    </div>
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
