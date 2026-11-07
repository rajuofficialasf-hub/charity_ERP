import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { measureAddedRoute, measureFirstRoute } from '../scripts/bundle-report.mjs';

// The first-route JavaScript of the PWA (docs/NON_FUNCTIONAL_REQUIREMENTS.md, the first-route
// budget): the entry script and the chunks it preloads, compressed. Each test passes its own budget.
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
  write(
    'assets/AdminLayout-d.js',
    'import{x}from"./vendor-b.js";import{y}from"./Table-e.js";export const admin = 1;'.repeat(50),
  );
  write('assets/Table-e.js', 'export const y = 2;'.repeat(300));
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

  it('finds the scripts whatever the order of their attributes', () => {
    fixture();
    write(
      'index.html',
      '<script crossorigin src="/assets/index-a.js" type="module"></script><link href="/assets/vendor-b.js" rel="modulepreload">',
    );
    expect(measureFirstRoute(dist).files).toHaveLength(2);
  });

  it('adds the chunks the first render loads on its own, such as the device language', () => {
    fixture();
    write('assets/bn-f.js', 'export const bn = {};'.repeat(100));
    const report = measureFirstRoute(dist, 250, ['bn']);
    expect(report.files.map((f) => f.file)).toContain('assets/bn-f.js');
    expect(report.files).toHaveLength(3);
    expect(() => measureFirstRoute(dist, 250, ['xx'])).toThrow(/no chunk named xx/);
  });

  it('fails instead of passing when the page names no entry script', () => {
    fixture();
    write('index.html', '<!doctype html><html><head></head><body></body></html>');
    expect(() => measureFirstRoute(dist)).toThrow(/no module entry script/);
  });

  it('counts what a lazy page adds, without the chunks the first route already loaded', () => {
    fixture();
    const added = measureAddedRoute(dist, ['AdminLayout']);
    const read = (f: string) => readFileSync(join(dist, f));
    expect(added).toBe(
      gzipSync(read('assets/AdminLayout-d.js'), { level: 9 }).length +
        gzipSync(read('assets/Table-e.js'), { level: 9 }).length,
    );
    expect(() => measureAddedRoute(dist, ['Missing'])).toThrow(/no chunk named Missing/);
  });
});
