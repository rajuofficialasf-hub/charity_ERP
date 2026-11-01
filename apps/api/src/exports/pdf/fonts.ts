import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '../../i18n/api-error';

/**
 * The self-hosted fonts of the design system (packages/ui/fonts, docs/ui/brand/colors.md): from
 * `src/exports/pdf` and from `dist/exports/pdf` alike, read once and kept as base64 for the
 * pages the printer loads without any network.
 */
const FONT_DIR = join(__dirname, '../../../../../packages/ui/fonts');

interface Fonts {
  ubuntuSans: string;
  bornomalaRegular: string;
  bornomalaBold: string;
}

let cached: Fonts | null = null;

/** The fonts as base64; a host without the font files cannot print, and says so. */
export function readFonts(): Fonts {
  try {
    cached ??= {
      ubuntuSans: readFileSync(join(FONT_DIR, 'UbuntuSans-derivative-CSSERP.woff2')).toString(
        'base64',
      ),
      bornomalaRegular: readFileSync(join(FONT_DIR, 'Bornomala-Regular.woff2')).toString('base64'),
      bornomalaBold: readFileSync(join(FONT_DIR, 'Bornomala-Bold.woff2')).toString('base64'),
    };
  } catch {
    throw new ApiError('export.pdf_unavailable', 503);
  }
  return cached;
}
