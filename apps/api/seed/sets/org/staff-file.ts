import { jobIdSchema, staffCreateRequestSchema } from '@css/shared/auth';
import { toEnglishDigits } from '@css/shared';
import { parseCsvLines } from '../../../src/locations/csv.js';

/**
 * Reads the department's own staff list, a file kept outside the repository so that no real name,
 * email or mobile is ever committed (docs/DECISION_LOG.md, section "Owner decisions", the entry on
 * the org seed set). The whole list is checked before anything is written; a problem names the
 * line, the column and the reason, never the cell's value, so a real email or mobile never reaches
 * a terminal or a log.
 */

/** The columns of the list, in the order of the template. */
export const STAFF_LIST_COLUMNS = [
  'job_id',
  'name',
  'mobile',
  'email',
  'designation',
  'role',
  'program',
  'supervisor_job_id',
] as const;
type Column = (typeof STAFF_LIST_COLUMNS)[number];

/** The names a role or a program may be written with: its key or code, English and Bengali names. */
export interface StaffListNames {
  roles: { key: string; names: string[] }[];
  programs: { code: string; names: string[] }[];
}

export interface StaffListRow {
  /** The line of the file the row starts on, counting the header as line 1. */
  line: number;
  jobId: string;
  name: string;
  mobile: string | null;
  email: string;
  designation: string;
  roleKey: string;
  programCode: string | null;
  supervisorJobId: string | null;
}

export type StaffListReason =
  | 'missing_column'
  | 'no_rows'
  | 'required'
  | 'format'
  | 'duplicate'
  | 'unknown'
  | 'self'
  | 'cycle'
  | 'second_department_head'
  | 'required_for_program_manager'
  | 'second_program_manager';

export interface StaffListProblem {
  line: number;
  field: Column;
  reason: StaffListReason;
}

const emailRule = staffCreateRequestSchema.shape.email;
const mobileRule = staffCreateRequestSchema.shape.mobile.unwrap();
const oneLine = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();
const lookupKey = (value: string) => oneLine(value).toLowerCase();

/**
 * A role or program as written in the list, matched by key, code or either name. Two entries that
 * share a name would make the match depend on their order, so that stops the run.
 */
function matcher<T>(entries: { value: T; names: string[] }[]) {
  const byName = new Map<string, T>();
  for (const e of entries)
    for (const n of e.names) {
      const key = lookupKey(n);
      if (byName.has(key) && byName.get(key) !== e.value)
        throw new Error(`staff list: two entries share the name "${n}"`);
      byName.set(key, e.value);
    }
  return (written: string) => byName.get(lookupKey(written));
}

