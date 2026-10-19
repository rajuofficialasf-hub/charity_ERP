// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** The first-route budget of docs/NON_FUNCTIONAL_REQUIREMENTS.md, in compressed KB. */
export const BUDGET_KB = 250;

/** The value of one attribute of a tag, in any attribute order. */
const attribute = (/** @type {string} */ tag, /** @type {string} */ name) =>
  // eslint-disable-next-line security/detect-non-literal-regexp -- the names are fixed words of this file
  new RegExp(`\\s${name}="([^"]+)"`).exec(tag)?.[1];

/** A path of `index.html` as a file of the build folder (the base `/` dropped). */
const local = (/** @type {string} */ path) => path.replace(/^\.?\//, '');

const gzipBytes = (/** @type {string} */ dist, /** @type {string} */ file) =>
  gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;

/**
 * The JavaScript the first route loads: the entry script of `index.html` and every chunk it
 * preloads, each gzip-compressed as a server would send it. A build without an entry script is an
 * error, never an empty pass.
 * @param {string} dist the build folder
 * @param {number} [budgetKb]
 * @param {string[]} [alsoLoaded] chunks the first render loads on its own (the device language's
 *   catalogue, D-104), named by their module
 */
export function measureFirstRoute(dist, budgetKb = BUDGET_KB, alsoLoaded = []) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<script\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => attribute(tag, 'type') === 'module')
    .map((tag) => attribute(tag, 'src'))
    .filter((src) => src !== undefined);
  if (entries.length === 0)
    throw new Error(`no module entry script in ${join(dist, 'index.html')}`);
  const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => attribute(tag, 'rel') === 'modulepreload')
    .map((tag) => attribute(tag, 'href'))
    .filter((href) => href !== undefined);
  const assets = alsoLoaded.length > 0 ? readdirSync(join(dist, 'assets')) : [];
  const extra = alsoLoaded.map((name) => {
    const file = assets.find((f) => f.startsWith(`${name}-`) && f.endsWith('.js'));
    if (!file) throw new Error(`no chunk named ${name} in ${join(dist, 'assets')}`);
    return `assets/${file}`;
  });
  const files = [...new Set([...entries, ...preloads].map(local).concat(extra))]
    .map((file) => ({ file, bytes: gzipBytes(dist, file) }))
    .sort((a, b) => a.bytes - b.bytes);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  return { files, totalBytes, budgetKb, withinBudget: totalBytes <= budgetKb * 1024 };
}

/** The chunks a chunk imports statically, as files of the build folder. */
const importsOf = (/** @type {string} */ dist, /** @type {string} */ file) =>
  [...readFileSync(join(dist, file), 'utf8').matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map(
    (m) => join('assets', /** @type {string} */ (m[1])).replaceAll('\\', '/'),
  );

/**
 * What a lazy page adds on top of the first route when it is not cached yet: its route chunks
 * (named by their module, such as `AppShell`) and everything they import statically.
 * @param {string} dist
 * @param {string[]} chunks
 */
export function measureAddedRoute(dist, chunks) {
  const assets = readdirSync(join(dist, 'assets'));
  const first = new Set(measureFirstRoute(dist).files.map((f) => f.file));
  const seen = new Set();
  const visit = (/** @type {string} */ file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const next of importsOf(dist, file)) visit(next);
  };
  for (const name of chunks) {
    const file = assets.find((f) => f.startsWith(`${name}-`) && f.endsWith('.js'));
    if (!file) throw new Error(`no chunk named ${name} in ${join(dist, 'assets')}`);
    visit(`assets/${file}`);
  }
  for (const file of first)
    for (const loaded of [file, ...importsOf(dist, file)]) seen.delete(loaded);
  return [...seen].reduce((sum, file) => sum + gzipBytes(dist, file), 0);
}

const kb = (/** @type {number} */ bytes) => (bytes / 1024).toFixed(1);

// `node scripts/bundle-report.mjs [dist]`: prints the files and fails over the budget
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  // the default language's catalogue is part of the first render (D-104)
  const report = measureFirstRoute(dist, BUDGET_KB, ['bn']);
  const lines = report.files.map((f) => `${kb(f.bytes).padStart(8)} KB  ${f.file}`);
  lines.push(
    `first route (login, with the bn catalogue): ${kb(report.totalBytes)} KB gzip of ${report.budgetKb} KB (${report.files.length} files)`,
    `the home of a signed-in person adds: ${kb(measureAddedRoute(dist, ['AppShell', 'MyWorkPage']))} KB gzip when not cached`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  if (!report.withinBudget) {
    console.error('over the first-route budget');
    process.exit(1);
  }
}
