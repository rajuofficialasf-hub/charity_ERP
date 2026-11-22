import { staffCreateRequestSchema } from '@css/shared/auth';
import { toEnglishDigits } from '@css/shared';
import { parseCsvLines } from '../../../src/locations/csv.js';

/**
 * Reads the department's own volunteer list (name and mobile), a file kept outside the repository
 * like the staff list. The whole list is checked before anything is written; a problem names the
 * line, the column and the reason, never the cell's value.
 */

export const VOLUNTEER_LIST_COLUMNS = ['name', 'mobile'] as const;
type Column = (typeof VOLUNTEER_LIST_COLUMNS)[number];

export interface VolunteerListRow {
  /** The line of the file the row starts on, counting the header as line 1. */
  line: number;
  name: string;
  mobile: string;
}

export type VolunteerListReason =
  'missing_column' | 'no_rows' | 'required' | 'format' | 'duplicate' | 'official';

export interface VolunteerListProblem {
  line: number;
  field: Column;
  reason: VolunteerListReason;
}

const mobileRule = staffCreateRequestSchema.shape.mobile.unwrap();
const oneLine = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

/** A mobile as typed: English digits, no spaces or dashes, and the leading zero a sheet drops. */
function mobileOf(raw: string): string {
  const digits = toEnglishDigits(raw).replace(/[\s-]/g, '');
  return /^1[3-9][0-9]{8}$/.test(digits) ? `0${digits}` : digits;
}

/** The volunteers of the list, or every problem; `officialMobiles` are the staff list's mobiles. */
export function readVolunteerList(
  text: string,
  officialMobiles: readonly string[],
): { rows: VolunteerListRow[]; problems: VolunteerListProblem[] } {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const [headerRow, ...dataRows] = parseCsvLines(text, firstLine.includes('\t') ? '\t' : ',');
  const header = (headerRow?.cells ?? []).map(oneLine);
  const headerLine = headerRow?.line ?? 1;
  const missing = VOLUNTEER_LIST_COLUMNS.filter((c) => !header.includes(c)).map(
    (field): VolunteerListProblem => ({ line: headerLine, field, reason: 'missing_column' }),
  );
  if (missing.length) return { rows: [], problems: missing };
  if (dataRows.length === 0)
    return { rows: [], problems: [{ line: headerLine + 1, field: 'name', reason: 'no_rows' }] };

  const officials = new Set(officialMobiles);
  const seen = new Set<string>();
  const rows: VolunteerListRow[] = [];
  const problems: VolunteerListProblem[] = [];
  for (const { line, cells } of dataRows) {
    const cell = (c: Column) => oneLine(cells.at(header.indexOf(c)) ?? '');
    const name = cell('name');
    if (!name) problems.push({ line, field: 'name', reason: 'required' });
    const mobile = mobileOf(cell('mobile'));
    if (!mobileRule.safeParse(mobile).success)
      problems.push({ line, field: 'mobile', reason: 'format' });
    else if (seen.has(mobile)) problems.push({ line, field: 'mobile', reason: 'duplicate' });
    else if (officials.has(mobile)) problems.push({ line, field: 'mobile', reason: 'official' });
    seen.add(mobile);
    rows.push({ line, name, mobile });
  }
  return problems.length ? { rows: [], problems } : { rows, problems };
}
