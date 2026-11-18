import { describe, expect, it } from 'vitest';
import { sessionStage, STAGES } from './stage';

// The stage of a session on the summary's strip: its state, and while it runs its application
// window by the date in Dhaka.
const TODAY = '2026-11-18';

describe('the stage of a session', () => {
  it('lists the five stages in their order', () => {
    expect(STAGES).toEqual(['draft', 'open', 'ended', 'closing', 'closed']);
  });

  it.each([
    ['a draft', 'draft', null, 'draft'],
    ['an active session whose window has not opened yet', 'active', '2026-12-31', 'open'],
    ['an active session inside its window', 'active', '2026-11-30', 'open'],
    ['an active session on the window’s last day', 'active', TODAY, 'open'],
    ['an active session after its window', 'active', '2026-11-17', 'ended'],
    ['an active session without a window', 'active', null, 'open'],
    ['a closing session', 'closing', '2026-11-17', 'closing'],
    ['a closed session', 'closed', '2026-11-17', 'closed'],
    ['a reopened session after its window', 'active', '2026-10-01', 'ended'],
    ['a reopened session whose window was extended', 'active', '2027-01-15', 'open'],
  ] as const)('puts %s at its stage', (_, status, applyTo, stage) => {
    expect(sessionStage(status, applyTo, TODAY)).toBe(stage);
  });

  it('gives a cancelled session no stage', () => {
    expect(sessionStage('cancelled', '2026-12-31', TODAY)).toBeNull();
  });
});
