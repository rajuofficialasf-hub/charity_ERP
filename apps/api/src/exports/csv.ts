import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import {
  type FileColumn,
  type FileWords,
  fileWords,
  guardFormula,
  headersOf,
  OutputGuard,
  textsOf,
} from './file.js';
import type { Cell } from './rows.js';

/** The byte-order mark, written by its code so no invisible character sits in the source. */
const BOM = String.fromCharCode(0xfeff);
const LINE = '\r\n';

/** One CSV value: quoted when it holds a comma, a quote or a line break. */
function quoted(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Whether a cell is free text, which a spreadsheet could read as a formula. */
const isText = (cell: Cell | undefined): boolean => typeof cell === 'string' || Array.isArray(cell);

/**
 * A CSV export written row by row to a stream (docs/ui/I18N.md, "Exports, PDF, email and SMS"):
 * UTF-8 with a byte-order mark so Excel reads Bengali, CRLF lines, the header row in the file's
 * language, and no text value that starts a formula. A stream that fails or closes ends the file
 * with its error instead of leaving it waiting.
 */
export class CsvFile {
  private readonly words: FileWords;
  private readonly guard: OutputGuard;

  constructor(
    private readonly out: Writable,
    private readonly columns: readonly FileColumn[],
    private readonly locale: 'bn' | 'en',
  ) {
    this.words = fileWords(locale);
    this.guard = new OutputGuard(out);
  }

  async start(): Promise<void> {
    await this.write(BOM + this.line(headersOf(this.columns, this.words).map(guardFormula)));
  }

  async row(cells: Readonly<Record<string, Cell>>): Promise<void> {
    const values = this.columns.flatMap((c) => {
      const cell = Object.hasOwn(cells, c.id) ? cells[c.id] : undefined;
      const texts = textsOf(cell, c, this.locale, this.words);
      // a number, a date or a yes-or-no is the server's own value; only free text is guarded
      return isText(cell) || c.kind === 'coded' ? texts.map(guardFormula) : texts;
    });
    await this.write(this.line(values));
  }

  async end(): Promise<void> {
    this.guard.check();
    this.out.end();
    await finished(this.out);
  }

  private line(values: readonly string[]): string {
    return values.map(quoted).join(',') + LINE;
  }

  /** Writes and waits when the stream asks to, so a large file never piles up in memory. */
  private async write(text: string): Promise<void> {
    this.guard.check();
    if (!this.out.write(text, 'utf8')) await this.guard.drained(once(this.out, 'drain'));
  }
}
