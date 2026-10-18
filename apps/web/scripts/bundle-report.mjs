// @ts-check
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** The first-route budget of docs/NON_FUNCTIONAL_REQUIREMENTS.md (NFR-15): compressed KB. */
export const BUDGET_KB = 250;

/**
 * The JavaScript the first route loads: the entry script of `index.html` and every chunk it
 * preloads, each gzip-compressed as a server would send it.
 * @param {string} dist the build folder
 * @param {number} [budgetKb]
 */
export function measureFirstRoute(dist, budgetKb = BUDGET_KB) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const paths = [
    ...html.matchAll(/<script[^>]*type="module"[^>]*src="\/([^"]+)"/g),
    ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/([^"]+)"/g),
  ].map((m) => /** @type {string} */ (m[1]));
  const files = [...new Set(paths)]
    .map((file) => ({ file, bytes: gzipSync(readFileSync(join(dist, file)), { level: 9 }).length }))
    .sort((a, b) => a.bytes - b.bytes);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  return { files, totalBytes, budgetKb, withinBudget: totalBytes <= budgetKb * 1024 };
}

const kb = (/** @type {number} */ bytes) => (bytes / 1024).toFixed(1);

// `node scripts/bundle-report.mjs [dist]`: prints the files and fails over the budget
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = measureFirstRoute(process.argv[2] ?? 'dist');
  const lines = report.files.map((f) => `${kb(f.bytes).padStart(8)} KB  ${f.file}`);
  lines.push(
    `first route: ${kb(report.totalBytes)} KB gzip of ${report.budgetKb} KB (${report.files.length} files)`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  if (!report.withinBudget) {
    console.error('over the first-route budget');
    process.exit(1);
  }
}
