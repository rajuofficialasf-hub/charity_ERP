import { formatDate } from '@css/shared/format';
import { type MessageKey, translate } from '@css/shared/i18n';
import { fileWords, labelOf } from '../file.js';
import type { Cell, CodedSource } from '../rows.js';
import { html, type SafeHtml } from './html.js';

/** One fact of a record: its words and its value; a fact the person may not see is left out. */
export interface Fact {
  label: string;
  value: string;
}

/** A cell as the text a record's PDF prints. */
export function cellText(cell: Cell | undefined, locale: 'bn' | 'en'): string {
  if (cell === undefined || cell === null) return '';
  if (cell instanceof Date) return formatDate(cell);
  if (typeof cell === 'boolean') {
    const words = fileWords(locale);
    return cell ? words.yes : words.no;
  }
  if (Array.isArray(cell)) return cell.join(', ');
  if (typeof cell === 'object') return labelOf(cell, locale);
  return String(cell);
}

/** A date the API sends as ISO text, as the PDF prints it. */
export function dateText(value: string | null | undefined): string {
  return value ? formatDate(new Date(value)) : '';
}

/** The words of a code list's value. */
export function codeText(
  code: string | null | undefined,
  source: CodedSource,
  locale: 'bn' | 'en',
): string {
  return code ? labelOf({ code, source }, locale) : '';
}

/** The words of a message of the catalogue. */
export function words(locale: 'bn' | 'en', key: MessageKey): string {
  return translate(locale, key);
}

/** A section of facts as a two-column table; empty values are left out, an empty section too. */
export function factsHtml(title: string, facts: readonly (Fact | null)[]): SafeHtml {
  const shown = facts.filter((f): f is Fact => f !== null && f.value !== '');
  if (shown.length === 0) return html``;
  return html`<h2>${title}</h2>
    <table class="facts">
      <tbody>
        ${shown.map(
          (f) =>
            html`<tr>
              <th>${f.label}</th>
              <td>${f.value}</td>
            </tr>`,
        )}
      </tbody>
    </table>`;
}

/** A section of rows as a table with a header row; nothing when there are no rows. */
export function tableHtml(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): SafeHtml {
  if (rows.length === 0) return html``;
  return html`<h2>${title}</h2>
    <table>
      <thead>
        <tr>
          ${headers.map((h) => html`<th>${h}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (r) =>
            html`<tr>
              ${r.map((c) => html`<td>${c}</td>`)}
            </tr>`,
        )}
      </tbody>
    </table>`;
}
