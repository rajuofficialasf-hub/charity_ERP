/** Removes a UTF-8 byte order mark (Excel writes one). */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Minimal RFC 4180 CSV reading and writing for the locations master and the seed's own lists
 * (UTF-8, quotes; a comma by default, a tab for a list copied out of a spreadsheet).
 */
export function parseCsv(text: string, delimiter: ',' | '\t' = ','): string[][] {
  return parseCsvLines(text, delimiter).map((r) => r.cells);
}

/**
 * The rows of a CSV text with the line each starts on (the first line is 1), so a problem can name
 * the line a person sees in their editor; empty rows are left out, but still counted.
 */
export function parseCsvLines(
  text: string,
  delimiter: ',' | '\t' = ',',
): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const source = stripBom(text);
  const endRow = () => {
    row.push(cell);
    if (row.some((v) => v !== '')) rows.push({ line: rowLine, cells: row });
    row = [];
    cell = '';
  };
  for (let i = 0; i < source.length; i++) {
    const c = source.charAt(i);
    // a line break inside a quoted cell still moves the line count on
    const crlf = c === '\r' && source[i + 1] === '\n';
    if (c === '\n' || (c === '\r' && !crlf)) line++;
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (crlf) {
        i++;
        line++;
      }
      endRow();
      rowLine = line;
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

export function toCsv(rows: string[][]): string {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(escape).join(',')).join('\n') + '\n';
}

/** Rows as objects keyed by the header row. */
export function parseCsvRecords(
  text: string,
  delimiter: ',' | '\t' = ',',
): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text, delimiter);
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r.at(i) ?? ''])));
}
