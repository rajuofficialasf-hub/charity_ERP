import { z } from 'zod';
import { code64, snakeKey } from '../jsonb/common.js';
import {
  calculationSchema,
  conditionSchema,
  isFieldRef,
  validationSchema,
  withinLimits,
  type Condition,
  type Expr,
} from '../jsonb/form-logic.js';
import {
  CORE_FIELDS,
  type FormKind,
  identityRoleOf,
  FAMILY_MEMBERS_TABLE,
  isFamilyMemberColumn,
  isStandardColumn,
} from './core.js';
import {
  FIELD_TYPES,
  isChoiceType,
  isTextType,
  SECTION_VISIBILITIES,
  type FieldType,
  type SectionVisibility,
} from './library.js';
import { matchesPattern, PATTERN_KEYS, TEXT_MAX_LENGTH } from './patterns.js';
import { pipeKeys } from './pipe.js';
import { MAX_SCORE, maxScoreOf, scoreKindOf } from './score.js';

/**
 * A form version definition in the shape the API answers and the draft update sends: sections,
 * each with fields, each with options. The engine, the builder and the phone all run on this one
 * shape. Parsing refuses what the schema cannot express; `checkDefinition` refuses what it can
 * (a missing core field, a dangling reference, a cycle), each with a stable code.
 */

/** How large a definition may grow: a builder never needs more, and a request body stays bounded. */
export const DEFINITION_LIMITS = {
  sections: 50,
  fieldsPerSection: 200,
  optionsPerField: 100,
  membersPerGroup: 50,
} as const;

/** A user-facing text of a form: both languages, neither empty. */
const label = (max: number) =>
  z.strictObject({
    bn: z.string({ error: 'form.label_language' }).trim().min(1, 'form.label_language').max(max),
    en: z.string({ error: 'form.label_language' }).trim().min(1, 'form.label_language').max(max),
  });

