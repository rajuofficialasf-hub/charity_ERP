// Builds the app icons in public/icons from the organisation's logo (public/brand/logo.svg,
// docs/ui/brand/colors.md): the logo centred on a white square, as the owner chose on 2026-11-01.
// Three shapes are written, because the platforms read different ones: `icon.svg` and the
// `icon-<size>.png` files with rounded corners for the browser tab and desktop installs
// (`purpose: any`), `icon-maskable-512.png` with the logo inside the safe zone for Android's own
// mask (`purpose: maskable`), and `apple-touch-icon.png` at 180 px, which iOS rounds itself.
// Run with `pnpm --filter @css/web icons` after a change to the logo; the outputs are committed,
// so a build needs no image tool.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const target = join(publicDir, 'icons');

const CANVAS = 512;
const LOGO = { width: 114.03, height: 72.58 };
const WHITE = '#FFFFFF';

/** The logo's drawing without its outer `<svg>` element. */
function logoBody() {
  const svg = readFileSync(join(publicDir, 'brand', 'logo.svg'), 'utf8');
  const open = svg.indexOf('>', svg.indexOf('<svg')) + 1;
  const close = svg.lastIndexOf('</svg>');
  return svg.slice(open, close);
}

/**
 * A square SVG with the logo centred at the given share of the width; `radius` rounds the white
 * square's corners (0 keeps the whole square white).
 */
function square(body, share, radius) {
  const width = CANVAS * share;
  const scale = width / LOGO.width;
  const height = LOGO.height * scale;
  const x = (CANVAS - width) / 2;
  const y = (CANVAS - height) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="${WHITE}"/>`,
    `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})">${body}</g>`,
    '</svg>',
  ].join('\n');
}

async function png(svg, size, file) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(target, file));
}

const body = logoBody();
const rounded = square(body, 0.82, CANVAS * 0.2);
const maskable = square(body, 0.6, 0);
const apple = square(body, 0.82, 0);

mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'icon.svg'), rounded + '\n');
await png(rounded, 192, 'icon-192.png');
await png(rounded, 512, 'icon-512.png');
await png(maskable, 512, 'icon-maskable-512.png');
await png(apple, 180, 'apple-touch-icon.png');
process.stdout.write(`icons written to ${target}\n`);
