// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS } from '../breakpoints.js';
import { createUiTheme } from '../templates/mui/theme.js';
import { DESKTOP_TOKENS, ROOT_TOKENS } from '../tokens.js';

const root = join(__dirname, '../..');
const repo = join(root, '../..');
const read = (path: string) => readFileSync(path, 'utf8');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}
const allCss = cssFiles(join(root, 'src'));
const squash = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');

describe('tokens (DESIGN_SYSTEM 2.9)', () => {
  it('tokens.css equals the token block of the design system', () => {
    const ds = read(join(repo, 'docs/ui/DESIGN_SYSTEM.md'));
    const section = ds.slice(ds.indexOf('### 2.9 Complete token block'));
    const start = section.indexOf('```css') + 6;
    const block = section.slice(start, section.indexOf('```', start));
    const tokens = read(join(root, 'src/styles/tokens.css'));
    // Prettier writes hex in lower case; values are compared case-insensitively.
    expect(squash(tokens).toLowerCase()).toBe(squash(block).toLowerCase());
  });

  it('tokens.ts holds the same names and values as the design system', () => {
    const ds = read(join(repo, 'docs/ui/DESIGN_SYSTEM.md'));
    const section = ds.slice(ds.indexOf('### 2.9 Complete token block'));
    const start = section.indexOf('```css') + 6;
    const block = section
      .slice(start, section.indexOf('```', start))
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const variables = (css: string) =>
      Object.fromEntries(
        [...css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
          m[1]!,
          m[2]!.replace(/\s+/g, '').toLowerCase(),
        ]),
      );
    const squashed = (record: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, v.replace(/\s+/g, '').toLowerCase()]),
      );
    const rootBlock = block.slice(block.indexOf(':root'), block.indexOf('@media'));
    const desktop = block.slice(block.indexOf('@media (min-width: 1024px)'));
    expect(squashed(ROOT_TOKENS)).toEqual(variables(rootBlock));
    expect(squashed(DESKTOP_TOKENS)).toEqual(
      variables(desktop.slice(0, desktop.indexOf('@media', 10))),
    );
  });

  it('no component or base style writes a raw hex colour (DESIGN_SYSTEM 10)', () => {
    const offenders = allCss
      .filter((f) => !f.endsWith('tokens.css'))
      .flatMap((f) =>
        [...squash(read(f)).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => `${f}: ${m[0]}`),
      );
    expect(offenders).toEqual([]);
  });

  it('translucent colours are brand tokens at an alpha, never a new hue', () => {
    // ink, primary-dark, primary, brand-soft, bg-muted, white, danger, accent, black (hero shadow)
    const allowed = new Set([
      '15,41,32',
      '0,123,62',
      '0,142,72',
      '206,245,227',
      '238,242,240',
      '255,255,255',
      '192,57,43',
      '232,182,93',
      '0,0,0',
    ]);
    const used = allCss.flatMap((f) =>
      [...squash(read(f)).matchAll(/rgba\((\d+,\d+,\d+),/g)].map((m) => m[1]!),
    );
    expect(used.filter((rgb) => !allowed.has(rgb))).toEqual([]);
  });

  it('every media query width is a design-system breakpoint', () => {
    const edges = new Set(
      Object.values(BREAKPOINTS)
        .flatMap((px) => [`${px}px`, `${px - 1}px`])
        .concat(['1440px', '1439px']),
    );
    const widths = allCss.flatMap((f) =>
      [...read(f).matchAll(/\((?:min|max)-width:\s*(\d+px)\)/g)].map((m) => m[1]!),
    );
    expect(widths.filter((w) => !edges.has(w))).toEqual([]);
    // the MUI theme names the same widths sm, md and lg
    expect(createUiTheme().breakpoints.values).toMatchObject({
      sm: BREAKPOINTS.sm,
      md: BREAKPOINTS.lg,
      lg: BREAKPOINTS.xl,
    });
  });
});

