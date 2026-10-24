import type { Condition, ConditionOp } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import type { FormDefinition, FormField } from '@css/shared/forms';
import { type Term, termsFromExpr } from './calc-terms';
import { rowsFromCondition } from './logic-rows';

/**
 * The words a sentence is built from, in the reader's language. The settings pane fills them
 * from the catalogue; a test passes plain ones.
 */
export interface RuleWords {
  and: string;
  or: string;
  /** One comparison: the question's label, the comparison and the value as text. */
  compare: (op: ConditionOp, question: string, value: string) => string;
  plus: string;
  minus: string;
  times: string;
  dividedBy: string;
  age: (question: string) => string;
  nisab: (question: string) => string;
  groupSum: (group: string, field: string) => string;
}

/** A rule read as one line: none set, one the rows cannot show, or the text. */
export type RulesText = { kind: 'none' } | { kind: 'complex' } | { kind: 'rules'; text: string };

const fieldOf = (definition: FormDefinition, key: string): FormField | undefined =>
  definition.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === key);

const labelOf = (definition: FormDefinition, key: string, locale: Locale) =>
  fieldOf(definition, key)?.label[locale] ?? key;

/** A compared value as the reader sees it: an option by its label, a list by its labels. */
function valueText(field: FormField | undefined, value: unknown, locale: Locale): string {
  if (Array.isArray(value)) return value.map((v) => valueText(field, v, locale)).join(', ');
  if (typeof value === 'string') {
    const option = field?.options?.find((o) => o.code === value);
    if (option) return option.label[locale];
  }
  if (value === undefined || value === null) return '';
  return String(value);
}

/** "‘Loan?’ = yes and ‘Income’ above 5000", from the rows of a condition. */
export function conditionRules(
  definition: FormDefinition,
  condition: Condition | null | undefined,
  locale: Locale,
  words: RuleWords,
): RulesText {
  const view = rowsFromCondition(condition);
  if (view.kind === 'complex') return { kind: 'complex' };
  if (view.rows.length === 0) return { kind: 'none' };
  const parts = view.rows.map((row) =>
    words.compare(
      row.op,
      labelOf(definition, row.field, locale),
      valueText(fieldOf(definition, row.field), row.value, locale),
    ),
  );
  return { kind: 'rules', text: parts.join(` ${view.join === 'all' ? words.and : words.or} `) };
}

/** "‘Men’ + ‘Women’ − 1", from the shape of a calculation. */
export function calculationRules(
  definition: FormDefinition,
  field: FormField,
  locale: Locale,
  words: RuleWords,
): RulesText {
  if (!field.calculation) return { kind: 'none' };
  const view = termsFromExpr(field.calculation.expr);
  if (view.kind === 'complex') return { kind: 'complex' };
  const term = (t: Term) =>
    t.kind === 'number'
      ? String(t.value)
      : t.kind === 'field'
        ? `“${labelOf(definition, t.key, locale)}”`
        : words.groupSum(
            labelOf(definition, t.group, locale),
            labelOf(definition, t.field, locale),
          );
  switch (view.kind) {
    case 'chain': {
      if (view.terms.length === 0) return { kind: 'none' };
      const text = view.terms
        .map(({ sign, term: x }, i) => {
          const joined =
            i === 0
              ? sign < 0
                ? `${words.minus} `
                : ''
              : ` ${sign < 0 ? words.minus : words.plus} `;
          return joined + term(x);
        })
        .join('');
      return { kind: 'rules', text };
    }
    case 'product':
      return {
        kind: 'rules',
        text: `${term(view.left)} ${view.op === 'mul' ? words.times : words.dividedBy} ${term(view.right)}`,
      };
    case 'age':
      return { kind: 'rules', text: words.age(labelOf(definition, view.dob, locale)) };
    case 'nisab':
      return { kind: 'rules', text: words.nisab(labelOf(definition, view.net, locale)) };
  }
}
