import type { Condition, ConditionOp } from '@css/shared';

/**
 * The condition editor shows a condition as rows (a field, a comparison and a value) joined by
 * "all of these" or "any of these", one level deep. These two functions turn the engine's
 * condition into rows and back; a condition the rows cannot express (a negation, a group inside a
 * group) comes back as not editable here, and the builder shows it read-only.
 */

export interface ConditionRow {
  field: string;
  op: ConditionOp;
  value?: unknown;
}

export interface ConditionRows {
  join: 'all' | 'any';
  rows: ConditionRow[];
}

export type ConditionView = ({ kind: 'rows' } & ConditionRows) | { kind: 'complex' };

const isRow = (c: Condition): c is ConditionRow => 'field' in c;

export function rowsFromCondition(condition: Condition | null | undefined): ConditionView {
  if (!condition) return { kind: 'rows', join: 'all', rows: [] };
  if (isRow(condition)) return { kind: 'rows', join: 'all', rows: [condition] };
  if ('all' in condition && condition.all.every(isRow))
    return { kind: 'rows', join: 'all', rows: condition.all };
  if ('any' in condition && condition.any.every(isRow))
    return { kind: 'rows', join: 'any', rows: condition.any };
  return { kind: 'complex' };
}

/** No rows give no condition; one row is that comparison alone. */
export function conditionFromRows({ join, rows }: ConditionRows): Condition | undefined {
  if (!rows.length) return undefined;
  if (rows.length === 1) return rows[0];
  return join === 'all' ? { all: rows } : { any: rows };
}
