import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parsePhaseMap,
  parseRegister,
  parseRules,
  problemsOf,
  renderReport,
  rulesStatus,
} from '../../../scripts/lib/rules-status.mjs';

// The untested-rules check of docs/BUSINESS_RULES.md (docs/testing/TEST_STRATEGY.md, section
// "How BUSINESS_RULES.md tracks test status"): every testable rule of a phase's modules has a
// register line that says tested, deferred or manual; the rest is untested. Fixture text only.
const RULES = `
## 1. Beneficiary identity and master (M05)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-001 | NID or birth registration is mandatory | B3 | BD-01 | M05 | beneficiaries | DB + service | integration | approved |
| BR-002 | Mobile may repeat | B3 | BD-01 | M05, M02 | beneficiaries | service | unit | approved |
| BR-003 | Ratings are proposed at close | A5 | BD-40 | M04 | volunteer_ratings | service | unit, API | approved |
| BR-004 | A locked field is unlocked once | A7 | BD-18 | M08 | applications | service | API | approved |
| BR-005 | Officials sign the hard copy | SOP | — | M02 | — | policy | integration | approved |
| BR-006 | Retired rule | — | — | M02 | — | — | none | retired |
| BR-007 | Audit entries hold actor and time | §13 | — | all | audit_log | service | integration | approved |
| BR-008 | English digits everywhere | UX-05 | — | UI | — | UI | unit | approved |
| BR-009 | A paper procedure | SOP | — | M02 | — | policy | manual | approved |
| BR-010 | A rule that needs no test | — | — | M02 | — | config | none | approved |

## 19. Test-status register

Every rule above starts with test status "not yet".

- BR-001: apps/api/test/integration/constraints.test.ts::refuses an application without an identity number — passing (2026-10-11)
- BR-003: deferred to T5.3 (feature not built: ratings)
- BR-005: manual (a paper procedure of the SOP)
- BR-007, BR-008: apps/api/test/integration/audit-idempotency.test.ts::records actor and time; packages/shared/src/format/format.test.ts::never prints Bengali digits — passing (2026-10-12)
- BR-002 (warning): apps/api/test/integration/missing.test.ts::warns on a repeated mobile — passing (2026-10-12)

## 20. Something else
`;

const CATALOG = `
## 4. Phase map

| Phase | Modules delivered (or started) |
|---|---|
| 1 | M01, M02, M03, M04 (tab, assignment, teams, blocklist, consent), M06 (core setup, templates), M15 (writer); My Work home |
| 2 | M05, M07, M08, M22 |
`;

const EXISTING = new Set([
  'apps/api/test/integration/constraints.test.ts',
  'apps/api/test/integration/audit-idempotency.test.ts',
  'packages/shared/src/format/format.test.ts',
]);
const fileExists = (path: string) => EXISTING.has(path);
const phaseOne = () =>
  rulesStatus({
    rules: parseRules(RULES),
    register: parseRegister(RULES),
    phaseModules: parsePhaseMap(CATALOG).get(1)!,
    fileExists,
  });

