import { describe, expect, it } from 'vitest';
import { definition, field, section } from '../../../test/forms';
import { dropTarget, SECTION_DROP, TYPE_DRAG, typeFromDragId } from './drop-target';

const def = definition(
  section('one', [
    field('a', 'number'),
    field('g', 'repeat_group'),
    field('m', 'short_text', { settings: { repeat: { group: 'g' } } }),
    field('b', 'number'),
  ]),
  section('two', []),
);

describe('the place a drop lands', () => {
  it('is the end of a section dropped on, counted so the clamp lands after the last block', () => {
    expect(dropTarget(def, `${SECTION_DROP}one`)).toEqual({ sectionKey: 'one', index: 4 });
    expect(dropTarget(def, `${SECTION_DROP}two`)).toEqual({ sectionKey: 'two', index: 0 });
  });

  it('is the block of the question dropped on, members not counting', () => {
    expect(dropTarget(def, 'a')).toEqual({ sectionKey: 'one', index: 0 });
    expect(dropTarget(def, 'g')).toEqual({ sectionKey: 'one', index: 1 });
    expect(dropTarget(def, 'b')).toEqual({ sectionKey: 'one', index: 2 });
  });

  it('is nothing for an id the form does not know', () => {
    expect(dropTarget(def, 'zzz')).toBeNull();
    expect(dropTarget(def, `${SECTION_DROP}nine`)).toBeNull();
  });

  it('reads a type from its drag id and nothing from a question', () => {
    expect(typeFromDragId(`${TYPE_DRAG}money`)).toBe('money');
    expect(typeFromDragId(`${TYPE_DRAG}nope`)).toBeUndefined();
    expect(typeFromDragId('a')).toBeUndefined();
  });
});
