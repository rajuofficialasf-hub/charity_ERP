import { fakeMobile } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { readVolunteerList } from './volunteer-file.js';

// Every name and mobile here is made up: the reserved fake mobiles and sample names; the
// department's real list stays outside the repository.
const ONE = fakeMobile(901);
const TWO = fakeMobile(902);
const list = (...rows: string[]) => ['name,mobile', ...rows].join('\n');

describe('readVolunteerList', () => {
  it('gives the name and mobile of each volunteer, with the line of the file', () => {
    expect(readVolunteerList(list(`Sample One,${ONE}`, `Sample Two,${TWO}`), [])).toEqual({
      rows: [
        { line: 2, name: 'Sample One', mobile: ONE },
        { line: 3, name: 'Sample Two', mobile: TWO },
      ],
      problems: [],
    });
  });

  it('reads a mobile written without its leading zero, and one with spaces or dashes', () => {
    const { rows, problems } = readVolunteerList(
      list(
        `Sample One,${ONE.slice(1)}`,
        `Sample Two,${TWO.slice(0, 5)}-${TWO.slice(5, 8)} ${TWO.slice(8)}`,
      ),
      [],
    );
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.mobile)).toEqual([ONE, TWO]);
  });

  it('reads a tab-separated list like a comma-separated one', () => {
    const tabbed = list(`Sample One,${ONE}`).replace(/,/g, '\t');
    expect(readVolunteerList(tabbed, []).rows).toEqual([
      { line: 2, name: 'Sample One', mobile: ONE },
    ]);
  });

  it('reports every problem at once by line and column, never with the value, and keeps no row', () => {
    const { rows, problems } = readVolunteerList(
      list(
        `,${ONE}`,
        'Sample Bad,12345',
        `Sample Twice,${TWO}`,
        `Sample Again,${TWO}`,
        `Sample Official,${fakeMobile(903)}`,
      ),
      [fakeMobile(903)],
    );
    expect(rows).toEqual([]);
    expect(problems).toEqual([
      { line: 2, field: 'name', reason: 'required' },
      { line: 3, field: 'mobile', reason: 'format' },
      { line: 5, field: 'mobile', reason: 'duplicate' },
      { line: 6, field: 'mobile', reason: 'official' },
    ]);
    expect(JSON.stringify(problems)).not.toContain('12345');
  });

  it('refuses a list without its columns or without rows', () => {
    expect(readVolunteerList('volunteer,phone\nA,1', []).problems).toEqual([
      { line: 1, field: 'name', reason: 'missing_column' },
      { line: 1, field: 'mobile', reason: 'missing_column' },
    ]);
    expect(readVolunteerList('name,mobile', []).problems).toEqual([
      { line: 2, field: 'name', reason: 'no_rows' },
    ]);
  });
});