export const fieldOptionSchema = z.strictObject({
  code: code64,
  label: label(200),
  /** Shown only while the field named by `logic.options_depend_on` holds this option. */
  dependsOnOptionCode: code64.nullable().optional(),
  allowsOtherText: z.boolean().optional(),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

/** The validation of a field: a named pattern only, and a cap no larger than the global one. */
export const fieldValidationSchema = validationSchema.extend({
  max_length: z.int().min(1).max(TEXT_MAX_LENGTH).optional(),
  pattern: z.enum(PATTERN_KEYS, { error: 'form.pattern_unknown' }).optional(),
});
export type FieldValidation = z.infer<typeof fieldValidationSchema>;

export const repeatSettingsSchema = z.strictObject({
  min_rows: z.int().min(0).optional(),
  max_rows: z.int().min(1).optional(),
  /** On a family-member group: whether its rows are earners (true unless set). */
  earner: z.boolean().optional(),
  /** Set on a field inside a repeat group: the key of its group, in the same section. */
  group: snakeKey.optional(),
  /** On a repeat group: the earlier whole-number question whose answer gives its number of rows. */
  count_from: snakeKey.optional(),
});

/** The most rows a group's count may ask for, as the public intake caps the rows. */
export const COUNTED_ROWS_MAX = 50;

/** The most cells a number table may hold. */
export const TABLE_CELLS_MAX = 200;
/** Keys a table may never use, since they name an object's own machinery. */
const RESERVED_KEYS = new Set(['constructor', 'prototype', '__proto__']);

/** The rows and columns of a number table, each a key and its label in both languages. */
export const numberTableSchema = z.strictObject({
  rows: z.array(z.strictObject({ key: snakeKey, label: label(200) })).max(TABLE_CELLS_MAX),
  cols: z.array(z.strictObject({ key: snakeKey, label: label(200) })).max(TABLE_CELLS_MAX),
});
export type NumberTable = z.infer<typeof numberTableSchema>;

/** The value a question starts with: today's date, a fixed text or a number. */
export const fieldDefaultSchema = z.union([
  z.strictObject({ today: z.literal(true) }),
  z.strictObject({ text: z.string().max(500) }),
  z.strictObject({ number: z.number() }),
]);
export type FieldDefault = z.infer<typeof fieldDefaultSchema>;

/** Points from 0 to 100 in whole numbers, as the priority score counts them. */
const points = z.int().min(0).max(100);

/**
 * The points a question gives toward the priority score: per option code of a choice question,
 * or per range of a number (the first range the value falls in counts; an open end has no bound).
 */
export const fieldScoreSchema = z.strictObject({
  options: z.record(code64, points).optional(),
  ranges: z
    .array(
      z.strictObject({
        min: z.number().optional(),
        max: z.number().optional(),
        points,
      }),
    )
    .max(20)
    .optional(),
});
export type FieldScore = z.infer<typeof fieldScoreSchema>;

/** The form-level criteria of the score: the points of "not previously assisted". */
export const formScoringSchema = z.strictObject({
  not_previously_assisted: points.optional(),
});
export type FormScoring = z.infer<typeof formScoringSchema>;

/** A text result a calculation may give: a code and its label in both languages. */
export const calculationResultSchema = z.strictObject({ code: code64, label: label(200) });
export type CalculationResult = z.infer<typeof calculationResultSchema>;

export const fieldSettingsSchema = z.strictObject({
  placeholder: label(200).optional(),
  help: label(500).optional(),
  default: fieldDefaultSchema.optional(),
  /** The answer comes only from the calculation or the default; nobody types it. */
  read_only: z.boolean().optional(),
  /** On a number table: its rows and columns. */
  table: numberTableSchema.optional(),
  results: z.array(calculationResultSchema).max(50).optional(),
  validation: fieldValidationSchema.optional(),
  repeat: repeatSettingsSchema.optional(),
  score: fieldScoreSchema.optional(),
});
export type FieldSettings = z.infer<typeof fieldSettingsSchema>;

export const fieldLogicSchema = z.strictObject({
  show_if: conditionSchema.optional(),
  required_if: conditionSchema.optional(),
  options_depend_on: snakeKey.optional(),
  validation: fieldValidationSchema.optional(),
});
export type FieldLogic = z.infer<typeof fieldLogicSchema>;

export type Calculation = z.infer<typeof calculationSchema>;

export const formFieldSchema = z.strictObject({
  fieldKey: snakeKey.max(64),
  libraryFieldKey: z.string().nullable().optional(),
  type: z.enum(FIELD_TYPES),
  label: label(500),
  required: z.boolean(),
  standardColumn: z.string().nullable().optional(),
  settings: fieldSettingsSchema.optional(),
  logic: fieldLogicSchema.optional(),
  calculation: calculationSchema.optional(),
  options: z.array(fieldOptionSchema).max(DEFINITION_LIMITS.optionsPerField).optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSectionSchema = z.strictObject({
  key: snakeKey.max(64),
  librarySectionKey: z.string().nullable().optional(),
  title: label(200),
  visibility: z.enum(SECTION_VISIBILITIES),
  condition: conditionSchema.nullable().optional(),
  fields: z.array(formFieldSchema).max(DEFINITION_LIMITS.fieldsPerSection),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export interface FormDefinition {
  sections: FormSection[];
  /** The form-level points of the priority score; a form without any points gives no score. */
  scoring?: FormScoring;
}

/** The same shapes under the names the API service reads them by. */
export type FormFieldDefinition = FormField;
export type FormSectionDefinition = FormSection;

export const DEFINITION_ISSUE_CODES = [
  'form.duplicate_key',
  'form.label_language',
  'form.pattern_unknown',
  'form.unknown_reference',
  'form.repeat_reference',
  'form.repeat_group_invalid',
  'form.calculation_cycle',
  'form.condition_cycle',
  'form.calculation_misplaced',
  'form.calculation_missing',
  'form.options_misplaced',
  'form.option_dependency',
  'form.core_field_missing',
  'form.core_field_optional',
  'form.core_field_hidden',
  'form.core_field_shape',
  'form.standard_column_unknown',
  'form.standard_column_duplicate',
  'form.repeat_group_too_large',
  'form.score_misplaced',
  'form.score_option_unknown',
  'form.score_over_max',
  'form.score_range_invalid',
  'form.result_unknown',
  'form.result_misplaced',
  'form.comparison_type',
  'form.reference_hidden',
  'form.expression_too_large',
  'form.read_only_invalid',
  'form.default_misplaced',
  'form.repeat_count_invalid',
  'form.pipe_order',
  'form.table_invalid',
] as const;
export type DefinitionIssueCode = (typeof DEFINITION_ISSUE_CODES)[number];

export interface DefinitionIssue {
  code: DefinitionIssueCode;
  /** Where in the definition, as a zod path (`sections`, index, `fields`, index, ...). */
  path: (string | number)[];
  params?: Record<string, string>;
}

/** The field keys a condition reads, the answers it compares with included. */
export function conditionFields(condition: Condition): string[] {
  if ('all' in condition) return condition.all.flatMap(conditionFields);
  if ('any' in condition) return condition.any.flatMap(conditionFields);
  if ('not' in condition) return conditionFields(condition.not);
  return isFieldRef(condition.value) ? [condition.field, condition.value.field] : [condition.field];
}

/** The simple conditions inside a condition, each comparing one answer. */
function simpleConditions(condition: Condition): Extract<Condition, { field: string }>[] {
  if ('all' in condition) return condition.all.flatMap(simpleConditions);
  if ('any' in condition) return condition.any.flatMap(simpleConditions);
  if ('not' in condition) return simpleConditions(condition.not);
  return [condition];
}

export interface ExprReferences {
  /** The number-table cells read, by table, row and column. */
  cells: { field: string; row: string; col: string }[];
  /** The fields read at the calculation's own row (its branches' conditions included). */
  fields: string[];
  /** The repeat-group fields summed over every row. */
  sums: { group: string; field: string }[];
  /** The repeat groups whose rows are counted, with the condition read inside each row. */
  counts: { group: string; where?: Condition }[];
  /** The text results the expression gives. */
  results: string[];
  /** Every condition of the branches, for the comparison checks. */
  conditions: Condition[];
}

/** What an expression reads and gives. */
export function exprReferences(expr: Expr): ExprReferences {
  const none: ExprReferences = {
    fields: [],
    sums: [],
    counts: [],
    results: [],
    conditions: [],
    cells: [],
  };
  if (typeof expr === 'number') return none;
  if ('field' in expr) return { ...none, fields: [expr.field] };
  if ('sum_repeat' in expr) return { ...none, sums: [expr.sum_repeat] };
  if ('setting' in expr) return none;
  if ('result' in expr) return { ...none, results: [expr.result] };
  if ('count_rows' in expr) return { ...none, counts: [expr.count_rows] };
  if ('cell' in expr) return { ...none, fields: [expr.cell.field], cells: [expr.cell] };
  const parts =
    'if' in expr
      ? [
          ...expr.if.flatMap((branch) => [
            { ...none, fields: conditionFields(branch.when), conditions: [branch.when] },
            exprReferences(branch.then),
          ]),
          exprReferences(expr.else),
        ]
      : expr.args.map(exprReferences);
  return {
    fields: parts.flatMap((p) => p.fields),
    sums: parts.flatMap((p) => p.sums),
    counts: parts.flatMap((p) => p.counts),
    results: parts.flatMap((p) => p.results),
    conditions: parts.flatMap((p) => p.conditions),
    cells: parts.flatMap((p) => p.cells),
  };
}

/** The label of a calculation's text result, by its code; null for a code it does not list. */
export function resultLabelOf(field: FormField, code: string): CalculationResult['label'] | null {
  return field.settings?.results?.find((r) => r.code === code)?.label ?? null;
}

/** What a question's answer is, as a comparison sees it. */
function comparedKind(field: FormField): 'number' | 'text' | 'date' | null {
  if (field.type === 'number' || field.type === 'decimal' || field.type === 'money')
    return 'number';
  if (field.type === 'calculation') return field.settings?.results?.length ? 'text' : 'number';
  if (field.type === 'date' || field.type === 'time' || field.type === 'datetime') return 'date';
  if (isTextType(field.type) || isChoiceType(field.type)) return 'text';
  return null;
}

/** A field with its place in the definition. */
export interface LocatedField {
  field: FormField;
  section: FormSection;
  sectionIndex: number;
  fieldIndex: number;
  /** The repeat group this field belongs to, or null for a plain field. */
  group: string | null;
}

/** Every field of a definition by key; a duplicate key keeps its first field. */
export function indexFields(definition: FormDefinition): Map<string, LocatedField> {
  const fields = new Map<string, LocatedField>();
  definition.sections.forEach((section, sectionIndex) => {
    section.fields.forEach((field, fieldIndex) => {
      if (fields.has(field.fieldKey)) return;
      fields.set(field.fieldKey, {
        field,
        section,
        sectionIndex,
        fieldIndex,
        group: field.settings?.repeat?.group ?? null,
      });
    });
  });
  return fields;
}

/** The validation of a field: the settings win over the logic where both name a rule. */
export function validationOf(field: FormField): FieldValidation {
  return { ...field.logic?.validation, ...field.settings?.validation };
}

/**
 * Whether a default suits its question and keeps the question's own rules, so a read-only answer
 * the filler cannot change never fails its own check: today's date on a date, a text on a plain
 * text question within its length and pattern, a whole number on a number, an amount of at most
 * two decimals and not below 0 on money, a number within the question's least and most.
 */
function defaultFits(field: FormField, start: FieldDefault): boolean {
  const rules = validationOf(field);
  if ('today' in start) return field.type === 'date';
  if ('text' in start) {
    if (field.type !== 'short_text' && field.type !== 'long_text') return false;
    const max = rules.max_length ?? TEXT_MAX_LENGTH;
    if (start.text.length > max) return false;
    return rules.pattern === undefined || matchesPattern(rules.pattern, start.text, max);
  }
  const n = start.number;
  if (field.type === 'number' && !Number.isInteger(n)) return false;
  if (field.type === 'money' && (n < 0 || Math.round(n * 100) !== n * 100)) return false;
  if (field.type !== 'number' && field.type !== 'decimal' && field.type !== 'money') return false;
  if (rules.min !== undefined && n < rules.min) return false;
  return rules.max === undefined || n <= rules.max;
}

/** Whether one field comes before another in the form's order. */
const before = (a: LocatedField, b: LocatedField) =>
  a.sectionIndex < b.sectionIndex ||
  (a.sectionIndex === b.sectionIndex && a.fieldIndex < b.fieldIndex);

const fieldPath = (f: LocatedField, ...rest: (string | number)[]) => [
  'sections',
  f.sectionIndex,
  'fields',
  f.fieldIndex,
  ...rest,
];

/**
 * The checks the schema cannot express. Each issue carries a stable code; the API turns them into
 * validation details and the builder shows them beside the field.
 */
export function checkDefinition(
  definition: FormDefinition,
  options: {
    /**
     * At publish: a calculated question must have its rule by then, and an application form its
     * identity questions (a draft may wait for both).
     */
    publishing?: boolean;
    /** What the form is for; the identity roles apply to a beneficiary application only. */
    kind?: FormKind;
  } = {},
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const fields = indexFields(definition);

  // keys are unique across the version: section keys among sections, field keys among every field
  const sectionKeys = new Set<string>();
  const fieldKeys = new Set<string>();
  definition.sections.forEach((section, si) => {
    if (sectionKeys.has(section.key))
      issues.push({
        code: 'form.duplicate_key',
        path: ['sections', si, 'key'],
        params: { key: section.key },
      });
    sectionKeys.add(section.key);
    section.fields.forEach((field, fi) => {
      if (fieldKeys.has(field.fieldKey))
        issues.push({
          code: 'form.duplicate_key',
          path: ['sections', si, 'fields', fi, 'fieldKey'],
          params: { key: field.fieldKey },
        });
      fieldKeys.add(field.fieldKey);
      const codes = new Set<string>();
      (field.options ?? []).forEach((option, oi) => {
        if (codes.has(option.code))
          issues.push({
            code: 'form.duplicate_key',
            path: ['sections', si, 'fields', fi, 'options', oi, 'code'],
            params: { key: option.code },
          });
        codes.add(option.code);
      });
    });
  });

  // a reference from `from` to the field `key`: it must exist, a field inside a repeat group is
  // only reachable from inside the same group, and what a volunteer or a public visitor sees never
  // reads an office-only answer (once per referring question)
  const hiddenReported = new Set<string>();
  const checkReference = (
    from: { group: string | null; section?: FormSection; field?: FormField; path?: unknown },
    key: string,
    path: (string | number)[],
  ): LocatedField | null => {
    const target = fields.get(key);
    if (!target) {
      issues.push({ code: 'form.unknown_reference', path, params: { reference: key } });
      return null;
    }
    if (target.group !== null && target.group !== from.group) {
      issues.push({ code: 'form.repeat_reference', path, params: { reference: key } });
      return null;
    }
    // checked at publish only, so a draft keeps saving while the builder works on it
    const seenByOthers =
      options.publishing === true &&
      from.section !== undefined &&
      from.section.visibility !== 'official_only';
    if (seenByOthers && target.section.visibility === 'official_only') {
      const who = from.field?.fieldKey ?? `section:${from.section!.key}`;
      if (!hiddenReported.has(who)) {
        hiddenReported.add(who);
        issues.push({
          code: 'form.reference_hidden',
          path,
          params: { fieldKey: from.field?.fieldKey ?? from.section!.key, reference: key },
        });
      }
    }
    return target;
  };

  // a comparison of two answers: both must be of one kind (numbers with numbers, texts with texts)
  const checkComparisons = (condition: Condition, fieldKey: string, path: (string | number)[]) => {
    for (const simple of simpleConditions(condition)) {
      if (!isFieldRef(simple.value)) continue;
      const left = fields.get(simple.field);
      const right = fields.get(simple.value.field);
      if (!left || !right) continue;
      const a = comparedKind(left.field);
      const b = comparedKind(right.field);
      if (a !== null && b !== null && a !== b)
        issues.push({ code: 'form.comparison_type', path, params: { fieldKey } });
    }
  };
  // an expression or a condition stays inside the size limits
  const checkSize = (node: Expr | Condition, fieldKey: string, path: (string | number)[]) => {
    if (withinLimits(node)) return true;
    issues.push({ code: 'form.expression_too_large', path, params: { fieldKey } });
    return false;
  };

  // the edges along which one field's value or visibility needs another's: a show-if, the
  // section's condition, and a calculation's inputs
  const edges = new Map<string, Set<string>>();
  const edge = (from: string, to: string) => {
    let set = edges.get(from);
    if (!set) edges.set(from, (set = new Set()));
    set.add(to);
  };

  definition.sections.forEach((section, si) => {
    if (section.condition) {
      const path = ['sections', si, 'condition'];
      if (!checkSize(section.condition, section.key, path)) return;
      for (const key of conditionFields(section.condition)) {
        if (checkReference({ group: null, section }, key, path))
          for (const field of section.fields) edge(field.fieldKey, key);
      }
      checkComparisons(section.condition, section.key, path);
    }
  });

  for (const located of fields.values()) {
    const { field } = located;
    if (located.group !== null) {
      const group = fields.get(located.group);
      const valid =
        group !== undefined &&
        group.field.type === 'repeat_group' &&
        group.sectionIndex === located.sectionIndex &&
        field.type !== 'repeat_group';
      if (!valid)
        issues.push({
          code: 'form.repeat_group_invalid',
          path: fieldPath(located, 'settings', 'repeat', 'group'),
          params: { fieldKey: field.fieldKey },
        });
    }
    if (field.type !== 'calculation' && field.calculation !== undefined)
      issues.push({
        code: 'form.calculation_misplaced',
        path: fieldPath(located, 'calculation'),
        params: { fieldKey: field.fieldKey },
      });
    if (field.type === 'calculation' && field.calculation === undefined && options.publishing)
      issues.push({
        code: 'form.calculation_missing',
        path: fieldPath(located, 'calculation'),
        params: { fieldKey: field.fieldKey },
      });
    if (field.options !== undefined && field.options.length > 0 && !isChoiceType(field.type))
      issues.push({
        code: 'form.options_misplaced',
        path: fieldPath(located, 'options'),
        params: { fieldKey: field.fieldKey },
      });
    const results = field.settings?.results;
    if (results !== undefined && results.length > 0) {
      if (field.type !== 'calculation')
        issues.push({
          code: 'form.result_misplaced',
          path: fieldPath(located, 'settings', 'results'),
          params: { fieldKey: field.fieldKey },
        });
      const resultCodes = new Set<string>();
      results.forEach((result, ri) => {
        if (resultCodes.has(result.code))
          issues.push({
            code: 'form.duplicate_key',
            path: fieldPath(located, 'settings', 'results', ri, 'code'),
            params: { key: result.code },
          });
        resultCodes.add(result.code);
      });
    }

    // a number table holds its own rows and columns, unique and few enough, outside any group
    const table = field.settings?.table;
    if (field.type === 'number_table' || table !== undefined) {
      const keys = (list: { key: string }[]) => list.map((item) => item.key);
      const unique = (list: string[]) => new Set(list).size === list.length;
      const valid =
        field.type === 'number_table' &&
        table !== undefined &&
        located.group === null &&
        table.rows.length > 0 &&
        table.cols.length > 0 &&
        unique(keys(table.rows)) &&
        unique(keys(table.cols)) &&
        ![...keys(table.rows), ...keys(table.cols)].some((k) => RESERVED_KEYS.has(k)) &&
        table.rows.length * table.cols.length <= TABLE_CELLS_MAX;
      if (!valid)
        issues.push({
          code: 'form.table_invalid',
          path: fieldPath(located, 'settings', 'table'),
          params: { fieldKey: field.fieldKey },
        });
    }

    // a default of the question's kind; a read-only question takes its value from somewhere
    const start = field.settings?.default;
    if (start !== undefined) {
      if (!defaultFits(field, start))
        issues.push({
          code: 'form.default_misplaced',
          path: fieldPath(located, 'settings', 'default'),
          params: { fieldKey: field.fieldKey },
        });
    }
    if (
      field.settings?.read_only === true &&
      field.type !== 'calculation' &&
      (start === undefined || located.group !== null)
    )
      issues.push({
        code: 'form.read_only_invalid',
        path: fieldPath(located, 'settings', 'read_only'),
        params: { fieldKey: field.fieldKey },
      });

    // a group's rows may follow an earlier whole-number question, capped within the rows
    const countFrom = field.settings?.repeat?.count_from;
    if (countFrom !== undefined && field.type === 'repeat_group') {
      const path = fieldPath(located, 'settings', 'repeat', 'count_from');
      const source = checkReference(located, countFrom, path);
      if (source) {
        const { min, max } = validationOf(source.field);
        const rowsMax = Math.min(
          field.settings?.repeat?.max_rows ?? COUNTED_ROWS_MAX,
          COUNTED_ROWS_MAX,
        );
        const valid =
          source.field.type === 'number' &&
          source.group === null &&
          before(source, located) &&
          min !== undefined &&
          min >= 0 &&
          max !== undefined &&
          max <= rowsMax;
        if (!valid)
          issues.push({
            code: 'form.repeat_count_invalid',
            path,
            params: { fieldKey: field.fieldKey },
          });
      }
    }

    // a piped text names an earlier answer
    const texts = [
      field.label.bn,
      field.label.en,
      field.settings?.help?.bn ?? '',
      field.settings?.help?.en ?? '',
    ];
    const piped = [...new Set(texts.flatMap(pipeKeys))];
    let outOfOrder = false;
    for (const key of piped) {
      const source = checkReference(located, key, fieldPath(located, 'label'));
      if (source && !before(source, located)) outOfOrder = true;
    }
    if (outOfOrder)
      issues.push({
        code: 'form.pipe_order',
        path: fieldPath(located, 'label'),
        params: { fieldKey: field.fieldKey },
      });

    const logicConditions = [
      ['show_if', field.logic?.show_if],
      ['required_if', field.logic?.required_if],
    ] as const;
    for (const [kind, condition] of logicConditions) {
      if (!condition) continue;
      const path = fieldPath(located, 'logic', kind);
      if (!checkSize(condition, field.fieldKey, path)) continue;
      for (const key of conditionFields(condition))
        if (checkReference(located, key, path) && kind === 'show_if') edge(field.fieldKey, key);
      checkComparisons(condition, field.fieldKey, path);
    }

    const dependsOn = field.logic?.options_depend_on;
    if (dependsOn !== undefined) {
      const parent = checkReference(
        located,
        dependsOn,
        fieldPath(located, 'logic', 'options_depend_on'),
      );
      if (parent) {
        const parentIsSelect =
          parent.field.type === 'single_select' || parent.field.type === 'radio';
        const parentCodes = new Set((parent.field.options ?? []).map((o) => o.code));
        if (!parentIsSelect || parent.sectionIndex > located.sectionIndex)
          issues.push({
            code: 'form.option_dependency',
            path: fieldPath(located, 'logic', 'options_depend_on'),
            params: { fieldKey: field.fieldKey, reference: dependsOn },
          });
        else
          (field.options ?? []).forEach((option, oi) => {
            if (
              typeof option.dependsOnOptionCode === 'string' &&
              !parentCodes.has(option.dependsOnOptionCode)
            )
              issues.push({
                code: 'form.option_dependency',
                path: fieldPath(located, 'options', oi, 'dependsOnOptionCode'),
                params: { fieldKey: field.fieldKey, reference: option.dependsOnOptionCode },
              });
          });
      }
    } else
      (field.options ?? []).forEach((option, oi) => {
        if (typeof option.dependsOnOptionCode === 'string')
          issues.push({
            code: 'form.option_dependency',
            path: fieldPath(located, 'options', oi, 'dependsOnOptionCode'),
            params: { fieldKey: field.fieldKey, reference: option.dependsOnOptionCode },
          });
      });

    if (
      field.calculation &&
      checkSize(field.calculation.expr, field.fieldKey, fieldPath(located, 'calculation', 'expr'))
    ) {
      const path = fieldPath(located, 'calculation', 'expr');
      const refs = exprReferences(field.calculation.expr);
      for (const key of refs.fields)
        if (checkReference(located, key, path)) edge(field.fieldKey, key);
      for (const condition of refs.conditions) checkComparisons(condition, field.fieldKey, path);
      for (const cell of refs.cells) {
        const table = fields.get(cell.field)?.field;
        const known =
          table?.type === 'number_table' &&
          (table.settings?.table?.rows ?? []).some((r) => r.key === cell.row) &&
          (table.settings?.table?.cols ?? []).some((c) => c.key === cell.col);
        if (table && !known)
          issues.push({
            code: 'form.unknown_reference',
            path,
            params: { reference: `${cell.field}.${cell.row}.${cell.col}` },
          });
      }
      const listed = new Set((field.settings?.results ?? []).map((r) => r.code));
      if (refs.results.some((code) => !listed.has(code)))
        issues.push({ code: 'form.result_unknown', path, params: { fieldKey: field.fieldKey } });
      for (const count of refs.counts) {
        const group = fields.get(count.group);
        if (!group || group.field.type !== 'repeat_group') {
          issues.push({ code: 'form.unknown_reference', path, params: { reference: count.group } });
          continue;
        }
        checkReference(located, count.group, path);
        edge(field.fieldKey, count.group);
        if (!count.where) continue;
        for (const key of conditionFields(count.where))
          if (checkReference({ ...located, group: count.group }, key, path))
            edge(field.fieldKey, key);
        checkComparisons(count.where, field.fieldKey, path);
      }
      for (const sum of refs.sums) {
        const group = fields.get(sum.group);
        if (!group || group.field.type !== 'repeat_group') {
          issues.push({ code: 'form.unknown_reference', path, params: { reference: sum.group } });
          continue;
        }
        const member = fields.get(sum.field);
        if (!member) {
          issues.push({ code: 'form.unknown_reference', path, params: { reference: sum.field } });
          continue;
        }
        if (member.group !== sum.group) {
          issues.push({ code: 'form.repeat_reference', path, params: { reference: sum.field } });
          continue;
        }
        checkReference(located, sum.group, path);
        edge(field.fieldKey, sum.field);
        edge(field.fieldKey, sum.group);
      }
    }
  }

  // a cycle: a value or a visibility that needs itself through any chain
  const state = new Map<string, 'open' | 'done'>();
  const reported = new Set<string>();
  const walk = (key: string, trail: string[]) => {
    const seen = state.get(key);
    if (seen === 'done') return;
    if (seen === 'open') {
      const cycle = trail.slice(trail.indexOf(key));
      const anchor = cycle.find((k) => !reported.has(k));
      if (anchor === undefined) return;
      for (const k of cycle) reported.add(k);
      const through = cycle.some((k) => fields.get(k)?.field.type === 'calculation');
      const located = fields.get(anchor)!;
      issues.push({
        code: through ? 'form.calculation_cycle' : 'form.condition_cycle',
        path: fieldPath(located, through && located.field.calculation ? 'calculation' : 'logic'),
        params: { fieldKey: anchor, cycle: cycle.join(' > ') },
      });
      return;
    }
    state.set(key, 'open');
    for (const next of edges.get(key) ?? []) walk(next, [...trail, key]);
    state.set(key, 'done');
  };
  for (const key of fields.keys()) walk(key, []);

  // a field fills a column of the allowlist only, and no column is filled twice: once across the
  // plain fields of the version, once inside each repeat group (its rows are separate records)
  const filled = new Map<string, Set<string>>();
  const memberCounts = new Map<string, number>();
  for (const located of fields.values()) {
    const { field } = located;
    if (located.group !== null)
      memberCounts.set(located.group, (memberCounts.get(located.group) ?? 0) + 1);
    const column = field.standardColumn;
    if (column === null || column === undefined) continue;
    const allowed =
      field.type === 'repeat_group'
        ? column === FAMILY_MEMBERS_TABLE
        : located.group === null
          ? isStandardColumn(column)
          : isFamilyMemberColumn(column);
    if (!allowed) {
      issues.push({
        code: 'form.standard_column_unknown',
        path: fieldPath(located, 'standardColumn'),
        params: { fieldKey: field.fieldKey, column },
      });
      continue;
    }
    // several groups may fill the family-member table, each with rows of its own
    if (field.type === 'repeat_group') continue;
    const scope = located.group ?? '';
    let columns = filled.get(scope);
    if (!columns) filled.set(scope, (columns = new Set()));
    if (columns.has(column))
      issues.push({
        code: 'form.standard_column_duplicate',
        path: fieldPath(located, 'standardColumn'),
        params: { fieldKey: field.fieldKey, column },
      });
    columns.add(column);
  }
  for (const [group, count] of memberCounts) {
    const located = fields.get(group);
    if (located && count > DEFINITION_LIMITS.membersPerGroup)
      issues.push({
        code: 'form.repeat_group_too_large',
        path: fieldPath(located),
        params: { fieldKey: group, max: String(DEFINITION_LIMITS.membersPerGroup) },
      });
  }

  // the points of the priority score at publish: on choices and numbers outside repeat groups,
  // on options the question has, and never more than 100 in all
  if (options.publishing) {
    for (const located of fields.values()) {
      const { field } = located;
      const score = field.settings?.score;
      if (!score) continue;
      const kind = scoreKindOf(field.type);
      const misplaced =
        kind === null ||
        located.group !== null ||
        (kind === 'options' && score.ranges !== undefined) ||
        (kind === 'ranges' && score.options !== undefined);
      if (misplaced) {
        issues.push({
          code: 'form.score_misplaced',
          path: fieldPath(located, 'settings', 'score'),
          params: { fieldKey: field.fieldKey },
        });
        continue;
      }
      if (
        (score.ranges ?? []).some(
          (r) => r.min !== undefined && r.max !== undefined && r.min > r.max,
        )
      )
        issues.push({
          code: 'form.score_range_invalid',
          path: fieldPath(located, 'settings', 'score', 'ranges'),
          params: { fieldKey: field.fieldKey },
        });
      const known = new Set((field.options ?? []).map((o) => o.code));
      if (Object.keys(score.options ?? {}).some((code) => !known.has(code)))
        issues.push({
          code: 'form.score_option_unknown',
          path: fieldPath(located, 'settings', 'score', 'options'),
          params: { fieldKey: field.fieldKey },
        });
    }
    if (maxScoreOf(definition) > MAX_SCORE)
      issues.push({ code: 'form.score_over_max', path: ['scoring'], params: { max: '100' } });
  }

  // the identity of an application form at publish: each role marked once, by the question's
  // column under any key, of the role's type, required and seen by everyone
  if (!options.publishing || options.kind !== 'beneficiary_application') return issues;
  const marked = new Map<string, LocatedField>();
  for (const located of fields.values()) {
    const role = identityRoleOf(located.field);
    if (role && !marked.has(role)) marked.set(role, located);
  }
  for (const core of CORE_FIELDS) {
    const located = marked.get(core.key);
    if (!located) {
      issues.push({
        code: 'form.core_field_missing',
        path: ['sections'],
        params: { fieldKey: core.key, role: core.key },
      });
      continue;
    }
    const { field, section } = located;
    if (field.type !== core.type)
      issues.push({
        code: 'form.core_field_shape',
        path: fieldPath(located, 'type'),
        params: { fieldKey: field.fieldKey, role: core.key },
      });
    if (!field.required)
      issues.push({
        code: 'form.core_field_optional',
        path: fieldPath(located, 'required'),
        params: { fieldKey: field.fieldKey, role: core.key },
      });
    const hidden =
      section.visibility === 'official_only' ||
      (section.condition !== null && section.condition !== undefined) ||
      field.logic?.show_if !== undefined ||
      located.group !== null;
    if (hidden)
      issues.push({
        code: 'form.core_field_hidden',
        path: fieldPath(located),
        params: { fieldKey: field.fieldKey, role: core.key },
      });
  }

  return issues;
}

const definitionSchema = (publishing: boolean, kind?: FormKind): z.ZodType<FormDefinition> =>
  z
    .strictObject({
      sections: z.array(formSectionSchema).min(1).max(DEFINITION_LIMITS.sections),
      scoring: formScoringSchema.optional(),
    })
    .superRefine((definition, ctx) => {
      for (const issue of checkDefinition(definition, { publishing, ...(kind ? { kind } : {}) }))
        ctx.addIssue({
          code: 'custom',
          message: issue.code,
          path: issue.path,
          params: { code: issue.code, ...issue.params },
        });
    });

/** The full definition schema of a draft: the shape, then every check of `checkDefinition`. */
export const formDefinitionSchema: z.ZodType<FormDefinition> = definitionSchema(false);
/**
 * The same at publish, where a calculated question must have its rule and an application form its
 * identity questions.
 */
export const publishDefinitionSchema = (kind: FormKind): z.ZodType<FormDefinition> =>
  definitionSchema(true, kind);

export type { Condition, Expr, FieldType, SectionVisibility };
