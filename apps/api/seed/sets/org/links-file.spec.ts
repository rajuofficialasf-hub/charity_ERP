import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { staffListOf } from '../../run.js';
import { linksDestination, linksFileText, removeLinksFile, writeLinksFile } from './links-file.js';

// The file that carries the set-password links, and the stop before any write when the staff list
// has a problem. Every row here is made up.
const LINKS = [
  {
    jobId: 'T-1',
    name: 'Test Head',
    roleKey: 'department_head',
    link: 'http://127.0.0.1:3000/invite#token-one',
    expiresAt: '2026-11-25T06:00:00.000Z',
  },
  {
    jobId: 'T-2',
    name: 'Test PM',
    roleKey: 'program_manager',
    link: 'http://127.0.0.1:3000/invite#token-two',
    expiresAt: '2026-11-25T06:00:00.000Z',
  },
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'org-links-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the links file', () => {
  it('holds a header and one tab-separated line per official, with nothing beyond job ID, name, role, link and expiry', () => {
    expect(linksFileText(LINKS)).toBe(
      [
        'job_id\tname\trole\tlink\texpires_at',
        'T-1\tTest Head\tdepartment_head\thttp://127.0.0.1:3000/invite#token-one\t2026-11-25T06:00:00.000Z',
        'T-2\tTest PM\tprogram_manager\thttp://127.0.0.1:3000/invite#token-two\t2026-11-25T06:00:00.000Z',
        '',
      ].join('\n'),
    );
  });

  it('is written new and never over another file', () => {
    const path = join(dir, 'invitations.tsv');
    writeLinksFile(path, LINKS);
    expect(readFileSync(path, 'utf8')).toBe(linksFileText(LINKS));
    expect(() => writeLinksFile(path, LINKS)).toThrow(/EEXIST/);
  });

  it.runIf(process.platform === 'win32')('is readable by the current user alone on Windows', () => {
    const path = join(dir, 'invitations.tsv');
    writeLinksFile(path, LINKS);
    const acl = execFileSync('icacls', [path], { encoding: 'utf8' });
    const entries = acl
      .split(/\r?\n/)
      .map((l) => l.replace(path, '').trim())
      .filter((l) => l.includes(':(') || l.includes(':F'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain(userInfo().username);
  });

  it('is removed after a failed run, and a missing file is no error', () => {
    const path = join(dir, 'invitations.tsv');
    writeLinksFile(path, LINKS);
    removeLinksFile(path);
    expect(() => readFileSync(path)).toThrow(/ENOENT/);
    expect(() => removeLinksFile(path)).not.toThrow();
  });
});

describe('where the links go', () => {
  it('writes a new file beside the list, or nothing when the officials open with the demo password', () => {
    const list = join(dir, 'staff.tsv');
    const now = new Date(2026, 10, 22, 9, 5, 7);
    const none = linksDestination(list, now, true);
    expect(none.linksPath).toBeNull();
    none.writeLinks(LINKS);
    expect(readdirSync(dir)).toEqual([]);
    const file = linksDestination(list, now, false);
    expect(file.linksPath).toBe(join(dir, 'invitations-20261122-090507.tsv'));
    file.writeLinks(LINKS);
    expect(readFileSync(file.linksPath!, 'utf8')).toBe(linksFileText(LINKS));
  });
});

describe('a staff list with a problem', () => {
  it('stops the run before anything is written, naming the line and column only', () => {
    const list = join(dir, 'staff.csv');
    writeFileSync(
      list,
      'job_id,name,mobile,email,designation,role,program,supervisor_job_id\nT-1,Secret Name,,secret@example.test,X,Chief,,\n',
    );
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(' '));
    try {
      expect(() => staffListOf(list)).toThrow(/1 problem\(s\); nothing was written/);
    } finally {
      console.error = original;
    }
    expect(errors).toEqual(['  line 2, role: unknown']);
  });
});
