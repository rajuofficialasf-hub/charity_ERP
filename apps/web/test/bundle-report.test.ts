import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { measureFirstRoute } from '../scripts/bundle-report.mjs';

// The first-route JavaScript budget of the PWA (docs/NON_FUNCTIONAL_REQUIREMENTS.md, the 250 KB
// first route): the entry script and the chunks it preloads, compressed.
let dist: string;
const write = (name: string, body: string) => writeFileSync(join(dist, name), body);

afterEach(() => rmSync(dist, { recursive: true, force: true }));

function fixture() {
  dist = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dist, 'assets'));
  write(
    'index.html',
    `<!doctype html><html><head>
      <script type="module" crossorigin src="/assets/index-a.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-b.js">
      <link rel="stylesheet" href="/assets/index-c.css">
    </head><body></body></html>`,
  );
  write('assets/index-a.js', 'console.log("entry");'.repeat(200));
  write('assets/vendor-b.js', 'export const x = 1;'.repeat(400));
  // a lazy chunk the first route does not load
  write('assets/AdminLayout-d.js', 'export const admin = 1;'.repeat(5000));
}

describe('first-route bundle report', () => {
  it('counts the entry and its preloaded chunks, compressed, and nothing else', () => {
    fixture();
    const report = measureFirstRoute(dist);
    expect(report.files.map((f) => f.file).sort()).toEqual([
      'assets/index-a.js',
      'assets/vendor-b.js',
    ]);
    const expected =
      gzipSync('console.log("entry");'.repeat(200), { level: 9 }).length +
      gzipSync('export const x = 1;'.repeat(400), { level: 9 }).length;
    expect(report.totalBytes).toBe(expected);
  });

  it('says whether the total fits the budget', () => {
    fixture();
    expect(measureFirstRoute(dist, 250).withinBudget).toBe(true);
    expect(measureFirstRoute(dist, 0.01).withinBudget).toBe(false);
  });
});
