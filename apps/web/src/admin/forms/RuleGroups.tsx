import type { Condition } from '@css/shared';
import type { Calculation, FormDefinition, FormField } from '@css/shared/forms';
import { Button, Disclosure, Modal, Stack } from '@css/ui';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
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
    }),
    [t],
  );
}

/**
 * A rule shown as one plain sentence with a button that opens its editor in a dialog, so the
 * settings stay short and the rows (a question, a comparison, a value) appear only when wanted.
 */
export function ConditionGroup({
  kind,
  definition,
  asker,
  condition,
  onChange,
  defaultOpen = false,
}: {
  /** The question's show-if, its required-if, or a section's show-if. */
  kind: 'show' | 'required' | 'section';
  definition: FormDefinition;
  asker: Asker;
  condition: Condition | null | undefined;
  onChange: (condition: Condition | undefined) => void;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const words = useRuleWords();
  const [editing, setEditing] = useState(false);
  const rules = conditionRules(definition, condition, locale, words);
  const title = t(
    kind === 'show' ? 'show_if' : kind === 'required' ? 'required_if' : 'section_condition',
  );
  const sentence =
    rules.kind === 'complex'
      ? t('cond_complex')
      : rules.kind === 'none'
        ? t(`${kind}_always`)
        : t(`${kind}_when`, { rules: rules.text });
  return (
    <Disclosure title={title} headingLevel={2} defaultOpen={defaultOpen}>
      <Stack gap={2}>
        <p className="fb-sentence">{sentence}</p>
        <Button size="sm" variant="secondary" icon={Pencil} onPress={() => setEditing(true)}>
          {t(rules.kind === 'none' ? 'cond_open_none' : 'cond_open_some')}
        </Button>
      </Stack>
      <Modal
        title={t(
          kind === 'show'
            ? 'cond_title_show'
            : kind === 'required'
              ? 'cond_title_required'
              : 'cond_title_section',
        )}
        isOpen={editing}
        onClose={() => setEditing(false)}
        size="lg"
        fullOnPhone
        primaryAction={<Button onPress={() => setEditing(false)}>{t('done')}</Button>}
      >
        <ConditionEditor
          title={title}
          heading={false}
          definition={definition}
          asker={asker}
          condition={condition}
          onChange={onChange}
        />
      </Modal>
    </Disclosure>
  );
}

/** The calculation of a calculated question as a sentence, with its editor in a dialog. */
export function CalcGroup({
  definition,
  field,
  asker,
  onChange,
}: {
  definition: FormDefinition;
  field: FormField;
  asker: Asker;
  onChange: (calculation: Calculation) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const words = useRuleWords();
  const [editing, setEditing] = useState(false);
  const rules = calculationRules(definition, field, locale, words);
  const sentence =
    rules.kind === 'complex'
      ? t('calc_complex')
      : rules.kind === 'none'
        ? t('calc_none')
        : t('calc_is', { label: field.label[locale], rules: rules.text });
  return (
    <Disclosure title={t('calc')} headingLevel={2} defaultOpen>
      <Stack gap={2}>
        <p className="fb-sentence">{sentence}</p>
        <Button size="sm" variant="secondary" icon={Pencil} onPress={() => setEditing(true)}>
          {t(rules.kind === 'none' ? 'calc_open_none' : 'calc_open_some')}
        </Button>
      </Stack>
      <Modal
        title={t('calc')}
        isOpen={editing}
        onClose={() => setEditing(false)}
        size="lg"
        fullOnPhone
        primaryAction={<Button onPress={() => setEditing(false)}>{t('done')}</Button>}
      >
        <CalculationEditor
          heading={false}
          definition={definition}
          field={field}
          asker={asker}
          onChange={onChange}
        />
      </Modal>
    </Disclosure>
  );
}
