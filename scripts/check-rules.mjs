// @ts-check
// pnpm rules:status --phase <n> [--report-only] [--docs <dir>]: the test status of every testable
// business rule of a phase (docs/testing/TEST_STRATEGY.md, section "How BUSINESS_RULES.md tracks
// test status"). Exit code 1 when a rule is still untested or a register line names a missing
// file, unless --report-only; exit code 2 on a usage error. --docs names the folder that holds
// BUSINESS_RULES.md and MODULE_CATALOG.md (default docs/), for the tests of this script.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePhaseMap,
  parseRegister,
  parseRules,
  problemsOf,
  renderReport,
  rulesStatus,
} from './lib/rules-status.mjs';

/**
 * The status rows of one phase on the repository's documents (shared with check-docs.mjs).
 * @param {number} phase
 * @param {{ docsDir?: string, repoRoot?: string }} [options]
 */
export function phaseRules(phase, options = {}) {
  const docsDir = options.docsDir ?? 'docs';
  const repoRoot = options.repoRoot ?? '.';
  const source = readFileSync(join(docsDir, 'BUSINESS_RULES.md'), 'utf8');
  const phaseModules = parsePhaseMap(readFileSync(join(docsDir, 'MODULE_CATALOG.md'), 'utf8')).get(
    phase,
  );
  if (!phaseModules)
    throw new Error(`no phase ${phase} in the phase map of ${join(docsDir, 'MODULE_CATALOG.md')}`);
  return rulesStatus({
    rules: parseRules(source),
    register: parseRegister(source),
    phaseModules,
    fileExists: (path) => existsSync(join(repoRoot, path)),
  });
}

/** One sentence per problem, for the console and the docs check. */
export function describeProblems(/** @type {ReturnType<typeof problemsOf>} */ problems) {
  const lines = [];
  if (problems.untested.length)
    lines.push(`${problems.untested.length} untested rule(s): ${problems.untested.join(', ')}`);
  for (const m of problems.missingFiles)
    lines.push(`${m.id}: the register names a missing file ${m.files.join(', ')}`);
  return lines;
}

const USAGE = 'usage: node scripts/check-rules.mjs [--phase <n>] [--report-only] [--docs <dir>]';

if (process.argv[1] && /check-rules\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const valueOf = (/** @type {string} */ flag) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const phaseArg = valueOf('--phase');
  const phase = phaseArg === undefined ? 1 : Number(phaseArg);
  const docsDir = valueOf('--docs');
  if (!Number.isInteger(phase) || phase < 0 || (args.includes('--docs') && !docsDir)) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const rows = phaseRules(phase, docsDir ? { docsDir } : {});
    process.stdout.write(renderReport(rows, phase));
    const problems = describeProblems(problemsOf(rows));
    if (problems.length && !args.includes('--report-only')) {
      console.error(`\n${problems.map((p) => `- ${p}`).join('\n')}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
