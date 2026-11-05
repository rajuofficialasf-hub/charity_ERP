import { describe, expect, it } from 'vitest';
import { stateTone } from './status';

// The colour of a state: green for the approved ones, red for a refusal, grey for a draft and the
// information colour for every state still on its way; the office's chips use the same rule.
describe('the tone of a state', () => {
  it('colours each state by where it stands', () => {
    expect(stateTone('approved')).toBe('success');
    expect(stateTone('completed')).toBe('success');
    expect(stateTone('rejected')).toBe('error');
    expect(stateTone('draft')).toBe('neutral');
    expect(stateTone('under_review')).toBe('info');
    expect(stateTone('a_state_not_known_yet')).toBe('info');
  });
});
