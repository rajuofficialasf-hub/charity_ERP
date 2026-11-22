import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSeedArgs } from '../../run.js';
import { checkOrgTarget, linksFileName } from './target.js';

// Where the org set may run and read from: the local development database only, and a list kept
// outside the repository.
const REPO = join('D:', 'repo');
const OUTSIDE = join('D:', 'own-data', 'staff.tsv');
const env = (url: string) => ({ DATABASE_URL: url });
const DEV = 'postgresql://localhost:5433/css_erp_dev';

describe('checkOrgTarget', () => {
  it('accepts the local development database and a list outside the repository', () => {
    expect(checkOrgTarget(env(DEV), REPO, OUTSIDE)).toBeNull();
    expect(
      checkOrgTarget(env('postgresql://127.0.0.1:5433/css_erp_dev'), REPO, OUTSIDE),
    ).toBeNull();
  });

  it('refuses a test database, a non-local host and production', () => {
    expect(checkOrgTarget(env('postgresql://localhost:5433/css_erp_test'), REPO, OUTSIDE)).toMatch(
      /css_erp_dev/,
    );
    expect(
      checkOrgTarget(env('postgresql://db.example.org:5432/css_erp_dev'), REPO, OUTSIDE),
    ).toMatch(/this computer/);
    expect(checkOrgTarget({ ...env(DEV), NODE_ENV: 'production' }, REPO, OUTSIDE)).toMatch(
      /production/,
    );
  });

  it('refuses a list inside the repository', () => {
    expect(checkOrgTarget(env(DEV), REPO, join(REPO, 'docs', 'staff.tsv'))).toMatch(
      /outside the repository/,
    );
    expect(checkOrgTarget(env(DEV), REPO, REPO)).toMatch(/outside the repository/);
    // a folder whose name starts with two dots is still inside
    expect(checkOrgTarget(env(DEV), REPO, join(REPO, '..data', 'staff.tsv'))).toMatch(
      /outside the repository/,
    );
  });

  it('names a new links file beside the list by date and time to the second', () => {
    expect(linksFileName(OUTSIDE, new Date(2026, 10, 22, 9, 5, 7))).toBe(
      join('D:', 'own-data', 'invitations-20261122-090507.tsv'),
    );
  });
});

describe('parseSeedArgs', () => {
  it('runs the base set before the org set and needs the list', () => {
    expect(parseSeedArgs(['--set', 'org', '--file', OUTSIDE])).toEqual({
      sets: ['base', 'org'],
      file: OUTSIDE,
    });
    expect(() => parseSeedArgs(['--set', 'org'])).toThrow(/--file/);
  });

  it('keeps the earlier sets as they were', () => {
    expect(parseSeedArgs([])).toEqual({ sets: ['base', 'demo'], file: null });
    expect(parseSeedArgs(['--set', 'base'])).toEqual({ sets: ['base'], file: null });
    expect(parseSeedArgs(['--set', 'demo'])).toEqual({ sets: ['base', 'demo'], file: null });
  });
});
