import { describe, expect, it } from 'vitest';
import { APPLICATION_ACTION_NAMES, leadInOf } from './actions.js';

// The step an action passes first: sending a submitted application for approval starts its review
// on the way; from any other state, and for every other action, nothing comes first.
describe('the move an action makes first', () => {
  it('starts the review when a submitted application is sent for approval', () => {
    expect(leadInOf('send_for_approval', 'submitted')).toBe('review');
  });

  it('makes no move first once the review runs, or from a state the action never leaves', () => {
    expect(leadInOf('send_for_approval', 'under_review')).toBeNull();
    expect(leadInOf('send_for_approval', 'draft')).toBeNull();
  });

  it('makes no move first for any other action', () => {
    for (const action of APPLICATION_ACTION_NAMES.filter((a) => a !== 'send_for_approval'))
      expect(leadInOf(action, 'submitted')).toBeNull();
  });
});
