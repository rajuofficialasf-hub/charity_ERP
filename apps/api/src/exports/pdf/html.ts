import { readFonts } from './fonts.js';

/** Markup the server wrote itself; every other value put into a page is escaped first. */
export class SafeHtml {
  constructor(readonly value: string) {}
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** A value as HTML text: the five characters that could start markup are written as entities. */
export function escapeHtml(value: string): string {
  // eslint-disable-next-line security/detect-object-injection -- one of the five matched characters
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Markup the caller vouches for, put into a page as it is. Never for anything a person typed. */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

type Part = SafeHtml | string | number | null | undefined | readonly Part[];

function partOf(value: Part): string {
  if (value === null || value === undefined) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return (value as readonly Part[]).map(partOf).join('');
  return escapeHtml(String(value));
}

/**
 * The only way values enter a PDF's HTML: a template whose every interpolated value is escaped,
 * unless it is markup this module or its callers built with `html` or `raw`.
 */
export function html(strings: TemplateStringsArray, ...values: Part[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, i) => {
    out += partOf(value) + (strings[i + 1] ?? '');
  });
  return new SafeHtml(out);
}

/**
 * A whole page for the printer: the two fonts inlined, the design tokens, and a content policy
 * that allows nothing to load from anywhere but the page itself.
 */
export function documentHtml(input: {
  locale: 'bn' | 'en';
  title: string;
  landscape: boolean;
  body: SafeHtml;
}): string {
  const fonts = readFonts();
  return `<!doctype html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">
<title>${escapeHtml(input.title)}</title>
<style>
@font-face { font-family: 'Public Sans'; src: url(data:font/woff2;base64,${fonts.publicSans}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Noto Sans Bengali'; src: url(data:font/woff2;base64,${fonts.notoBengali}) format('woff2'); font-weight: 100 900; }
@page { size: A4 ${input.landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Public Sans', 'Noto Sans Bengali', sans-serif; font-size: 10pt; line-height: 1.5; color: #1c252e; }
h1 { font-size: 15pt; font-weight: 700; margin: 0 0 4pt; color: #007867; }
h2 { font-size: 12pt; font-weight: 700; margin: 12pt 0 4pt; }
.meta { color: #637381; margin: 0 0 10pt; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 0.5pt solid #dfe3e8; padding: 3pt 5pt; text-align: start; vertical-align: top; }
th { background: #f4f6f8; font-weight: 700; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
dl { display: grid; grid-template-columns: 35% 65%; gap: 2pt 8pt; margin: 0; }
dt { color: #637381; }
dd { margin: 0; }
</style>
</head>
<body>${input.body.value}</body>
</html>`;
}
