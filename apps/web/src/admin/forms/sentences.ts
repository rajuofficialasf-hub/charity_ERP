import type { Condition, ConditionOp, Expr } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import { type FormDefinition, type FormField, resultLabelOf } from '@css/shared/forms';
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
  /** "যদি … হয় তবে …" for one branch of a step. */
  ifThen: (condition: string, value: string) => string;
  /** "নইলে …" for the last value of a step. */
  otherwise: (value: string) => string;
  countRows: (group: string) => string;
  countRowsWhere: (group: string, condition: string) => string;
  cell: (table: string, row: string, col: string) => string;
  smallest: (parts: string) => string;
  largest: (parts: string) => string;
  not: (condition: string) => string;
}

/** A rule read as one line: none set, one the rows cannot show, or the text. */
export type RulesText = { kind: 'none' } | { kind: 'complex' } | { kind: 'rules'; text: string };

const fieldOf = (definition: FormDefinition, key: string): FormField | undefined =>
  definition.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === key);

const labelOf = (definition: FormDefinition, key: string, locale: Locale) =>
  fieldOf(definition, key)?.label[locale] ?? key;

/**
 * A compared value as the reader sees it: an option by its label, a list by its labels, another
 * answer by its question's label.
 */
function valueText(
  definition: FormDefinition,
  field: FormField | undefined,
  value: unknown,
  locale: Locale,
): string {
  if (Array.isArray(value))
    return value.map((v) => valueText(definition, field, v, locale)).join(', ');
  if (typeof value === 'object' && value !== null && 'field' in value)
    return `“${labelOf(definition, String((value as { field: string }).field), locale)}”`;
  if (typeof value === 'string') {
    const option = field?.options?.find((o) => o.code === value);
    if (option) return option.label[locale];
    const result = field ? resultLabelOf(field, value) : null;
    if (result) return result[locale];
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
  if (view.kind === 'complex')
    return condition
      ? { kind: 'rules', text: conditionText(definition, condition, locale, words) }
      : { kind: 'complex' };
  if (view.rows.length === 0) return { kind: 'none' };
  const parts = view.rows.map((row) =>
    words.compare(
      row.op,
      labelOf(definition, row.field, locale),
      valueText(definition, fieldOf(definition, row.field), row.value, locale),
    ),
  );
  return { kind: 'rules', text: parts.join(` ${view.join === 'all' ? words.and : words.or} `) };
}

/** Any condition as text, nested groups and negations included. */
export function conditionText(
  definition: FormDefinition,
  condition: Condition,
  locale: Locale,
  words: RuleWords,
): string {
  const inner = (c: Condition) => {
    const text = conditionText(definition, c, locale, words);
    return 'all' in c || 'any' in c ? `(${text})` : text;
  };
  if ('all' in condition) return condition.all.map(inner).join(` ${words.and} `);
  if ('any' in condition) return condition.any.map(inner).join(` ${words.or} `);
  if ('not' in condition) return words.not(conditionText(definition, condition.not, locale, words));
  return words.compare(
    condition.op,
    labelOf(definition, condition.field, locale),
    valueText(definition, fieldOf(definition, condition.field), condition.value, locale),
  );
}

/** "‘Men’ + ‘Women’ − 1", from the parts of a calculation. */
export function calculationRules(
  definition: FormDefinition,
  field: FormField,
  locale: Locale,
  words: RuleWords,
): RulesText {
  if (!field.calculation) return { kind: 'none' };
  return {
    kind: 'rules',
    text: exprText(definition, field, field.calculation.expr, locale, words),
  };
}

const SIGNS = { add: 'plus', sub: 'minus', mul: 'times', div: 'dividedBy' } as const;
const ORDER = { add: 1, sub: 1, mul: 2, div: 2 } as const;

/** One part of a calculation as text; a sum inside a product, or after a minus, keeps its bracket. */
export function exprText(
  definition: FormDefinition,
  field: FormField,
  expr: Expr,
  locale: Locale,
  words: RuleWords,
): string {
  const label = (key: string) => `“${labelOf(definition, key, locale)}”`;
  const part = (e: Expr) => exprText(definition, field, e, locale, words);
  if (typeof expr === 'number') return String(expr);
  if ('field' in expr) return label(expr.field);
  if ('result' in expr) {
    const result = resultLabelOf(field, expr.result);
    return `“${result ? result[locale] : expr.result}”`;
  }
  if ('setting' in expr) return '';
  if ('sum_repeat' in expr)
    return words.groupSum(
      labelOf(definition, expr.sum_repeat.group, locale),
      labelOf(definition, expr.sum_repeat.field, locale),
    );
  if ('count_rows' in expr) {
    const group = labelOf(definition, expr.count_rows.group, locale);
    return expr.count_rows.where
      ? words.countRowsWhere(group, conditionText(definition, expr.count_rows.where, locale, words))
      : words.countRows(group);
  }
  if ('cell' in expr) {
    const table = fieldOf(definition, expr.cell.field);
    const rowLabel = table?.settings?.table?.rows.find((r) => r.key === expr.cell.row)?.label;
    const colLabel = table?.settings?.table?.cols.find((c) => c.key === expr.cell.col)?.label;
    return words.cell(
      labelOf(definition, expr.cell.field, locale),
      rowLabel ? rowLabel[locale] : expr.cell.row,
      colLabel ? colLabel[locale] : expr.cell.col,
    );
  }
  if ('if' in expr) {
    const branches = expr.if.map((b) =>
      words.ifThen(conditionText(definition, b.when, locale, words), part(b.then)),
    );
    return [...branches, words.otherwise(part(expr.else))].join(', ');
  }
  const { op, args } = expr;
  if (op === 'age_from_dob') return words.age(labelOf(definition, keyOf(args[0]), locale));
  if (op === 'compare_gte') return words.nisab(labelOf(definition, keyOf(args[0]), locale));
  if (op === 'min') return words.smallest(args.map(part).join(', '));
  if (op === 'max') return words.largest(args.map(part).join(', '));
  return args
    .map((arg, i) => {
      const inner = part(arg);
      const child =
        typeof arg === 'object' && 'op' in arg && arg.op in ORDER
          ? ORDER[arg.op as keyof typeof ORDER]
          : 3;
      const bracket = child < ORDER[op] || (child === ORDER[op] && i > 0);
      const shown = bracket ? `(${inner})` : inner;
      return i === 0 ? shown : `${words[SIGNS[op]]} ${shown}`;
    })
    .join(' ');
}

const keyOf = (expr: Expr | undefined) =>
  typeof expr === 'object' && 'field' in expr ? expr.field : '';
