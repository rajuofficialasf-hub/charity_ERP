import { describe, expect, it } from 'vitest';
import {
  parsePhaseMap,
  parseRegister,
  parseRules,
  renderReport,
  rulesStatus,
} from '../../../scripts/lib/rules-status.mjs';

// The untested-rules check of docs/BUSINESS_RULES.md (TEST_STRATEGY, section "How
// BUSINESS_RULES.md tracks test status"): every testable rule of a phase's modules has a register
// line that says tested, deferred or manual; the rest is untested. Fixture text only.
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

## 19. Test-status register

Every rule above starts with test status "not yet".

- BR-001: apps/api/test/integration/constraints.test.ts::refuses an application without an identity number — passing (2026-10-11)
- BR-003: deferred to T5.3 (feature not built: ratings)
- BR-005: manual (a paper procedure of the SOP)
- BR-007, BR-008: apps/api/test/integration/audit.test.ts::records actor and time; packages/shared/src/format/format.test.ts::never prints Bengali digits — passing (2026-10-12)
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
  'apps/api/test/integration/audit.test.ts',
  'packages/shared/src/format/format.test.ts',
]);
const fileExists = (path: string) => EXISTING.has(path);

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
      'apps/api/test/integration/audit.test.ts',
      'packages/shared/src/format/format.test.ts',
    ]);
    expect(register.get('BR-008')).toHaveLength(1);
    expect(register.get('BR-002')?.[0]).toMatchObject({ qualifier: 'warning', state: 'passing' });
  });

  it('reads the phase map as module codes per phase', () => {
    const phases = parsePhaseMap(CATALOG);
    expect([...phases.get(1)!]).toEqual(['M01', 'M02', 'M03', 'M04', 'M06', 'M15']);
    expect([...phases.get(2)!]).toEqual(['M05', 'M07', 'M08', 'M22']);
  });

  it('classifies the rules of a phase: tested, deferred, manual, untested, and leaves the other phases out', () => {
    const rows = rulesStatus({
      rules: parseRules(RULES),
      register: parseRegister(RULES),
      phaseModules: parsePhaseMap(CATALOG).get(1)!,
      fileExists,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.state]));
    expect(byId).toEqual({
      // a module of the phase, or a cross-cutting rule ("all", "UI")
      'BR-002': 'tested',
      'BR-003': 'deferred',
      'BR-005': 'manual',
      'BR-007': 'tested',
      'BR-008': 'tested',
    });
    // BR-001 and BR-004 are Phase 2 modules only; BR-006 expects no test (none) and is retired
    expect(byId['BR-001']).toBeUndefined();
    expect(byId['BR-004']).toBeUndefined();
    expect(byId['BR-006']).toBeUndefined();
  });

  it('marks a rule untested when its register line is missing, and reports a register file that does not exist', () => {
    const rules = parseRules(RULES).filter((r) => r.id !== 'BR-002');
    rules.push({
      id: 'BR-009',
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
    expect(rows.find((r) => r.id === 'BR-009')?.state).toBe('untested');
    // the register line of BR-002 names a file that is not in the repository
    const all = rulesStatus({
      rules: parseRules(RULES),
      register: parseRegister(RULES),
      phaseModules: parsePhaseMap(CATALOG).get(1)!,
      fileExists,
    });
    expect(all.find((r) => r.id === 'BR-002')?.missingFiles).toEqual([
      'apps/api/test/integration/missing.test.ts',
    ]);
  });

  it('renders a Markdown report with the counts and one row per rule', () => {
    const rows = rulesStatus({
      rules: parseRules(RULES),
      register: parseRegister(RULES),
      phaseModules: parsePhaseMap(CATALOG).get(1)!,
      fileExists,
    });
    const report = renderReport(rows, 1);
    expect(report).toContain('Phase 1');
    expect(report).toContain('| BR-003 | M04 | unit, API | deferred |');
    expect(report).toMatch(/tested 3, deferred 1, manual 1, untested 0/);
  });
});
