// @ts-check
// The coverage of each package from Vitest's `json-summary` report (docs/testing/TEST_STRATEGY.md,
// section "Coverage expectations"): the files are grouped by their package folder (`apps/api`,
// `apps/web`, `packages/shared`), and each package's lines and branches are summed.

/**
 * @typedef {{ total: number, covered: number }} Count
 * @typedef {{ lines: Count, branches: Count }} FileCoverage
 * @typedef {{ name: string, files: number, lines: Count, branches: Count }} PackageCoverage
 */

/**
 * The package folder of a file: its first two folders under the repository, such as `apps/web`;
 * null for a file outside `apps/` and `packages/`.
 * @param {string} file
 * @param {string} root
 */
function packageOf(file, root) {
  const path = file.replaceAll('\\', '/');
  const base = root.replaceAll('\\', '/').replace(/\/+$/, '');
  const relative = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
  const [area, name] = relative.split('/');
  if ((area !== 'apps' && area !== 'packages') || !name) return null;
  return `${area}/${name}`;
}

/**
 * Each package's files, lines and branches, in the order of their names; the summary's own
 * `total` entry is left out.
 * @param {Record<string, FileCoverage>} summary
 * @param {string} root the repository folder the file paths start with
 * @returns {PackageCoverage[]}
 */
export function coverageByPackage(summary, root) {
  /** @type {Map<string, PackageCoverage>} */
  const packages = new Map();
  for (const [file, coverage] of Object.entries(summary)) {
    if (file === 'total') continue;
    const name = packageOf(file, root);
    if (!name) continue;
    const row = packages.get(name) ?? {
      name,
      files: 0,
      lines: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 },
    };
    row.files += 1;
    row.lines.total += coverage.lines.total;
    row.lines.covered += coverage.lines.covered;
    row.branches.total += coverage.branches.total;
    row.branches.covered += coverage.branches.covered;
    packages.set(name, row);
  }
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {Count} count */
const percent = (count) =>
  count.total === 0 ? '—' : `${((count.covered / count.total) * 100).toFixed(1)} %`;

/**
 * A Markdown table of the packages for the job's summary.
 * @param {PackageCoverage[]} rows
 */
export function renderCoverageTable(rows) {
  const lines = [
    '### Coverage per package',
    '',
    '| Package | Files | Lines | Branches |',
    '|---|---:|---:|---:|',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.files} | ${percent(r.lines)} (${r.lines.covered} of ${r.lines.total}) | ${percent(r.branches)} (${r.branches.covered} of ${r.branches.total}) |`,
    ),
    '',
  ];
  return lines.join('\n');
}
