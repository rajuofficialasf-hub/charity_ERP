// i18n check (docs/ui/I18N.md, "No hard-coded strings: rule and enforcement"), run by
// `pnpm i18n:check` and `pnpm lint` in CI:
// 1. the catalogue check of packages/shared (parity, ICU, parameters, digits, error codes, unused keys);
// 2. no Bengali script in code outside the catalogue, notification templates, seed data and tests.
// Node 24 runs the TypeScript check module directly (type stripping).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalogue } from '../packages/shared/src/i18n/check.ts';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

function walk(dir, filter, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const path = `${dir}/${name}`;
    if (
      ['node_modules', 'dist', '.next', 'generated', 'test-results', 'playwright-report'].includes(
        name,
      )
    )
      continue;
    if (statSync(join(root, path)).isDirectory()) walk(path, filter, out);
    else if (filter(path)) out.push(path);
  }
  return out;
}

// ---- 1. catalogue ----
const messagesDir = 'packages/shared/src/i18n/messages';
const catalogue = (locale) =>
  Object.fromEntries(
    readdirSync(join(root, messagesDir, locale))
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(read(`${messagesDir}/${locale}/${f}`))]),
  );

const standards = read('docs/api/API_STANDARDS.md');
const section8 = standards.slice(
  standards.indexOf('## 8. Error-code catalogue'),
  standards.indexOf('## 9.'),
);
const errorCodes = [...section8.matchAll(/^\| \w+ \| ([a-z_.,` ]+) \| /gm)]
  .flatMap((m) => m[1].split(','))
  .map((c) => c.replace(/`/g, '').trim())
  .filter((c) => c.includes('.'));
const engine = read('docs/architecture/WORKFLOW_ENGINE.md');
const guards = engine.slice(engine.indexOf('## 6. Guard catalogue'), engine.indexOf('## 7.'));
for (const [, guard] of guards.matchAll(/^\| ([a-z_]+\.[a-z_.]+) \|/gm))
  errorCodes.push(`workflow.guard.${guard.replace(/\./g, '_')}`);

// keys used in code: literal keys plus the namespaces of useTranslations/getTranslations
const codeFiles = walk('apps', (p) => /\.(ts|tsx)$/.test(p)).concat(
  walk('packages', (p) => /\.(ts|tsx)$/.test(p)),
);
const used = new Set();
const dynamic = ['errors.', 'codes.', 'ui.'];
for (const file of codeFiles) {
  const text = read(file);
  const namespaces = [
    ...text.matchAll(/(?:useTranslations|getTranslations)\(\s*'([a-z_.]+)'/g),
  ].map((m) => m[1]);
  for (const ns of namespaces) used.add(ns);
  for (const [, key] of text.matchAll(/\bt[a-z]?\(\s*'([a-zA-Z0-9_.]+)'/g)) {
    used.add(key);
    for (const ns of namespaces) used.add(`${ns}.${key}`);
  }
  for (const [, prefix] of text.matchAll(/\bt[a-z]?\(\s*`([a-zA-Z0-9_.]+)\$\{/g))
    for (const ns of namespaces) dynamic.push(`${ns}.${prefix}`);
  for (const [, key] of text.matchAll(/translate\([^,]+,\s*'([a-zA-Z0-9_.]+)'/g)) used.add(key);
}

const report = checkCatalogue({
  bn: catalogue('bn'),
  en: catalogue('en'),
  errorCodes,
  usedKeys: used,
  dynamicPrefixes: dynamic,
});

// ---- 2. Bengali script in code ----
const BENGALI = /[ঀ-৲৴-৿]/u; // the taka sign U+09F3 is allowed in code
const allowed = [
  /^packages\/shared\/src\/i18n\/messages\//,
  /^packages\/shared\/src\/notifications\/templates\.ts$/,
  /^packages\/shared\/src\/testing\//,
  /^apps\/api\/seed\//,
  /\.(test|spec)\.(ts|tsx)$/,
  // test data: the unit, E2E and contract tests' own names and labels
  /\/(test|tests|e2e)\//,
];
const scripts = walk('apps', (p) => /\.(ts|tsx|mjs|js)$/.test(p))
  .concat(walk('packages', (p) => /\.(ts|tsx|mjs|js)$/.test(p)))
  .map((p) => p.split(sep).join('/'))
  .filter((p) => !allowed.some((re) => re.test(p)));
for (const file of scripts) {
  read(file)
    .split('\n')
    .forEach((line, i) => {
      // Comments are documentation, not user-facing text; a data-matching pattern may be marked
      // with `i18n-allow-bengali` and a reason.
      const trimmed = line.trim();
      if (/^(\/\/|\/\*|\*)/.test(trimmed) || line.includes('i18n-allow-bengali')) return;
      const code = line.replace(/\s\/\/.*$/, '');
      if (BENGALI.test(code))
        report.errors.push(
          `${relative(root, join(root, file)).split(sep).join('/')}:${i + 1}: Bengali text in code; move it to the catalogue (I18N 4)`,
        );
    });
}

for (const warning of report.warnings) console.warn(`warn  ${warning}`);
for (const error of report.errors) console.error(`error ${error}`);
process.stdout.write(
  `i18n check: ${report.errors.length} error(s), ${report.warnings.length} warning(s); ${errorCodes.length} error codes checked\n`,
);
process.exit(report.errors.length ? 1 : 0);
