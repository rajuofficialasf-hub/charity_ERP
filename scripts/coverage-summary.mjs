// @ts-check
// node scripts/coverage-summary.mjs [summary file]: the coverage of each package after
// `pnpm test:coverage`, as a table in the GitHub job's summary (`GITHUB_STEP_SUMMARY`) or on the
// console. It reports only: no minimum fails the run until the owner sets the minimums
// (docs/testing/TEST_STRATEGY.md, section "Coverage expectations").
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coverageByPackage, renderCoverageTable } from './lib/coverage-summary.mjs';

const file = resolve(process.argv[2] ?? 'coverage/coverage-summary.json');
if (!existsSync(file)) {
  console.error(`No coverage summary at ${file}; run pnpm test:coverage first.`);
  process.exit(2);
}
const summary = JSON.parse(readFileSync(file, 'utf8'));
const table = renderCoverageTable(coverageByPackage(summary, process.cwd()));
const target = process.env.GITHUB_STEP_SUMMARY;
if (target) appendFileSync(target, `${table}\n`);
process.stdout.write(`${table}\n`);
