import { describe, expect, it } from 'vitest';
import { partKindOf, startPart, withArg } from './calc-tree';

// The parts of a calculation as the editor shows them: every earlier shape opens as parts, and a
// new part starts from what the form offers.
describe('the parts of a calculation', () => {
  it('opens every earlier shape as parts', () => {
    expect(partKindOf({ op: 'add', args: [{ field: 'a' }, 1] })).toBe('math');
    expect(partKindOf({ op: 'mul', args: [{ field: 'a' }, { field: 'b' }] })).toBe('math');
    expect(partKindOf({ op: 'age_from_dob', args: [{ field: 'dob' }] })).toBe('age');
    expect(
      partKindOf({ op: 'compare_gte', args: [{ field: 'net' }, { setting: 'nisab_value' }] }),
    ).toBe('nisab');
    expect(partKindOf({ sum_repeat: { group: 'g', field: 'f' } })).toBe('sum');
    expect(partKindOf(5)).toBe('number');
    expect(partKindOf({ field: 'a' })).toBe('field');
  });

  it('reads the new parts', () => {
    expect(
      partKindOf({ if: [{ when: { field: 'a', op: 'gt', value: 0 }, then: 1 }], else: 0 }),
    ).toBe('if');
    expect(partKindOf({ result: 'low' })).toBe('result');
    expect(partKindOf({ count_rows: { group: 'g' } })).toBe('count');
    expect(partKindOf({ cell: { field: 't', row: 'r', col: 'c' } })).toBe('cell');
  });

  it('starts a part from the first thing the form offers, and none when it offers nothing', () => {
    expect(startPart('if', { condition: 'gold_karat' })).toEqual({
      if: [{ when: { field: 'gold_karat', op: 'not_empty' }, then: 0 }],
      else: 0,
    });
    expect(startPart('if', {})).toBeNull();
    expect(startPart('math', {})).toEqual({ op: 'add', args: [0] });
    expect(startPart('field', { field: 'cash' })).toEqual({ field: 'cash' });
    expect(startPart('cell', {})).toBeNull();
  });

  it('replaces or removes one part of a sum, keeping at least one', () => {
    const sum = { op: 'add' as const, args: [{ field: 'a' }, { field: 'b' }] };
    expect(withArg(sum, 1, 3)).toEqual({ op: 'add', args: [{ field: 'a' }, 3] });
    expect(withArg(sum, 0, null)).toEqual({ op: 'add', args: [{ field: 'b' }] });
    expect(withArg({ op: 'add', args: [1] }, 0, null)).toEqual({ op: 'add', args: [0] });
  });
});
