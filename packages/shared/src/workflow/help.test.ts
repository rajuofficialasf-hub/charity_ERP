import { describe, expect, it } from 'vitest';
import { APPLICATION_STATES } from './actions.js';
import {
  countsAsHelped,
  HELP_BY_STATE,
  HELPED_IF_DELIVERED_STATES,
  HELPED_STATES,
  helpSummary,
  type HelpApplication,
} from './help.js';

const approvedAt = '2026-01-10T04:00:00.000Z';
const app = (over: Partial<HelpApplication> = {}): HelpApplication => ({
  status: 'approved',
  approvedAt,
  outcome: null,
  projectId: 'p1',
  year: 2026,
  ...over,
});

describe('whether an application counts as help', () => {
  it('classifies every application state', () => {
    expect(Object.keys(HELP_BY_STATE).sort()).toEqual([...APPLICATION_STATES].sort());
    expect(HELPED_STATES).toEqual(['approved', 'implementation', 'completed']);
    expect(HELPED_IF_DELIVERED_STATES).toEqual(['closed']);
  });

  it('counts the approval and the states after it', () => {
    for (const status of ['approved', 'implementation', 'completed'])
      expect(countsAsHelped(app({ status })), status).toBe(true);
  });

  it('counts nothing for a draft, a waiting, a waitlisted, a rejected or a deleted application', () => {
    for (const status of [
      'draft',
      'needs_verification',
      'submitted',
      'under_review',
      'reviewed',
      'waitlisted',
      'rejected',
      'deleted',
    ])
      expect(countsAsHelped(app({ status, approvedAt: null })), status).toBe(false);
  });

  it('counts a closed application only when it was approved before the close and delivered', () => {
    expect(countsAsHelped(app({ status: 'closed' }))).toBe(true);
    expect(countsAsHelped(app({ status: 'closed', outcome: 'distributed' }))).toBe(true);
    // a draft or a waiting application closed with its project
    expect(countsAsHelped(app({ status: 'closed', approvedAt: null }))).toBe(false);
    for (const outcome of ['not_distributed', 'not_built', 'not_installed', 'not_supported'])
      expect(countsAsHelped(app({ status: 'closed', outcome })), outcome).toBe(false);
  });

  it('counts nothing for a state no workflow names', () => {
    expect(countsAsHelped(app({ status: 'archived' }))).toBe(false);
    // nor for a name every object carries
    expect(countsAsHelped(app({ status: 'constructor' }))).toBe(false);
  });
});

describe('the summary of a person’s help', () => {
  it('is empty for a person never helped', () => {
    expect(helpSummary([app({ status: 'rejected' }), app({ status: 'draft' })], 2026)).toEqual({
      total: 0,
      firstYear: null,
      thisYear: 0,
      years: [],
      repeatedInYear: false,
      repeatedInProject: false,
    });
  });

  it('counts the total, the first year, this year and each year newest first', () => {
    const summary = helpSummary(
      [
        app({ projectId: 'winter-24', year: 2024 }),
        app({ projectId: 'iftar-26', year: 2026 }),
        app({ projectId: 'winter-26', year: 2026, status: 'completed' }),
        app({ projectId: 'meat-25', year: 2025, status: 'waitlisted', approvedAt: null }),
        app({ projectId: 'flood-25', year: 2025, status: 'rejected', approvedAt: null }),
      ],
      2026,
    );
    expect(summary).toMatchObject({ total: 3, firstYear: 2024, thisYear: 2 });
    expect(summary.years).toEqual([
      {
        year: 2026,
        count: 2,
        projects: [
          { projectId: 'iftar-26', count: 1 },
          { projectId: 'winter-26', count: 1 },
        ],
      },
      { year: 2024, count: 1, projects: [{ projectId: 'winter-24', count: 1 }] },
    ]);
    expect(summary.repeatedInYear).toBe(true);
    expect(summary.repeatedInProject).toBe(false);
  });

  it('marks twice in one project', () => {
    const summary = helpSummary([app(), app({ status: 'implementation' })], 2027);
    expect(summary).toMatchObject({
      total: 2,
      thisYear: 0,
      repeatedInYear: true,
      repeatedInProject: true,
    });
    expect(summary.years[0]!.projects).toEqual([{ projectId: 'p1', count: 2 }]);
  });

  it('marks nothing for one help a year', () => {
    const summary = helpSummary(
      [app({ year: 2025, projectId: 'a' }), app({ projectId: 'b' })],
      2026,
    );
    expect(summary).toMatchObject({ total: 2, repeatedInYear: false, repeatedInProject: false });
  });
});
