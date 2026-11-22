import { describe, expect, it } from 'vitest';
import { AT_WORK_STATUSES, PROJECT_STATUSES } from './lifecycle.js';

// Which projects are at work (docs/BUSINESS_RULES.md, "An official sees the volunteers whose
// address lies in the areas they hold on projects at work").
describe('a project at work', () => {
  it('is active or closing: a draft, a closed and a cancelled project show nobody its volunteers', () => {
    const atWork = (status: (typeof PROJECT_STATUSES)[number]) => AT_WORK_STATUSES.includes(status);
    expect(PROJECT_STATUSES.filter(atWork)).toEqual(['active', 'closing']);
    for (const status of ['draft', 'closed', 'cancelled'] as const)
      expect(atWork(status), status).toBe(false);
  });
});
