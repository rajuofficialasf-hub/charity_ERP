import type { Condition } from '@css/shared';
import type { Calculation, CalculationResult, FormDefinition, FormField } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import { Button, Dialog, Disclosure, Stack } from '@/ui';
import { type ReactNode, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { CalculationEditor } from './CalculationEditor';
import type { Asker } from './candidates';
import { ConditionEditor } from './ConditionEditor';
import { calculationRules, conditionRules, type RuleWords } from './sentences';

/** The words of the sentences, from the catalogue. */
function useRuleWords(): RuleWords {
  const t = useTranslations('forms.builder');
  return useMemo(
    () => ({
      and: t('sentence.and'),
      or: t('sentence.or'),
      compare: (op, q, v) => t(`sentence.${op}`, { q, v }),
      plus: t('sentence.plus'),
      minus: t('sentence.minus'),
      times: t('sentence.times'),
      dividedBy: t('sentence.divided_by'),
      age: (q) => t('sentence.age', { q }),
      nisab: (q) => t('sentence.nisab', { q }),
      groupSum: (group, field) => t('term_group_sum', { group, field }),
      ifThen: (c, v) => t('sentence.if_then', { c, v }),
      otherwise: (v) => t('sentence.otherwise', { v }),
      countRows: (group) => t('sentence.count_rows', { group }),
      countRowsWhere: (group, c) => t('sentence.count_rows_where', { group, c }),
      cell: (table, row, col) => t('sentence.cell', { table, row, col }),
      smallest: (parts) => t('sentence.smallest', { parts }),
      largest: (parts) => t('sentence.largest', { parts }),
      not: (c) => t('sentence.not', { c }),
    }),
    [t],
  );
}

/**
 * A rule shown as one plain sentence with a button that opens its editor in a dialog, so the
 * settings stay short and the rows appear only when wanted. The editor writes to the draft as it
 * changes; the dialog only shows it.
 */
function RuleCard({
  title,
  dialogTitle,
  sentence,
  openLabel,
  defaultOpen,
  children,
}: {
  title: string;
  dialogTitle: string;
  sentence: string;
  openLabel: string;
  defaultOpen: boolean;
  /** The editor, shown inside the dialog. */
  children: ReactNode;
}) {
  const t = useTranslations('forms.builder');
  const [editing, setEditing] = useState(false);
  return (
    <Disclosure title={title} headingLevel={2} defaultOpen={defaultOpen}>
      <Stack gap={2}>
        <p className="fb-sentence">{sentence}</p>
        <Button size="small" variant="secondary" startIcon="edit" onClick={() => setEditing(true)}>
          {openLabel}
        </Button>
      </Stack>
      <Dialog
        title={dialogTitle}
        open={editing}
        onClose={() => setEditing(false)}
        size="large"
        fullScreenOnPhone
        actions={
          <>
            <Button onClick={() => setEditing(false)}>{t('done')}</Button>
          </>
        }
      >
        {children}
      </Dialog>
    </Disclosure>
  );
}

/** The keys of each kind of condition: its group title, its dialog title, its sentences. */
const CONDITION_KINDS = {
  show: {
    title: 'show_if',
    dialog: 'cond_title_show',
    always: 'show_always',
    when: 'show_when',
  },
  required: {
    title: 'required_if',
    dialog: 'cond_title_required',
    always: 'required_always',
    when: 'required_when',
  },
  section: {
    title: 'section_condition',
    dialog: 'cond_title_section',
    always: 'section_always',
    when: 'section_when',
  },
} as const;

/** A question's show-if or required-if, or a section's show-if, as a sentence with its editor. */
export function ConditionGroup({
  kind,
  definition,
  asker,
  condition,
  onChange,
  defaultOpen = false,
}: {
  kind: keyof typeof CONDITION_KINDS;
  definition: FormDefinition;
  asker: Asker;
  condition: Condition | null | undefined;
  onChange: (condition: Condition | undefined) => void;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const words = useRuleWords();
  const keys = CONDITION_KINDS[kind];
  const rules = conditionRules(definition, condition, locale, words);
  const sentence =
    rules.kind === 'complex'
      ? t('cond_complex')
      : rules.kind === 'none'
        ? t(keys.always)
        : t(keys.when, { rules: rules.text });
  return (
    <RuleCard
      title={t(keys.title)}
      dialogTitle={t(keys.dialog)}
      sentence={sentence}
      openLabel={t(rules.kind === 'none' ? 'cond_open_none' : 'cond_open_some')}
      defaultOpen={defaultOpen}
    >
      <ConditionEditor
        title={t(keys.title)}
        heading={false}
        definition={definition}
        asker={asker}
        condition={condition}
        onChange={onChange}
      />
    </RuleCard>
  );
}

/** The calculation of a calculated question as a sentence, with its editor in a dialog. */
export function CalcGroup({
  definition,
  field,
  asker,
  onChange,
  onResults,
}: {
  definition: FormDefinition;
  field: FormField;
  asker: Asker;
  onChange: (calculation: Calculation | undefined) => void;
  onResults: (results: CalculationResult[] | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const words = useRuleWords();
  const rules = calculationRules(definition, field, locale, words);
  const sentence =
    rules.kind === 'complex'
      ? t('calc_complex')
      : rules.kind === 'none'
        ? t('calc_none')
        : t('calc_is', { label: localized(field.label, locale), rules: rules.text });
  return (
    <RuleCard
      title={t('calc')}
      dialogTitle={t('calc')}
      sentence={sentence}
      openLabel={t(rules.kind === 'none' ? 'calc_open_none' : 'calc_open_some')}
      defaultOpen
    >
      <CalculationEditor
        heading={false}
        definition={definition}
        field={field}
        asker={asker}
        onChange={onChange}
        onResults={onResults}
      />
    </RuleCard>
  );
}
