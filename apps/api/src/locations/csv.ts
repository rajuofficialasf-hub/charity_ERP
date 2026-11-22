/** Removes a UTF-8 byte order mark (Excel writes one). */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Minimal RFC 4180 CSV reading and writing for the locations master and the seed's own lists
 * (UTF-8, quotes; a comma by default, a tab for a list copied out of a spreadsheet).
 */
export function parseCsv(text: string, delimiter: ',' | '\t' = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = stripBom(text);
  for (let i = 0; i < source.length; i++) {
    const c = source.charAt(i);
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
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ''));
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
