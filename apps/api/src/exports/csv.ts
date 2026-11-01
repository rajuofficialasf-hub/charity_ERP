import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import {
  type FileColumn,
  type FileWords,
  fileWords,
  guardFormula,
  headersOf,
  textsOf,
} from './file';
import type { Cell } from './rows';

/** The byte-order mark, written by its code so no invisible character sits in the source. */
const BOM = String.fromCharCode(0xfeff);
const LINE = '\r\n';

/** One CSV value: quoted when it holds a comma, a quote or a line break. */
function quoted(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A CSV export written row by row to a stream (docs/ui/I18N.md, "Exports, PDF, email and SMS"):
 * UTF-8 with a byte-order mark so Excel reads Bengali, CRLF lines, the header row in the file's
 * language, and no value that starts a formula.
 */
export class CsvFile {
  private readonly words: FileWords;

  constructor(
    private readonly out: Writable,
    private readonly columns: readonly FileColumn[],
    private readonly locale: 'bn' | 'en',
  ) {
    this.words = fileWords(locale);
  }

  async start(): Promise<void> {
    await this.write(BOM + this.line(headersOf(this.columns, this.words)));
  }

  async row(cells: Readonly<Record<string, Cell>>): Promise<void> {
    const values = this.columns.flatMap((c) =>
      textsOf(Object.hasOwn(cells, c.id) ? cells[c.id] : undefined, c, this.locale, this.words),
    );
    await this.write(this.line(values));
  }

  async end(): Promise<void> {
    this.out.end();
    await finished(this.out);
  }

  private line(values: readonly string[]): string {
    return values.map((v) => quoted(guardFormula(v))).join(',') + LINE;
  }

  /** Writes and waits when the stream asks to, so a large file never piles up in memory. */
  private async write(text: string): Promise<void> {
    if (!this.out.write(text, 'utf8')) await once(this.out, 'drain');
  }
}
