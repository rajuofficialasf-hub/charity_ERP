import type { Condition } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { conditionFromRows, rowsFromCondition } from './logic-rows';

describe('condition rows', () => {
  it('reads nothing as an empty list, and writes an empty list as no condition', () => {
    expect(rowsFromCondition(undefined)).toEqual({ kind: 'rows', join: 'all', rows: [] });
    expect(rowsFromCondition(null)).toEqual({ kind: 'rows', join: 'all', rows: [] });
    expect(conditionFromRows({ join: 'all', rows: [] })).toBeUndefined();
  });

  it('reads one comparison as one row and writes it back as the same comparison', () => {
    for (const op of [
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'not_in',
      'is_empty',
      'not_empty',
    ] as const) {
      const condition: Condition =
        op === 'is_empty' || op === 'not_empty'
          ? { field: 'has_loan', op }
          : { field: 'has_loan', op, value: op === 'in' || op === 'not_in' ? ['yes'] : 'yes' };
      const rows = rowsFromCondition(condition);
      expect(rows).toEqual({ kind: 'rows', join: 'all', rows: [condition] });
      if (rows.kind === 'rows') expect(conditionFromRows(rows)).toEqual(condition);
    }
  });

  it('reads "all" and "any" of comparisons as rows and writes them back', () => {
    const any: Condition = {
      any: [
        { field: 'occupation', op: 'eq', value: 'business' },
        { field: 'members_14_plus', op: 'gt', value: 4 },
      ],
    };
    const rows = rowsFromCondition(any);
    expect(rows).toMatchObject({ kind: 'rows', join: 'any' });
    if (rows.kind === 'rows') expect(conditionFromRows(rows)).toEqual(any);
    const all: Condition = { all: any.any };
    const allRows = rowsFromCondition(all);
    if (allRows.kind === 'rows') expect(conditionFromRows(allRows)).toEqual(all);
  });

  it('writes an "all" of one row as that comparison alone', () => {
    expect(rowsFromCondition({ all: [{ field: 'a', op: 'eq', value: 1 }] })).toEqual({
      kind: 'rows',
      join: 'all',
      rows: [{ field: 'a', op: 'eq', value: 1 }],
    });
    expect(conditionFromRows({ join: 'any', rows: [{ field: 'a', op: 'eq', value: 1 }] })).toEqual({
      field: 'a',
      op: 'eq',
      value: 1,
    });
  });

  it('marks a nested or negated condition as not editable here', () => {
    expect(rowsFromCondition({ not: { field: 'a', op: 'eq', value: 1 } })).toEqual({
      kind: 'complex',
    });
    expect(
      rowsFromCondition({
        all: [{ field: 'a', op: 'eq', value: 1 }, { any: [{ field: 'b', op: 'eq', value: 2 }] }],
      }),
    ).toEqual({ kind: 'complex' });
  });
});
