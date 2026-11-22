import { describe, expect, it } from 'vitest';
import { readStaffList, type StaffListNames } from './staff-file.js';

// Every row here is made up: the department's real list stays outside the repository.
const NAMES: StaffListNames = {
  roles: [
    { key: 'admin', names: ['Admin', 'অ্যাডমিন'] },
    { key: 'department_head', names: ['Department Head', 'ডিপার্টমেন্ট হেড'] },
    { key: 'program_manager', names: ['Program Manager', 'প্রোগ্রাম ম্যানেজার'] },
    { key: 'project_executive', names: ['Project Executive', 'প্রজেক্ট এক্সিকিউটিভ'] },
  ],
  programs: [
    { code: 'UCD', names: ['Underprivileged Community Development Program', 'উন্নয়ন'] },
    { code: 'HUM', names: ['Humanitarian Program', 'মানবিক'] },
  ],
};

const HEADER = 'job_id,name,mobile,email,designation,role,program,supervisor_job_id';
const list = (...rows: string[]) => [HEADER, ...rows].join('\n');
const HEAD = 'T-1,Test Head,01700000901,head@example.test,Head,Department Head,,';
const PM = 'T-2,Test PM,01700000902,pm@example.test,PM,program_manager,UCD,T-1';
const EXEC = 'T-3,Test Executive,,exec@example.test,Executive,প্রজেক্ট এক্সিকিউটিভ,,T-2';

describe('readStaffList', () => {
  it('gives one row per official with the role key, program code and supervisor job ID', () => {
    const { rows, problems } = readStaffList(list(HEAD, PM, EXEC), NAMES);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        jobId: 'T-1',
        name: 'Test Head',
        mobile: '01700000901',
        email: 'head@example.test',
        designation: 'Head',
        roleKey: 'department_head',
        programCode: null,
        supervisorJobId: null,
      },
      {
        line: 3,
        jobId: 'T-2',
        name: 'Test PM',
        mobile: '01700000902',
        email: 'pm@example.test',
        designation: 'PM',
        roleKey: 'program_manager',
        programCode: 'UCD',
        supervisorJobId: 'T-1',
      },
      {
        line: 4,
        jobId: 'T-3',
        name: 'Test Executive',
        mobile: null,
        email: 'exec@example.test',
        designation: 'Executive',
        roleKey: 'project_executive',
        programCode: null,
        supervisorJobId: 'T-2',
      },
    ]);
  });

  it('matches a program by its code, English name or Bengali name, in any letter case', () => {
    const { rows, problems } = readStaffList(
      list(
        HEAD,
        'T-2,A,,a@example.test,PM,Program Manager,humanitarian program,T-1',
        'T-3,B,,b@example.test,PM,প্রোগ্রাম ম্যানেজার,উন্নয়ন,T-1',
        'T-4,C,,c@example.test,PM,program_manager,ucd,T-1',
      ),
      NAMES,
    );
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.programCode)).toEqual([null, 'HUM', 'UCD', 'UCD']);
  });

  it('cleans a mobile with dashes or spaces, an email with spaces and a name with doubled spaces', () => {
    const { rows, problems } = readStaffList(
      list(
        HEAD,
        'T-2, Test  Person ,0170-0000 902,  Person@Example.TEST ,PM,program_manager,UCD,T-1',
      ),
      NAMES,
    );
    expect(problems).toEqual([]);
    expect(rows[1]).toMatchObject({
      name: 'Test Person',
      mobile: '01700000902',
      email: 'person@example.test',
    });
  });

  it('reads a tab-separated list with a byte order mark like a comma-separated one', () => {
    const tabbed = '﻿' + list(HEAD, PM, EXEC).replace(/,/g, '\t');
    expect(readStaffList(tabbed, NAMES)).toEqual(readStaffList(list(HEAD, PM, EXEC), NAMES));
  });

  it('reports every problem of the list at once, by line and field, and keeps no row', () => {
    const { rows, problems } = readStaffList(
      list(
        HEAD,
        'T-1,Same Job ID,,x@example.test,X,project_executive,,',
        'bad id!,Bad Job ID,,y@example.test,X,project_executive,,T-1',
        'T-4,Bad Mobile,12345,z@example.test,X,project_executive,,T-1',
        'T-5,Bad Email,,not-an-email,X,project_executive,,T-1',
        'T-6,Unknown Role,,r@example.test,X,Chief,,T-1',
        'T-7,Unknown Program,,p@example.test,X,program_manager,XYZ,T-1',
        'T-8,Unknown Supervisor,,s@example.test,X,project_executive,,T-99',
        'T-9,Own Supervisor,,o@example.test,X,project_executive,,T-9',
        'T-10,Second Head,,h@example.test,X,department_head,,',
        'T-11,PM Without Program,,w@example.test,X,program_manager,,T-1',
        'T-12,Same Email,,head@example.test,X,project_executive,,T-1',
        'T-13,Same Mobile,01700000901,m@example.test,X,project_executive,,T-1',
        'T-14,,,n@example.test,X,project_executive,,T-1',
      ),
      NAMES,
    );
    expect(rows).toEqual([]);
    expect(problems).toEqual([
      { line: 3, field: 'job_id', reason: 'duplicate' },
      { line: 4, field: 'job_id', reason: 'format' },
      { line: 5, field: 'mobile', reason: 'format' },
      { line: 6, field: 'email', reason: 'format' },
      { line: 7, field: 'role', reason: 'unknown' },
      { line: 8, field: 'program', reason: 'unknown' },
      { line: 9, field: 'supervisor_job_id', reason: 'unknown' },
      { line: 10, field: 'supervisor_job_id', reason: 'self' },
      { line: 11, field: 'role', reason: 'second_department_head' },
      { line: 12, field: 'program', reason: 'required_for_program_manager' },
      { line: 13, field: 'email', reason: 'duplicate' },
      { line: 14, field: 'mobile', reason: 'duplicate' },
      { line: 15, field: 'name', reason: 'required' },
    ]);
  });

  it('never repeats a cell value in a problem', () => {
    const { problems } = readStaffList(
      list(HEAD, 'T-2,Secret Name,01799999999,secret@example.test,X,Chief,,T-1'),
      NAMES,
    );
    expect(problems).toHaveLength(1);
    const text = JSON.stringify(problems);
    for (const value of ['Secret Name', '01799999999', 'secret@example.test', 'Chief'])
      expect(text).not.toContain(value);
  });

  it('refuses a list without the expected columns', () => {
    expect(readStaffList('id,name\n1,Someone', NAMES).problems).toEqual([
      { line: 1, field: 'job_id', reason: 'missing_column' },
      { line: 1, field: 'mobile', reason: 'missing_column' },
      { line: 1, field: 'email', reason: 'missing_column' },
      { line: 1, field: 'designation', reason: 'missing_column' },
      { line: 1, field: 'role', reason: 'missing_column' },
      { line: 1, field: 'program', reason: 'missing_column' },
      { line: 1, field: 'supervisor_job_id', reason: 'missing_column' },
    ]);
  });
});
