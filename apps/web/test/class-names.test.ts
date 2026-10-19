// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every class name the web app writes must be one a stylesheet of the app or the component set
// defines: utility classes have no stylesheet here, so a leftover one fails.
const repo = fileURLToPath(new URL('../../../', import.meta.url));

function files(dir: string, ending: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ending);
    return name.endsWith(ending) ? [path] : [];
  });
}

const css = [
  ...files(join(repo, 'apps/web/src'), '.css'),
  ...files(join(repo, 'packages/ui/src'), '.css'),
];
const defined = new Set<string>();
for (const file of css)
  for (const m of readFileSync(file, 'utf8').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]!);

/** The literal class names of a TSX file: plain strings, template parts and `cx()` strings. */
function classNames(source: string): string[] {
  const names: string[] = [];
  const attribute = /className=(?:"([^"]*)"|\{\s*(`[^`]*`|cx\(([^)]*)\)|'[^']*')\s*\})/g;
  for (const m of source.matchAll(attribute)) {
    // an expression inside a template literal stands for one unknown part of the name
    const text = (m[1] ?? m[3] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, '${}');
    for (const literal of text.match(/'[^']*'|"[^"]*"|`[^`]*`|[^'"`\s,()&|?:]+/g) ?? []) {
      const plain = /^['"`]/.test(literal) ? literal.slice(1, -1) : literal;
      if (!/^['"`]/.test(literal) && m[1] === undefined) continue; // a variable, not a name
      for (const token of plain.split(/\s+/)) if (token) names.push(token);
    }
  }
  return names;
}

describe('class names of the web app', () => {
  it('are all defined by a stylesheet of the app or the component set', () => {
    const tsx = files(join(repo, 'apps/web/src'), '.tsx').filter((f) => !f.endsWith('.test.tsx'));
    const unknown: string[] = [];
    for (const file of tsx) {
      for (const name of classNames(readFileSync(file, 'utf8'))) {
        // `app-shell-${…}` names a family: one class of the family must exist
        const known = name.includes('${')
          ? [...defined].some((d) => d.startsWith(name.slice(0, name.indexOf('${'))))
          : defined.has(name);
        if (!known) unknown.push(`${file.slice(repo.length)}: ${name}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('notices a utility class', () => {
    expect(classNames('<p className="m-0 admin-muted">')).toEqual(['m-0', 'admin-muted']);
    expect(classNames("<div className={cx('ui-stack', open && 'flex')}>")).toEqual([
      'ui-stack',
      'flex',
    ]);
    expect(defined.has('flex')).toBe(false);
  });
});
