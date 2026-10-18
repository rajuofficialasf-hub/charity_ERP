// @ts-check
// pnpm rules:status --phase <n> [--report-only]: the test status of every testable business rule
// of a phase (docs/testing/TEST_STRATEGY.md, section "How BUSINESS_RULES.md tracks test status").
// Exit code 1 when a rule is still untested or a register line names a missing file, unless
// --report-only.
import { existsSync, readFileSync } from 'node:fs';
import {
  parsePhaseMap,
  parseRegister,
  parseRules,
  renderReport,
  rulesStatus,
} from './lib/rules-status.mjs';

/** The status rows of one phase on the repository's documents (shared with check-docs.mjs). */
export function phaseRules(phase) {
  const rules = parseRules(readFileSync('docs/BUSINESS_RULES.md', 'utf8'));
  const register = parseRegister(readFileSync('docs/BUSINESS_RULES.md', 'utf8'));
  const phaseModules = parsePhaseMap(readFileSync('docs/MODULE_CATALOG.md', 'utf8')).get(phase);
  if (!phaseModules)
    throw new Error(`no phase ${phase} in the phase map of docs/MODULE_CATALOG.md`);
  return rulesStatus({ rules, register, phaseModules, fileExists: (path) => existsSync(path) });
}

/** The problems a phase's rows carry: untested rules and register lines with missing files. */
export function problemsOf(rows) {
  return [
    ...rows.filter((r) => r.state === 'untested').map((r) => `${r.id} is untested`),
    ...rows
      .filter((r) => r.missingFiles.length)
      .map((r) => `${r.id}: register names a missing file ${r.missingFiles.join(', ')}`),
  ];
}

if (process.argv[1] && /check-rules\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const phaseArg = args[args.indexOf('--phase') + 1];
  const phase = args.includes('--phase') ? Number(phaseArg) : 1;
  const rows = phaseRules(phase);
  process.stdout.write(renderReport(rows, phase));
  const problems = problemsOf(rows);
  if (problems.length && !args.includes('--report-only')) {
    console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
}
