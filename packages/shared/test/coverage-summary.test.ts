import { describe, expect, it } from 'vitest';
import { coverageByPackage, renderCoverageTable } from '../../../scripts/lib/coverage-summary.mjs';

// The coverage table of CI's job summary on develop (docs/testing/TEST_STRATEGY.md, section
// "Coverage expectations"): Vitest's json-summary grouped by package folder. Fixture numbers only.
const file = (lines: [number, number], branches: [number, number]) => ({
  lines: { total: lines[0], covered: lines[1] },
  branches: { total: branches[0], covered: branches[1] },
});

describe('the coverage per package', () => {
  it('sums the files of each package and leaves out the total and files outside the packages', () => {
    const rows = coverageByPackage(
      {
        total: file([999, 999], [999, 999]),
        '/repo/apps/web/src/a.tsx': file([10, 5], [4, 1]),
        '/repo/apps/web/src/b/c.ts': file([30, 25], [0, 0]),
        '/repo/packages/shared/src/x.ts': file([20, 20], [10, 9]),
        '/repo/scripts/lib/y.mjs': file([5, 0], [1, 0]),
      },
      '/repo',
    );
    expect(rows).toEqual([
      {
        name: 'apps/web',
        files: 2,
        lines: { total: 40, covered: 30 },
        branches: { total: 4, covered: 1 },
      },
      {
        name: 'packages/shared',
        files: 1,
        lines: { total: 20, covered: 20 },
        branches: { total: 10, covered: 9 },
      },
    ]);
  });

  it('reads the paths of a Windows machine too', () => {
    const rows = coverageByPackage(
      { 'D:\\repo\\apps\\api\\src\\app.ts': file([4, 3], [2, 2]) },
      'D:\\repo\\',
    );
    expect(rows.map((r) => r.name)).toEqual(['apps/api']);
  });

  it('writes a table with the percentages and the counts, and a dash where nothing is counted', () => {
    const table = renderCoverageTable([
      {
        name: 'apps/api',
        files: 3,
        lines: { total: 200, covered: 150 },
        branches: { total: 0, covered: 0 },
      },
    ]);
    expect(table).toContain('| Package | Files | Lines | Branches |');
    expect(table).toContain('| apps/api | 3 | 75.0 % (150 of 200) | — (0 of 0) |');
  });
});
