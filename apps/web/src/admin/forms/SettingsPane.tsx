import {
  COUNTED_ROWS_MAX,
  type FieldSettings,
  type FieldValidation,
  type FormDefinition,
  type FormField,
  type FormSection,
  isChoiceType,
  CORE_FIELD_KEYS,
  identityRoleOf,
  isTextType,
  listOfField,
  PATTERN_KEYS,
  validationOf,
} from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Disclosure, Icon, SelectField, Stack, Switch, Text, TextField } from '@/ui';
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
import { TYPED, type Typed } from './use-draft-history';
import { OptionsEditor } from './OptionsEditor';
import { ScoreSettings } from './ScoreSettings';
import { parentCandidates } from './candidates';
import { LimitPair, RepeatSettings } from './RepeatSettings';
import { DefaultSettings, takesDefault } from './DefaultSettings';
import { TableSettings } from './TableSettings';
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
  /** `how` says the change was typed, so the history joins it to the typing just before it. */
  onChange: (definition: FormDefinition, how?: Typed) => void;
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
  onChange: (definition: FormDefinition, how?: Typed) => void;
}) {
  const t = useTranslations('forms.builder');
  const core = hasIdentity(section);
  const setTitle = (title: FormSection['title']) =>
    onChange(
      {
        sections: definition.sections.map((s) => (s.key === section.key ? { ...s, title } : s)),
      },
      TYPED,
    );
  return (
    <Stack gap={2}>
      <Disclosure title={t('group_basics')} headingLevel={2} defaultOpen>
        <Stack gap={3}>
          <Texts value={section.title} onChange={setTitle} />
          {mode === 'full' ? (
            <SelectField
              label={t('visibility')}
              value={section.visibility}
              disabled={core}
              hint={core ? t('identity.section') : undefined}
              onChange={(id) =>
                id === 'volunteer' || id === 'official_only'
                  ? onChange(setSectionVisibility(definition, section.key, id))
                  : undefined
              }
              options={[
                { value: 'volunteer', label: t('visibility_volunteer') },
                { value: 'official_only', label: t('visibility_official') },
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
          onChange={(condition, how) =>
            onChange(setSectionCondition(definition, section.key, condition ?? null), how)
          }
          defaultOpen
        />
      ) : null}
    </Stack>
  );
}

/** The earlier whole-number questions outside any group a group's rows may follow. */
function countCandidates(definition: FormDefinition, groupKey: string): FormField[] {
  const all = definition.sections.flatMap((s) => s.fields);
  const at = all.findIndex((f) => f.fieldKey === groupKey);
  return all.filter(
    (f, i) => i < at && f.type === 'number' && f.settings?.repeat?.group === undefined,
  );
}

/**
 * The definition with the count question of a group set to a range its rows can hold: from 0 to
 * the group's maximum rows (50 at most), keeping a range already set within it.
 */
function withCountRange(definition: FormDefinition, group: FormField): FormDefinition {
  const key = group.settings?.repeat?.count_from;
  const source = key
    ? definition.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === key)
    : undefined;
  if (!source) return definition;
  const rowsMax = Math.min(group.settings?.repeat?.max_rows ?? COUNTED_ROWS_MAX, COUNTED_ROWS_MAX);
  const rules = source.settings?.validation ?? {};
  const max = rules.max !== undefined && rules.max <= rowsMax ? rules.max : rowsMax;
  const min = rules.min !== undefined && rules.min >= 0 && rules.min <= max ? rules.min : 0;
  return updateField(definition, source.fieldKey, {
    settings: compact({ ...source.settings, validation: compact({ ...rules, min, max }) }) ?? {},
  });
}

/** The earlier answers with a text of their own a question may repeat: plain or of its own rows. */
function pipeCandidates(definition: FormDefinition, field: FormField): FormField[] {
  const all = definition.sections.flatMap((s) => s.fields);
  const at = all.findIndex((f) => f.fieldKey === field.fieldKey);
  const group = field.settings?.repeat?.group;
  const piped = new Set<FormField['type']>([
    'short_text',
    'long_text',
    'number',
    'decimal',
    'money',
    'date',
    'single_select',
    'radio',
    'multi_select',
    'checkbox',
    'calculation',
  ]);
  return all.filter((f, i) => {
    const inGroup = f.settings?.repeat?.group;
    return i < at && piped.has(f.type) && (inGroup === undefined || inGroup === group);
  });
}

/**
 * The options of a question that fills a coded column: its reference list's, shown but never
 * edited here, since the database keeps the answer against that list.
 */
function ListOptions({ field }: { field: FormField }) {
  const t = useTranslations('forms.builder');
  const locale = useLocale() as Locale;
  return (
    <Stack gap={1}>
      <Text tone="muted">{t('options_from_list')}</Text>
      {field.options?.length ? (
        <Text>{field.options.map((o) => localized(o.label, locale)).join(', ')}</Text>
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
  onChange: (definition: FormDefinition, how?: Typed) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const locks = coreLocks(field);
  const role = identityRoleOf(field);
  const markable = canMarkIdentity(section, field);
  const group = field.settings?.repeat?.group ?? null;
  const asker = { fieldKey: field.fieldKey, group };
  const patch = (next: Partial<FormField>, how?: Typed) =>
    onChange(updateField(definition, field.fieldKey, next), how);
  const setSettings = (next: Partial<FieldSettings>, how?: Typed) =>
    patch({ settings: compact({ ...field.settings, ...next }) ?? {} }, how);
  // a group's rows and their count source change together: the count question keeps a range
  // the rows can hold
  const setRepeat = (next: Partial<NonNullable<FieldSettings['repeat']>>, how?: Typed) => {
    const settings = compact({
      ...field.settings,
      repeat: compact({ ...field.settings?.repeat, ...next }),
    });
    const updated = { ...field, settings: settings ?? {} };
    onChange(
      withCountRange(
        updateField(definition, field.fieldKey, { settings: settings ?? {} }),
        updated,
      ),
      how,
    );
  };
  const setValidation = (next: Partial<FieldValidation>, how?: Typed) =>
    setSettings({ validation: compact({ ...field.settings?.validation, ...next }) }, how);
  const setLogic = (next: Partial<NonNullable<FormField['logic']>>, how?: Typed) =>
    patch({ logic: compact({ ...field.logic, ...next }) }, how);
  const rules = validationOf(field);
  const choice = isChoiceType(field.type);
  // a coded column's question takes its list's options, set by the server at every save
  const fromList = choice && listOfField(field) !== null;
  const parents = choice ? parentCandidates(definition, section.key, field.fieldKey) : [];
  const parent = parents.find((p) => p.fieldKey === field.logic?.options_depend_on) ?? null;
  const answers = field.type !== 'note' && field.type !== 'calculation';
  // the earlier answers the question's text may repeat
  const pipeSources = pipeCandidates(definition, field);

  if (mode === 'texts')
    return (
      <Stack gap={2}>
        <Texts value={field.label} onChange={(label) => patch({ label }, TYPED)} />
        {fromList ? (
          <ListOptions field={field} />
        ) : choice ? (
          <OptionsEditor
            options={field.options ?? []}
            mode="texts"
            onChange={(options, how) =>
              onChange(setOptions(definition, field.fieldKey, options), how)
            }
          />
        ) : null}
      </Stack>
    );

  return (
    <Stack gap={2}>
      <Disclosure title={t('group_basics')} headingLevel={2} defaultOpen>
        <Stack gap={3}>
          <Texts value={field.label} onChange={(label) => patch({ label }, TYPED)} />
          {pipeSources.length > 0 ? (
            <SelectField
              label={t('pipe')}
              hint={t('pipe_hint')}
              value=""
              onChange={(id) => {
                if (!id) return;
                const token = ` {{${id}}}`;
                patch({ label: { bn: field.label.bn + token, en: field.label.en + token } });
              }}
              options={pipeSources.map((f) => ({
                value: f.fieldKey,
                label: localized(f.label, locale),
              }))}
            />
          ) : null}
          <TextField
            label={t('help_bn')}
            hint={t('help_hint')}
            value={field.settings?.help?.bn ?? ''}
            onChange={(bn) =>
              setSettings({ help: helpOf(bn, field.settings?.help?.en ?? '') }, TYPED)
            }
          />
          <TextField
            label={t('help_en')}
            lang="en"
            value={field.settings?.help?.en ?? ''}
            onChange={(en) =>
              setSettings({ help: helpOf(field.settings?.help?.bn ?? '', en) }, TYPED)
            }
          />
          {answers ? (
            <Switch
              label={t('required')}
              checked={field.required}
              disabled={locks.optional}
              onChange={(required) => patch({ required })}
            />
          ) : null}
          {/* a mark a form of another kind still holds (a copy) shows, so it can be cleared */}
          {(identityMarks && markable) || role ? (
            <SelectField
              label={t('identity.label')}
              hint={markable ? t('identity.hint') : t('identity.blocked')}
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
                { value: NONE, label: t('identity.none') },
                ...CORE_FIELD_KEYS.map((k) => ({ value: k, label: t(`identity.roles.${k}`) })),
              ]}
            />
          ) : null}
        </Stack>
      </Disclosure>
      {choice ? (
        <Disclosure title={t('options')} headingLevel={2} defaultOpen>
          {fromList ? (
            <ListOptions field={field} />
          ) : (
            <Stack gap={3}>
              {parents.length > 0 ? (
                <SelectField
                  label={t('depends_on')}
                  hint={t('depends_on_hint')}
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
                    { value: NONE, label: t('depends_none') },
                    ...parents.map((p) => ({
                      value: p.fieldKey,
                      label: localized(p.label, locale),
                    })),
                  ]}
                />
              ) : null}
              <OptionsEditor
                heading={false}
                options={field.options ?? []}
                mode="full"
                parent={parent}
                onChange={(options, how) =>
                  onChange(setOptions(definition, field.fieldKey, options), how)
                }
              />
            </Stack>
          )}
        </Disclosure>
      ) : null}
      {isTextType(field.type) ? (
        <Disclosure title={t('group_rules')} hint={t('optional')} headingLevel={2}>
          <Stack gap={3}>
            <SelectField
              label={t('pattern')}
              value={rules.pattern ?? NONE}
              onChange={(id) =>
                setValidation({ pattern: PATTERN_KEYS.find((k) => k === id) ?? undefined })
              }
              options={[
                { value: NONE, label: t('pattern_none') },
                ...PATTERN_KEYS.map((k) => ({ value: k, label: t(`patterns.${k}`) })),
              ]}
            />
            <LimitPair
              minLabel={t('min_length')}
              maxLabel={t('max_length')}
              integer
              min={rules.min_length}
              max={rules.max_length}
              orderMessage={t('limits_order')}
              onApply={(min, max) => setValidation({ min_length: min, max_length: max }, TYPED)}
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
            onApply={(min, max) => setValidation({ min, max }, TYPED)}
          />
        </Disclosure>
      ) : null}
      {takesDefault(field) && group === null ? (
        <Disclosure title={t('group_default')} hint={t('optional')} headingLevel={2}>
          <DefaultSettings field={field} onChange={setSettings} />
        </Disclosure>
      ) : null}
      {field.type === 'number_table' && field.settings?.table ? (
        <Disclosure title={t('group_table')} headingLevel={2} defaultOpen>
          <TableSettings
            table={field.settings.table}
            onChange={(table, how) => setSettings({ table }, how)}
          />
        </Disclosure>
      ) : null}
      {field.type === 'repeat_group' ? (
        <Disclosure title={t('group_rows')} headingLevel={2} defaultOpen>
          <RepeatSettings
            definition={definition}
            field={field}
            onRows={(min, max) => setRepeat({ min_rows: min, max_rows: max }, TYPED)}
            counts={countCandidates(definition, field.fieldKey)}
            onCountFrom={(key) => setRepeat({ count_from: key ?? undefined })}
          />
        </Disclosure>
      ) : null}
      {/* points inside a group's rows are refused at publish, so a group's question offers none */}
      {group === null ? (
        <ScoreSettings field={field} onChange={(score, how) => setSettings({ score }, how)} />
      ) : null}
      {field.type === 'calculation' ? (
        <CalcGroup
          definition={definition}
          field={field}
          asker={asker}
          onChange={(calculation, how) => patch({ calculation }, how)}
          onResults={(results, how) => setSettings({ results }, how)}
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
            onChange={(show_if, how) => setLogic({ show_if }, how)}
            defaultOpen
          />
          {answers ? (
            <ConditionGroup
              kind="required"
              definition={definition}
              asker={asker}
              condition={field.logic?.required_if}
              onChange={(required_if, how) => setLogic({ required_if }, how)}
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
        <Icon name="sparkles" />
      </span>
      <Text>
        <strong>{t('start_title')}</strong>
      </Text>
      <ol className="fb-start-steps">
        <li>{t('start_1')}</li>
        <li>{t('start_2')}</li>
        <li>{t('start_3')}</li>
      </ol>
    </div>
  );
}

/**
 * A help text empty in both languages is none; one language alone is kept in the draft and waits
 * for the other until the form is published.
 */
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
