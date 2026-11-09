import type { Condition, Expr } from '@css/shared';

/**
 * The calculation editor edits the engine's expression directly, one part at a time: each part is
 * a question, a number, a group's sum or row count, a table's cell, a text result, a ready rule
 * (age, nisab), a sum or product of further parts (a bracket when it sits inside another), or a
 * "যদি … তবে … নইলে" step. These functions say which kind a part is and what a part of a chosen
 * kind starts as.
 */

export const PART_KINDS = [
  'field',
  'number',
  'math',
  'if',
  'result',
  'sum',
  'count',
  'cell',
  'age',
  'nisab',
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** The operations a sum-or-product part joins its parts with. */
export const MATH_OPS = ['add', 'sub', 'mul', 'div', 'min', 'max'] as const;
export type MathOp = (typeof MATH_OPS)[number];

export function partKindOf(expr: Expr): PartKind {
  if (typeof expr === 'number') return 'number';
  if ('field' in expr) return 'field';
  if ('result' in expr) return 'result';
  if ('sum_repeat' in expr) return 'sum';
  if ('count_rows' in expr) return 'count';
  if ('cell' in expr) return 'cell';
  if ('if' in expr) return 'if';
  if ('setting' in expr) return 'nisab';
  if (expr.op === 'age_from_dob') return 'age';
  if (expr.op === 'compare_gte') return 'nisab';
  return 'math';
}

/** What the editor may start a part with: the first of each list the form offers. */
export interface PartStarts {
  field?: string;
  sum?: { group: string; field: string };
  group?: string;
  cell?: { field: string; row: string; col: string };
  result?: string;
  date?: string;
  net?: string;
  /** A question a new branch's condition starts with. */
  condition?: string;
}

/** A new part of a kind, or null when the form has nothing that kind can read. */
export function startPart(kind: PartKind, starts: PartStarts): Expr | null {
  switch (kind) {
    case 'number':
      return 0;
    case 'math':
      return { op: 'add', args: [0] };
    case 'field':
      return starts.field ? { field: starts.field } : null;
    case 'result':
      return starts.result ? { result: starts.result } : null;
    case 'sum':
      return starts.sum ? { sum_repeat: starts.sum } : null;
    case 'count':
      return starts.group ? { count_rows: { group: starts.group } } : null;
    case 'cell':
      return starts.cell ? { cell: starts.cell } : null;
    case 'age':
      return starts.date ? { op: 'age_from_dob', args: [{ field: starts.date }] } : null;
    case 'nisab':
      return starts.net
        ? { op: 'compare_gte', args: [{ field: starts.net }, { setting: 'nisab_value' }] }
        : null;
    case 'if': {
      const when = startCondition(starts);
      return when ? { if: [{ when, then: 0 }], else: 0 } : null;
    }
  }
}

/** A new branch's condition: the first question, answered. */
export function startCondition(starts: PartStarts): Condition | null {
  return starts.condition ? { field: starts.condition, op: 'not_empty' } : null;
}

/** The expression with one part of a sum or product replaced, or removed when `next` is null. */
export function withArg(expr: Expr, index: number, next: Expr | null): Expr {
  if (typeof expr !== 'object' || !('args' in expr)) return expr;
  const args =
    next === null
      ? expr.args.filter((_, i) => i !== index)
      : expr.args.map((arg, i) => (i === index ? next : arg));
  // a sum or product keeps at least one part
  return { ...expr, args: args.length ? args : [0] };
}
