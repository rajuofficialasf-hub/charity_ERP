import { describe, expect, it } from 'vitest';
import { badgeToneOf } from '../../admin/applications/state-tone';
import { stateTone } from './status';

// The colour of a state: green for the approved ones, red for a refusal, grey for a draft and the
// information colour for every state still on its way; the office's badges use the same rule.
describe('the tone of a state', () => {
  it('colours each state by where it stands', () => {
    expect(stateTone('approved')).toBe('success');
    expect(stateTone('completed')).toBe('success');
    expect(stateTone('rejected')).toBe('error');
    expect(stateTone('draft')).toBe('neutral');
    expect(stateTone('under_review')).toBe('info');
    expect(stateTone('a_state_not_known_yet')).toBe('info');
  });

  it('gives the office the same colours in the words of its badge', () => {
    expect(badgeToneOf('closed')).toBe('success');
    expect(badgeToneOf('rejected')).toBe('danger');
    expect(badgeToneOf('draft')).toBe('neutral');
    expect(badgeToneOf('waitlisted')).toBe('info');
  });
});