describe('rules status', () => {
  it('reads the rule rows with their module tokens and expected test', () => {
    const rules = parseRules(RULES);
    expect(rules.map((r) => r.id)).toEqual([
      'BR-001',
      'BR-002',
      'BR-003',
      'BR-004',
      'BR-005',
      'BR-006',
      'BR-007',
      'BR-008',
      'BR-009',
      'BR-010',
    ]);
    expect(rules[1]).toMatchObject({ id: 'BR-002', modules: ['M05', 'M02'], test: 'unit' });
    expect(rules[6]?.modules).toEqual(['all']);
  });

  it('reads the register: one id, several ids, a qualifier, and the three states', () => {
    const register = parseRegister(RULES);
    expect(register.get('BR-001')?.[0]).toMatchObject({
      state: 'passing',
      files: ['apps/api/test/integration/constraints.test.ts'],
    });
    expect(register.get('BR-003')?.[0]?.state).toBe('deferred');
    expect(register.get('BR-005')?.[0]?.state).toBe('manual');
    expect(register.get('BR-007')?.[0]?.files).toEqual([
      'apps/api/test/integration/audit-idempotency.test.ts',
      'packages/shared/src/format/format.test.ts',
    ]);
    expect(register.get('BR-008')).toHaveLength(1);
    expect(register.get('BR-002')?.[0]).toMatchObject({ qualifier: 'warning', state: 'passing' });
  });

  it('reads the state from the structure of the line, never from a note', () => {
    const lines = parseRegister(
      [
        '## 19. Test-status register',
        '',
        '- BR-010: not passing yet',
        '- BR-011: apps/api/test/x.test.ts::works (no date)',
        '- BR-012: covered somewhere — passing (2026-10-12)',
        '- BR-013: apps/api/test/x.test.ts::works — failing (2026-10-12; was passing before)',
        '- BR-014: apps/api/test/x.test.ts::works — passing (2026-10-12; the rest deferred to T2.2)',
        '- BR-015: e2e/other/folder/y.spec.js::opens — passing (2026-10-12)',
        '',
      ].join('\n'),
    );
    expect(lines.get('BR-010')?.[0]?.state).toBe('unknown');
    expect(lines.get('BR-011')?.[0]?.state).toBe('unknown');
    // "passing" without a test file is no proof of a test
    expect(lines.get('BR-012')?.[0]?.state).toBe('unknown');
    expect(lines.get('BR-013')?.[0]?.state).toBe('failing');
    // a note after the date does not change a passing line
    expect(lines.get('BR-014')?.[0]?.state).toBe('passing');
    // a test file in any folder is checked
    expect(lines.get('BR-015')?.[0]?.files).toEqual(['e2e/other/folder/y.spec.js']);
  });

  it('reads the phase map as module codes per phase', () => {
    const phases = parsePhaseMap(CATALOG);
    expect([...phases.get(1)!]).toEqual(['M01', 'M02', 'M03', 'M04', 'M06', 'M15']);
    expect([...phases.get(2)!]).toEqual(['M05', 'M07', 'M08', 'M22']);
  });

  it('classifies the rules of a phase: tested, deferred, manual, untested, and leaves the other phases out', () => {
    const byId = Object.fromEntries(phaseOne().map((r) => [r.id, r.state]));
    expect(byId).toEqual({
      // a module of the phase, or a cross-cutting rule ("all", "UI")
      'BR-002': 'tested',
      'BR-003': 'deferred',
      'BR-005': 'manual',
      'BR-007': 'tested',
      'BR-008': 'tested',
    });
    // the Phase 2 rules have no row; neither has a rule that expects no test (none, manual) or a retired one
    for (const id of ['BR-001', 'BR-004', 'BR-006', 'BR-009', 'BR-010'])
      expect(byId[id], id).toBeUndefined();
  });

  it('marks a rule untested when its register line is missing, and reports a register file that does not exist', () => {
    const rules = parseRules(RULES).filter((r) => r.id !== 'BR-002');
    rules.push({
      id: 'BR-011',
      rule: 'A new rule',
      modules: ['M03'],
      test: 'API',
      status: 'approved',
    });
    const rows = rulesStatus({
      rules,
      register: parseRegister(RULES),
      phaseModules: parsePhaseMap(CATALOG).get(1)!,
      fileExists,
    });
    expect(rows.find((r) => r.id === 'BR-011')?.state).toBe('untested');
    // the register line of the mobile-warning rule names a file that is not in the repository
    const all = phaseOne();
    expect(all.find((r) => r.id === 'BR-002')?.missingFiles).toEqual([
      'apps/api/test/integration/missing.test.ts',
    ]);
    expect(problemsOf(rows)).toEqual({
      untested: ['BR-011'],
      missingFiles: [],
    });
    expect(problemsOf(all)).toEqual({
      untested: [],
      missingFiles: [{ id: 'BR-002', files: ['apps/api/test/integration/missing.test.ts'] }],
    });
  });

  it('renders a Markdown report with the counts and one row per rule', () => {
    const report = renderReport(phaseOne(), 1);
    expect(report).toContain('Phase 1');
    expect(report).toContain('| BR-003 | M04 | unit, API | deferred |');
    expect(report).toMatch(/tested 3, deferred 1, manual 1, untested 0/);
  });
});

describe('the rules:status command', () => {
  const repo = resolve(__dirname, '../../..');
  const script = join(repo, 'scripts/check-rules.mjs');
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A fixture docs folder; the register's files are resolved against the real repository. */
  function docs(rules: string) {
    dir = mkdtempSync(join(tmpdir(), 'rules-'));
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'BUSINESS_RULES.md'), rules);
    writeFileSync(join(dir, 'docs', 'MODULE_CATALOG.md'), CATALOG);
    return join(dir, 'docs');
  }
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });

  it('exits 1 on an untested rule or a missing file, 0 with --report-only, and prints the table either way', () => {
    const folder = docs(RULES);
    const strict = run('--phase', '1', '--docs', folder);
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain('## Phase 1 rules:');
    expect(strict.stderr).toContain('BR-002: the register names a missing file');
    const report = run('--phase', '1', '--docs', folder, '--report-only');
    expect(report.status).toBe(0);
    expect(report.stdout).toContain('| BR-003 | M04 | unit, API | deferred |');
  });

  it('exits 0 when every testable rule of the phase is answered', () => {
    const answered = RULES.replace(
      '- BR-002 (warning): apps/api/test/integration/missing.test.ts::warns on a repeated mobile — passing (2026-10-12)',
      '- BR-002: packages/shared/test/rules-status.test.ts::reads the rule rows with their module tokens and expected test — passing (2026-10-18)',
    );
    expect(run('--phase', '1', '--docs', docs(answered)).status).toBe(0);
  });

  it('exits 2 on a usage error or an unknown phase', () => {
    const folder = docs(RULES);
    expect(run('--phase', 'x', '--docs', folder).status).toBe(2);
    expect(run('--phase', '7', '--docs', folder).status).toBe(2);
  });
});
