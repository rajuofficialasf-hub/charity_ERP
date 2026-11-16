import { describe, expect, it } from 'vitest';
import { definition, field, section } from '../../../test/forms';
import { moveFieldTo } from './draft';
import {
  type Box,
  dropTarget,
  halfByOrder,
  pointed,
  SECTION_DROP,
  TYPE_DRAG,
  typeFromDragId,
} from './drop-target';

const def = definition(
  section('one', [
    field('a', 'number'),
    field('g', 'repeat_group'),
    field('m', 'short_text', { settings: { repeat: { group: 'g' } } }),
    field('b', 'number'),
  ]),
  section('two', []),
);
/** The questions of a section after a move, in order. */
const order = (next: typeof def, key: string) =>
  next.sections.find((s) => s.key === key)!.fields.map((f) => f.fieldKey);

describe('the place a drop lands', () => {
  it('is the end of a section dropped on, the dragged question not counting', () => {
    expect(dropTarget(def, `${SECTION_DROP}one`)).toEqual({ sectionKey: 'one', index: 3 });
    expect(dropTarget(def, `${SECTION_DROP}one`, 'before', 'a')).toEqual({
      sectionKey: 'one',
      index: 2,
    });
    expect(dropTarget(def, `${SECTION_DROP}two`)).toEqual({ sectionKey: 'two', index: 0 });
  });

  it('is before a question dropped on its upper half and after it on its lower half, members not counting', () => {
    expect(dropTarget(def, 'a', 'before')).toEqual({
      sectionKey: 'one',
      index: 0,
      at: { fieldKey: 'a', half: 'before' },
    });
    expect(dropTarget(def, 'a', 'after')).toEqual({
      sectionKey: 'one',
      index: 1,
      at: { fieldKey: 'a', half: 'after' },
    });
    // after a list means after its row questions too
    expect(dropTarget(def, 'g', 'after')?.index).toBe(2);
    expect(dropTarget(def, 'b', 'before')?.index).toBe(2);
    expect(dropTarget(def, 'b', 'after')?.index).toBe(3);
  });

  it('counts the places without the dragged question, so the move puts it where the line is', () => {
    // the first question on the lower half of the last: after it
    const down = dropTarget(def, 'b', 'after', 'a')!;
    expect(down).toMatchObject({ sectionKey: 'one', index: 2 });
    expect(order(moveFieldTo(def, 'a', down.sectionKey, down.index), 'one')).toEqual([
      'g',
      'm',
      'b',
      'a',
    ]);
    // the last question on the upper half of the list: before it
    const up = dropTarget(def, 'g', 'before', 'b')!;
    expect(up).toMatchObject({ sectionKey: 'one', index: 1 });
    expect(order(moveFieldTo(def, 'b', up.sectionKey, up.index), 'one')).toEqual([
      'a',
      'b',
      'g',
      'm',
    ]);
    // a question of another section lands between the two it was dropped between
    const across = dropTarget(def, 'a', 'after', 'village')!;
    expect(order(moveFieldTo(def, 'village', across.sectionKey, across.index), 'one')).toEqual([
      'a',
      'village',
      'g',
      'm',
      'b',
    ]);
  });

  it('is nothing for a question dropped on itself, which stays', () => {
    expect(dropTarget(def, 'a', 'after', 'a')).toBeNull();
  });

  it('is nothing for an id the form does not know', () => {
    expect(dropTarget(def, 'zzz')).toBeNull();
    expect(dropTarget(def, `${SECTION_DROP}nine`)).toBeNull();
    // a row question of a list is no place to drop on
    expect(dropTarget(def, 'm')).toBeNull();
  });

  it('reads a type from its drag id and nothing from a question', () => {
    expect(typeFromDragId(`${TYPE_DRAG}money`)).toBe('money');
    expect(typeFromDragId(`${TYPE_DRAG}nope`)).toBeUndefined();
    expect(typeFromDragId('a')).toBeUndefined();
  });
});

describe('what the pointer is over', () => {
  const box = (top: number, bottom: number, left = 0, right = 300): Box => ({
    top,
    bottom,
    left,
    right,
  });
  // the first section's card with its three blocks, and the empty second one under it
  const boxes = new Map<string, Box>([
    [`${SECTION_DROP}one`, box(0, 400)],
    ['a', box(40, 100, 10, 290)],
    ['g', box(110, 250, 10, 290)],
    ['b', box(260, 320, 10, 290)],
    [`${SECTION_DROP}two`, box(420, 500)],
  ]);
  const at = (y: number, x = 150) => pointed({ x, y }, boxes);

  it('is the question under it: its upper half lands before it, its lower half after it', () => {
    expect(at(60)).toEqual({ id: 'a', half: 'before' });
    expect(at(80)).toEqual({ id: 'a', half: 'after' });
    expect(at(120)).toEqual({ id: 'g', half: 'before' });
    expect(at(240)).toEqual({ id: 'g', half: 'after' });
  });

  it('is the next question down in the gap between two and above the first', () => {
    expect(at(105)).toEqual({ id: 'g', half: 'before' });
    expect(at(10)).toEqual({ id: 'a', half: 'before' });
    // beside a question, inside the card's padding
    expect(at(60, 5)).toEqual({ id: 'a', half: 'before' });
  });

  it("is the section's end under its last question, and in a section with no question", () => {
    expect(at(360)).toEqual({ id: `${SECTION_DROP}one` });
    expect(at(450)).toEqual({ id: `${SECTION_DROP}two` });
  });

  it('is nothing between the sections and beside them', () => {
    expect(at(410)).toBeNull();
    expect(at(60, 400)).toBeNull();
  });

  it('lands a question after the one whose lower half it is dropped on, before the one whose upper half, and at the end of a section dropped under its last question', () => {
    const land = (dragged: string, y: number) => {
      const over = at(y)!;
      const target = dropTarget(def, over.id, over.half, dragged)!;
      return order(moveFieldTo(def, dragged, target.sectionKey, target.index), target.sectionKey);
    };
    expect(land('a', 300)).toEqual(['g', 'm', 'b', 'a']);
    expect(land('b', 50)).toEqual(['b', 'a', 'g', 'm']);
    expect(land('a', 360)).toEqual(['g', 'm', 'b', 'a']);
    expect(land('a', 450)).toEqual(['a']);
  });
});

describe('the side a keyboard move lands on', () => {
  it('is after a question further down the same section, and before any other', () => {
    expect(halfByOrder(def, 'a', 'b')).toBe('after');
    expect(halfByOrder(def, 'b', 'a')).toBe('before');
    expect(halfByOrder(def, 'village', 'a')).toBe('before');
    expect(halfByOrder(def, 'a', 'village')).toBe('before');
  });
});
