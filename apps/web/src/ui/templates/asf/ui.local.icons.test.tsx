// @vitest-environment jsdom
// The Solar icons of the asf template: every icon the app's pages need has an asf name (the map in
// apps/web/src/ui/icon-map.md), every name renders, and the generated bodies are plain drawings with
// the set's attribution.
import '@testing-library/jest-dom/vitest';

import type { ExtendedIconName } from '@/ui/contract';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { it, expect, describe, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

import { Icon } from './index';
import { iconBodies } from './components/icon-data';
import { loadIcons } from './components/icon';

afterEach(cleanup);

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../..');

/** The rows of the map: a Lucide name and the asf name that stands for it. */
function readMap() {
  const text = readFileSync(path.join(src, 'ui/icon-map.md'), 'utf8');
  return new Map([...text.matchAll(/^\| `(\w+)` \| `([\w-]+)` \|$/gm)].map((row) => [row[1]!, row[2]!]));
}

/** Every Lucide icon a file of the app imports. */
function lucideImports() {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(full, 'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g)) {
          for (const part of match[1]!.split(',')) {
            const name = part.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0]!.trim();
            if (/^[A-Z]/.test(name)) names.add(name);
          }
        }
      }
    }
  };
  walk(src);
  return names;
}

describe('the icons', () => {
  it('come from the asf set alone: no file of the app imports a Lucide icon', () => {
    expect([...lucideImports()].sort()).toEqual([]);
  });

  it('map only to icons the set has, and every icon renders as a drawing', async () => {
    await loadIcons();
    const names = new Set([...readMap().values(), ...Object.keys(iconBodies)]);
    for (const name of names) {
      expect(Object.hasOwn(iconBodies, name), name).toBe(true);
      const { container, unmount } = render(<Icon name={name as ExtendedIconName} label={name} />);
      expect(container.querySelector('svg')?.childElementCount, name).toBeGreaterThan(0);
      unmount();
    }
  });

  it('are plain drawings, nothing that runs or loads', () => {
    for (const [name, body] of Object.entries(iconBodies)) {
      expect(body, name).not.toMatch(/<script|<foreignObject|\son\w+=|href=|url\(/i);
      const tags = [...body.matchAll(/<(\w+)/g)].map((match) => match[1]);
      expect(tags.every((tag) => ['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'].includes(tag!)), name).toBe(true);
    }
  });

  it('carry the attribution of the Solar set', () => {
    const generated = readFileSync(path.join(here, 'components/icon-data.ts'), 'utf8');
    expect(generated).toMatch(/Solar icon set by 480 Design, CC BY 4\.0/);
    expect(generated).toMatch(/@iconify-json\/solar 1\.2\.13/);
  });
});

describe('the icon drawings', () => {
  it('fill in once their file has loaded, without the page waiting for it', async () => {
    const { container } = render(<Icon name="home" label="Home" />);
    await waitFor(() => expect(container.querySelector('svg')?.childElementCount).toBeGreaterThan(0));
  });
});
