import { z } from 'zod';
import { looseLabel, snakeKey } from './common.js';

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
      value: z.unknown().optional(),
    }),
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
  ]),
);

export type Expr =
  | number
  | { field: string }
  | { sum_repeat: { group: string; field: string } }
  | { setting: 'nisab_value' }
  | {
      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' | 'age_from_dob' | 'compare_gte';
      args: Expr[];
    };

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
  ]),
);

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
  validation: validationSchema.optional(),
  repeat: z
    .looseObject({
      min_rows: z.int().min(0).optional(),
      max_rows: z.int().min(1).optional(),
      earner: z.boolean().optional(),
    })
    .optional(),
});
