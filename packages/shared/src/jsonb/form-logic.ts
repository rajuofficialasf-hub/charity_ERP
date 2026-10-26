import { z } from 'zod';
import { code64, looseLabel, snakeKey } from './common.js';

// form_fields.logic / calculation / settings and form_sections.condition
// (docs/database/json-schemas/form-field-logic.schema.json). Evaluated by the shared form
// evaluator on the device and on the server (BR-076, written with the form engine in T2.3).

export type Condition =
  | { field: string; op: ConditionOp; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };
export type ConditionOp =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'is_empty' | 'not_empty';

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({
      field: snakeKey,
      op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'is_empty', 'not_empty']),
      // a fixed value, or exactly `{ field }` naming the answer to compare with
      value: z
        .unknown()
        .optional()
        .refine(
          (value) =>
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value) ||
            z.strictObject({ field: snakeKey }).safeParse(value).success,
          { message: 'form.unknown_reference' },
        ),
    }),
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
  ]),
);

/** A condition's value that names another answer or calculation instead of a fixed value. */
export interface FieldRef {
  field: string;
}

/** Whether a condition's value names another answer. */
export function isFieldRef(value: unknown): value is FieldRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { field?: unknown }).field === 'string'
  );
}

export type Expr =
  | number
  | { field: string }
  | { sum_repeat: { group: string; field: string } }
  | { setting: 'nisab_value' }
  | {
      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' | 'age_from_dob' | 'compare_gte';
      args: Expr[];
    }
  /** The first branch whose condition holds, else the last value ("যদি … তবে … নইলে"). */
  | { if: { when: Condition; then: Expr }[]; else: Expr }
  /** A text result: one of the question's own results, by code. */
  | { result: string }
  /** The rows of a repeat group, or only those meeting the condition read inside each row. */
  | { count_rows: { group: string; where?: Condition } }
  /** One cell of a number table, by its row and column keys. */
  | { cell: { field: string; row: string; col: string } };

/** How large an expression may grow, conditions inside it included. */
export const EXPRESSION_LIMITS = { depth: 20, parts: 500 } as const;

export const exprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.number(),
    z.strictObject({ field: snakeKey }),
    z.strictObject({ sum_repeat: z.looseObject({ group: snakeKey, field: snakeKey }) }),
    z.strictObject({ setting: z.literal('nisab_value') }),
    z.strictObject({
      op: z.enum(['add', 'sub', 'mul', 'div', 'min', 'max', 'age_from_dob', 'compare_gte']),
      args: z.array(exprSchema).min(1),
    }),
    z.strictObject({
      if: z
        .array(z.strictObject({ when: conditionSchema, then: exprSchema }))
        .min(1)
        .max(EXPRESSION_LIMITS.depth),
      else: exprSchema,
    }),
    z.strictObject({ result: code64 }),
    z.strictObject({
      count_rows: z.strictObject({ group: snakeKey, where: conditionSchema.optional() }),
    }),
    z.strictObject({ cell: z.strictObject({ field: snakeKey, row: snakeKey, col: snakeKey }) }),
  ]),
);

/** The depth and the number of parts of an expression or a condition, conditions included. */
export function logicSize(node: Expr | Condition): { depth: number; parts: number } {
  let children: (Expr | Condition)[] = [];
  if (typeof node !== 'number') {
    if ('all' in node) children = node.all;
    else if ('any' in node) children = node.any;
    else if ('not' in node) children = [node.not];
    else if ('args' in node) children = node.args;
    else if ('if' in node) children = [...node.if.flatMap((b) => [b.when, b.then]), node.else];
    else if ('count_rows' in node && node.count_rows.where) children = [node.count_rows.where];
  }
  let depth = 0;
  // a comparison with another answer reads two answers
  let parts = typeof node === 'object' && 'value' in node && isFieldRef(node.value) ? 2 : 1;
  for (const child of children) {
    const size = logicSize(child);
    depth = Math.max(depth, size.depth);
    parts += size.parts;
  }
  return { depth: depth + 1, parts };
}

/** Whether an expression or a condition stays inside the size limits. */
export function withinLimits(node: Expr | Condition): boolean {
  const size = logicSize(node);
  return size.depth <= EXPRESSION_LIMITS.depth && size.parts <= EXPRESSION_LIMITS.parts;
}

export const validationSchema = z.strictObject({
  min: z.number().optional(),
  max: z.number().optional(),
  min_length: z.int().min(0).optional(),
  max_length: z.int().min(1).optional(),
  pattern: z.string().optional(),
  message_key: z.string().optional(),
});

/** form_fields.logic */
export const fieldLogicSchema = z.strictObject({
  show_if: conditionSchema.optional(),
  required_if: conditionSchema.optional(),
  options_depend_on: z.string().optional(),
  validation: validationSchema.optional(),
});

/** form_fields.calculation */
export const calculationSchema = z.strictObject({
  expr: exprSchema,
  round: z.int().min(0).max(4).optional(),
});

/** form_fields.settings */
export const fieldSettingsSchema = z.strictObject({
  placeholder: looseLabel.optional(),
  help: looseLabel.optional(),
  default: z.unknown().optional(),
  read_only: z.boolean().optional(),
  table: z
    .looseObject({
      rows: z.array(z.looseObject({ key: snakeKey, label: looseLabel })),
      cols: z.array(z.looseObject({ key: snakeKey, label: looseLabel })),
    })
    .optional(),
  /** The text results a calculation may give, each a code with its label in both languages. */
  results: z
    .array(z.looseObject({ code: code64, label: looseLabel }))
    .max(50)
    .optional(),
  validation: validationSchema.optional(),
  repeat: z
    .looseObject({
      min_rows: z.int().min(0).optional(),
      max_rows: z.int().min(1).optional(),
      earner: z.boolean().optional(),
    })
    .optional(),
});
