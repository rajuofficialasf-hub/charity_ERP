import { describe, expect, it } from 'vitest';
import { guardianRelationToFill } from './guardian-relation.js';

describe('what an application writes of whose name stands beside the person', () => {
  it('gives its answer to a profile that holds none', () => {
    expect(guardianRelationToFill(null, 'husband')).toBe('husband');
    expect(guardianRelationToFill(undefined, 'father')).toBe('father');
  });

  it('never changes a relation the profile holds, whatever the answer', () => {
    expect(guardianRelationToFill('father', 'husband')).toBeNull();
    expect(guardianRelationToFill('father', 'father')).toBeNull();
  });

  it('writes nothing for an empty answer', () => {
    for (const none of [null, undefined, '', '  '])
      expect(guardianRelationToFill(null, none)).toBeNull();
  });
});
