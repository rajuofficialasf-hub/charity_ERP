import { jobIdSchema, staffCreateRequestSchema } from '@css/shared/auth';
import { toEnglishDigits } from '@css/shared';
import { parseCsvRecords } from '../../../src/locations/csv.js';

/**
 * Reads the department's own staff list, a file kept outside the repository so that no real name,
 * email or mobile is ever committed (docs/DECISION_LOG.md, the org seed set). The whole list is
 * checked before anything is written; a problem names the line, the column and the reason, never
 * the cell's value, so a real email or mobile never reaches a terminal or a log.
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
  /** The line of the file, counting the header as line 1. */
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
  | 'required'
  | 'format'
  | 'duplicate'
  | 'unknown'
  | 'self'
  | 'second_department_head'
  | 'required_for_program_manager';

export interface StaffListProblem {
  line: number;
  field: Column;
  reason: StaffListReason;
}

const emailRule = staffCreateRequestSchema.shape.email;
const mobileRule = staffCreateRequestSchema.shape.mobile.unwrap();
const oneLine = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();
const lookupKey = (value: string) => oneLine(value).toLowerCase();

/** A role or program as written in the list, matched by key, code or either name. */
function matcher<T>(entries: { value: T; names: string[] }[]) {
  const byName = new Map<string, T>();
  for (const e of entries) for (const n of e.names) byName.set(lookupKey(n), e.value);
  return (written: string) => byName.get(lookupKey(written));
}

export function readStaffList(
  text: string,
  names: StaffListNames,
): { rows: StaffListRow[]; problems: StaffListProblem[] } {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const records = parseCsvRecords(text, firstLine.includes('\t') ? '\t' : ',');
  const header = new Set(Object.keys(records[0] ?? {}).map(oneLine));
  const headerProblems = STAFF_LIST_COLUMNS.filter((c) => !header.has(c)).map(
    (field): StaffListProblem => ({ line: 1, field, reason: 'missing_column' }),
  );
  if (headerProblems.length) return { rows: [], problems: headerProblems };

  const roleOf = matcher(names.roles.map((r) => ({ value: r.key, names: [r.key, ...r.names] })));
  const programOf = matcher(
    names.programs.map((p) => ({ value: p.code, names: [p.code, ...p.names] })),
  );
  const problems: StaffListProblem[] = [];
  const rows: StaffListRow[] = [];
  const add = (line: number, field: Column, reason: StaffListReason) =>
    problems.push({ line, field, reason });

  records.forEach((record, index) => {
    const line = index + 2;
    const cell = (c: Column) => oneLine(record[c] ?? '');
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
  });

  // checks across the rows: each key once, the supervisors on the list, one Department Head
  const firstLineOf = (key: (r: StaffListRow) => string | null, field: Column) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const value = key(r);
      if (!value) continue;
      if (seen.has(value)) add(r.line, field, 'duplicate');
      seen.add(value);
    }
  };
  firstLineOf((r) => r.jobId, 'job_id');
  firstLineOf((r) => r.email, 'email');
  firstLineOf((r) => r.mobile, 'mobile');
  const jobIds = new Set(rows.map((r) => r.jobId).filter(Boolean));
  let heads = 0;
  for (const r of rows) {
    if (r.supervisorJobId === r.jobId && r.jobId) add(r.line, 'supervisor_job_id', 'self');
    else if (r.supervisorJobId && !jobIds.has(r.supervisorJobId))
      add(r.line, 'supervisor_job_id', 'unknown');
    if (r.roleKey === 'department_head' && ++heads > 1)
      add(r.line, 'role', 'second_department_head');
    if (
      r.roleKey === 'program_manager' &&
      !r.programCode &&
      !problemAt(problems, r.line, 'program')
    )
      add(r.line, 'program', 'required_for_program_manager');
  }

  problems.sort((a, b) => a.line - b.line);
  return problems.length ? { rows: [], problems } : { rows, problems };
}

const problemAt = (problems: StaffListProblem[], line: number, field: Column) =>
  problems.some((p) => p.line === line && p.field === field);
