import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ApiError } from '../../i18n/api-error.js';

// a file of a package, as Node finds it; Vitest's module runner has no `import.meta.resolve`
const { resolve } = createRequire(import.meta.url);

/**
 * The fonts of the asf UI system (docs/architecture/ADR/ADR-016-asf-ui-system.md): Public Sans for
 * the Latin letters and the digits, Noto Sans Bengali for the Bengali letters, from the same
 * fontsource packages the web app serves. Read once and kept as base64 for the pages the printer
 * loads without any network.
 */
const FILES = {
  publicSans: '@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2',
  notoBengali:
    '@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-bengali-wght-normal.woff2',
} as const;

type Fonts = Record<keyof typeof FILES, string>;

let cached: Fonts | null = null;

/** The fonts as base64; a host without the font files cannot print, and says so. */
export function readFonts(): Fonts {
  try {
    cached ??= {
      publicSans: readFileSync(resolve(FILES.publicSans)).toString('base64'),
      notoBengali: readFileSync(resolve(FILES.notoBengali)).toString('base64'),
    };
  } catch {
    throw new ApiError('export.pdf_unavailable', 503);
  }
  return cached;
}