export function readStaffList(
  text: string,
  names: StaffListNames,
): { rows: StaffListRow[]; problems: StaffListProblem[] } {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const [headerRow, ...dataRows] = parseCsvLines(text, firstLine.includes('\t') ? '\t' : ',');
  // a header cell copied with a stray space still names its column
  const header = (headerRow?.cells ?? []).map(oneLine);
  const headerLine = headerRow?.line ?? 1;
  const headerProblems = STAFF_LIST_COLUMNS.filter((c) => !header.includes(c)).map(
    (field): StaffListProblem => ({ line: headerLine, field, reason: 'missing_column' }),
  );
  if (headerProblems.length) return { rows: [], problems: headerProblems };
  if (dataRows.length === 0)
    return { rows: [], problems: [{ line: headerLine + 1, field: 'job_id', reason: 'no_rows' }] };

  const roleOf = matcher(names.roles.map((r) => ({ value: r.key, names: [r.key, ...r.names] })));
  const programOf = matcher(
    names.programs.map((p) => ({ value: p.code, names: [p.code, ...p.names] })),
  );
  const problems: StaffListProblem[] = [];
  const rows: StaffListRow[] = [];
  const add = (line: number, field: Column, reason: StaffListReason) =>
    problems.push({ line, field, reason });

  for (const { line, cells } of dataRows) {
    const cell = (c: Column) => oneLine(cells.at(header.indexOf(c)) ?? '');
    const name = cell('name');
    if (!name) add(line, 'name', 'required');

    const job = jobIdSchema.safeParse(cell('job_id'));
    if (!job.success) add(line, 'job_id', 'format');

    const rawMobile = toEnglishDigits(cell('mobile')).replace(/[\s-]/g, '');
    const mobile = rawMobile ? mobileRule.safeParse(rawMobile) : null;
    if (mobile && !mobile.success) add(line, 'mobile', 'format');

    const email = emailRule.safeParse(cell('email'));
    if (!email.success) add(line, 'email', 'format');

    const roleKey = roleOf(cell('role'));
    if (!roleKey) add(line, 'role', 'unknown');

    const writtenProgram = cell('program');
    const programCode = writtenProgram ? programOf(writtenProgram) : null;
    if (programCode === undefined) add(line, 'program', 'unknown');

    const supervisor = cell('supervisor_job_id');
    const supervisorJobId = supervisor ? jobIdSchema.safeParse(supervisor) : null;
    if (supervisorJobId && !supervisorJobId.success) add(line, 'supervisor_job_id', 'format');

    rows.push({
      line,
      jobId: job.success ? job.data : '',
      name,
      mobile: mobile?.success ? mobile.data : null,
      email: email.success ? email.data : '',
      designation: cell('designation'),
      roleKey: roleKey ?? '',
      programCode: programCode ?? null,
      supervisorJobId: supervisorJobId?.success ? supervisorJobId.data : null,
    });
  }

  // checks across the rows: each key once, the supervisors on the list, one Department Head
  const reportDuplicates = (key: (r: StaffListRow) => string | null, field: Column) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const value = key(r);
      if (!value) continue;
      if (seen.has(value)) add(r.line, field, 'duplicate');
      seen.add(value);
    }
  };
  reportDuplicates((r) => r.jobId, 'job_id');
  reportDuplicates((r) => r.email, 'email');
  reportDuplicates((r) => r.mobile, 'mobile');
  const supervisorOf = new Map(rows.map((r) => [r.jobId, r.supervisorJobId]));
  let heads = 0;
  const programManagers = new Set<string>();
  for (const r of rows) {
    if (r.supervisorJobId === r.jobId && r.jobId) add(r.line, 'supervisor_job_id', 'self');
    else if (r.supervisorJobId && !supervisorOf.has(r.supervisorJobId))
      add(r.line, 'supervisor_job_id', 'unknown');
    else if (r.supervisorJobId && leadsBackTo(r.jobId, r.supervisorJobId, supervisorOf))
      add(r.line, 'supervisor_job_id', 'cycle');
    if (r.roleKey === 'department_head' && ++heads > 1)
      add(r.line, 'role', 'second_department_head');
    if (
      r.roleKey === 'program_manager' &&
      !r.programCode &&
      !problemAt(problems, r.line, 'program')
    )
      add(r.line, 'program', 'required_for_program_manager');
    // a program has one PM; a second would leave the program's PM to the order of the list
    if (r.roleKey === 'program_manager' && r.programCode) {
      if (programManagers.has(r.programCode)) add(r.line, 'program', 'second_program_manager');
      programManagers.add(r.programCode);
    }
  }

  problems.sort((a, b) => a.line - b.line);
  return problems.length ? { rows: [], problems } : { rows, problems };
}

const problemAt = (problems: StaffListProblem[], line: number, field: Column) =>
  problems.some((p) => p.line === line && p.field === field);

/** Whether following the supervisors up from `start` comes back to `jobId` (an organogram loop). */
function leadsBackTo(
  jobId: string,
  start: string,
  supervisorOf: Map<string, string | null>,
): boolean {
  const seen = new Set<string>();
  for (let next: string | null = start; next; next = supervisorOf.get(next) ?? null) {
    if (next === jobId) return true;
    if (seen.has(next)) return false;
    seen.add(next);
  }
  return false;
}
