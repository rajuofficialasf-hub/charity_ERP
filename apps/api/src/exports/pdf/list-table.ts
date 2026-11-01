import { formatCount } from '@css/shared/format';
import { type MessageKey, translate } from '@css/shared/i18n';
import { documentHtml, html } from './html';

/**
 * A list printed as a landscape table: the list's name, the filters, the date and the number of
 * rows above it, the header row repeated on every page.
 */
export function listTableHtml(input: {
  locale: 'bn' | 'en';
  title: string;
  filters: string;
  date: string;
  rowCount: number;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}): string {
  const rows = translate(input.locale, 'exports.pdf.rows' as MessageKey, {
    count: formatCount(input.rowCount, input.locale),
  });
  const meta = [input.filters, input.date, rows].filter(Boolean).join(' · ');
  const body = html`<h1>${input.title}</h1>
    <p class="meta">${meta}</p>
    <table>
      <thead>
        <tr>
          ${input.headers.map((h) => html`<th>${h}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${input.rows.map(
          (r) =>
            html`<tr>
              ${r.map((c) => html`<td>${c}</td>`)}
            </tr>`,
        )}
      </tbody>
    </table>`;
  return documentHtml({ locale: input.locale, title: input.title, landscape: true, body });
}