/** Known-table tags of the WOFF2 table directory, by index (WOFF2 spec 5.1). */
const WOFF2_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

/** Reads one table of a WOFF2 file; name and fvar are stored untransformed. */
function woff2Table(file: Buffer, tag: string): Buffer {
  const numTables = file.readUInt16BE(12);
  const compressedLength = file.readUInt32BE(20);
  let pos = 48;
  const readBase128 = () => {
    let value = 0;
    for (;;) {
      const byte = file[pos++]!;
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };
  const tables: { tag: string; offset: number; length: number }[] = [];
  let offset = 0;
  for (let i = 0; i < numTables; i++) {
    const flags = file[pos++]!;
    let t = WOFF2_TAGS[flags & 0x3f]!;
    if ((flags & 0x3f) === 63) {
      t = file.toString('latin1', pos, pos + 4);
      pos += 4;
    }
    const origLength = readBase128();
    const version = (flags >> 6) & 3;
    const transformed = t === 'glyf' || t === 'loca' ? version === 0 : version !== 0;
    const length = transformed ? readBase128() : origLength;
    tables.push({ tag: t, offset, length });
    offset += length;
  }
  const data = brotliDecompressSync(file.subarray(pos, pos + compressedLength));
  const entry = tables.find((x) => x.tag === tag);
  if (!entry) throw new Error(`table ${tag} missing`);
  return data.subarray(entry.offset, entry.offset + entry.length);
}

describe('fonts (DESIGN_SYSTEM 2.5, D-065)', () => {
  const fonts = join(root, 'fonts');

  it('ships the UbuntuSans subset under the derivative name, weights 400 to 700', () => {
    const file = readFileSync(join(fonts, 'UbuntuSans-derivative-CSSERP.woff2'));
    const name = woff2Table(file, 'name');
    const count = name.readUInt16BE(2);
    const strings = name.readUInt16BE(4);
    const names = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12;
      if (name.readUInt16BE(r) !== 3) continue; // Windows platform, UTF-16BE
      const id = name.readUInt16BE(r + 6);
      const len = name.readUInt16BE(r + 8);
      const off = strings + name.readUInt16BE(r + 10);
      names.set(
        id,
        Buffer.from(name.subarray(off, off + len))
          .swap16()
          .toString('utf16le'),
      );
    }
    expect(names.get(1)).toBe('Ubuntu Sans derivative CSS ERP');
    expect(names.get(16)).toBe('Ubuntu Sans derivative CSS ERP');
    expect(names.get(6)).toBe('UbuntuSansDerivativeCSSERP-Regular');

    const fvar = woff2Table(file, 'fvar');
    const axesOffset = fvar.readUInt16BE(4);
    const axisCount = fvar.readUInt16BE(8);
    const axes = Array.from({ length: axisCount }, (_, i) => {
      const a = axesOffset + i * 20;
      return [
        fvar.toString('latin1', a, a + 4),
        fvar.readInt32BE(a + 4) / 65536,
        fvar.readInt32BE(a + 12) / 65536,
      ];
    });
    expect(axes).toEqual([['wght', 400, 700]]);
    expect(file.length).toBeLessThan(60_000);
  });

  it('keeps the licence texts and the Bornomala files next to the fonts', () => {
    const files = readdirSync(fonts).sort();
    expect(files).toEqual([
      'Bornomala-Bold.woff2',
      'Bornomala-OFL-1.0-LICENSE.txt',
      'Bornomala-Regular.woff2',
      'UbuntuSans-UFL-1.0-LICENCE.txt',
      'UbuntuSans-derivative-CSSERP.woff2',
    ]);
    const css = read(join(root, 'src/styles/fonts.css'));
    expect(css.match(/font-display: swap/g)).toHaveLength(3);
    expect(css).not.toMatch(/https?:\/\//); // no font CDN at runtime
  });
});
