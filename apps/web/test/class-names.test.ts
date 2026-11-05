// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every class name the web app writes must be one a stylesheet of the app defines: utility classes
// have no stylesheet here, so a leftover one fails.
const repo = fileURLToPath(new URL('../../../', import.meta.url));

function files(dir: string, ending: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ending);
    return name.endsWith(ending) ? [path] : [];
  });
}

const css = files(join(repo, 'apps/web/src'), '.css');
// the global styles and the app's shared components load with every page
const shared = new Set([join(repo, 'apps/web/src/styles'), join(repo, 'apps/web/src/components')]);
/** Each class and the folders whose stylesheets define it; a page's stylesheet loads with its area only. */
const defined = new Map<string, string[]>();
for (const file of css) {
  const folder = [...shared].find((dir) => file.startsWith(dir)) ?? dirname(file);
  for (const m of readFileSync(file, 'utf8').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
    defined.set(m[1]!, [...(defined.get(m[1]!) ?? []), folder]);
}
/** Whether a class is available to a file: from the shared styles or a stylesheet of its own area. */
const available = (name: string, file: string) =>
  (defined.get(name) ?? []).some((folder) => shared.has(folder) || file.startsWith(folder));

/**
 * The literal class names of a TSX file: a plain attribute string, and every string inside a
 * `className={…}` expression (template literals, `cx()` arguments, both sides of a condition).
 */
function classNames(source: string): string[] {
  const names: string[] = [];
  const attribute = /className=(?:"([^"]*)"|\{((?:[^{}]|\{[^{}]*\})*)\})/g;
  for (const m of source.matchAll(attribute)) {
    if (m[1] !== undefined) {
      names.push(...m[1].split(/\s+/).filter(Boolean));
      continue;
    }
    // an expression inside a template literal stands for one unknown part of the name
    // a string compared with a value is not a class name
    const expression = m[2]!
      .replace(/\$\{[^}]*\}/g, '${}')
      .replace(/[!=]==\s*(['"`])[^'"`]*\1|(['"`])[^'"`]*\2\s*[!=]==/g, '');
    for (const literal of expression.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [])
      names.push(...literal.slice(1, -1).split(/\s+/).filter(Boolean));
  }
  return names;
}

describe('class names of the web app', () => {
  it('are all defined by a stylesheet the page loads: the shared styles or its own area', () => {
    const tsx = files(join(repo, 'apps/web/src'), '.tsx').filter((f) => !f.endsWith('.test.tsx'));
    const unknown: string[] = [];
    for (const file of tsx) {
      for (const name of classNames(readFileSync(file, 'utf8'))) {
        // `app-shell-${…}` names a family: one class of the family must exist
        const known = name.includes('${')
          ? [...defined.keys()].some(
              (d) => d.startsWith(name.slice(0, name.indexOf('${'))) && available(d, file),
            )
          : available(name, file);
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
    expect(classNames("<p className={open ? 'm-0' : 'admin-muted'}>")).toEqual([
      'm-0',
      'admin-muted',
    ]);
    expect(classNames('<nav className={`app-shell app-shell-${wide ? 1 : 2}`}>')).toEqual([
      'app-shell',
      'app-shell-${}',
    ]);
    expect(classNames("<nav className={variant === 'rail' ? 'app-rail' : 'app-tabs'}>")).toEqual([
      'app-rail',
      'app-tabs',
    ]);
    expect(defined.has('flex')).toBe(false);
    // the admin area's classes are not loaded on a volunteer's page
    const volunteerPage = join(repo, 'apps/web/src/features/notifications/NotificationsPage.tsx');
    expect(available('admin-muted', volunteerPage)).toBe(false);
    // the app's shared styles load with every page
    expect(available('app-sr-only', volunteerPage)).toBe(true);
  });
});
