import type { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import ExcelJS from 'exceljs';
import {
  type FileColumn,
  type FileWords,
  fileWords,
  headersOf,
  isCoded,
  labelOf,
  OutputGuard,
  textsOf,
} from './file';
import type { RepeatRow } from './questions';
import type { Cell } from './rows';

/** Dhaka is six hours ahead of UTC all year; a spreadsheet shows a moment as it was read there. */
const DHAKA_MS = 6 * 60 * 60 * 1000;

/** The most characters an Excel cell holds; a longer text is cut there with an ellipsis. */
const CELL_MAX = 32_767;

/** Amounts grouped by lakh and crore, as the department writes them. */
const MONEY_FORMAT = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';

/** The repeated answers of one application, for the workbook's second sheet. */
export interface RepeatSet {
  appNo: string;
  rows: readonly RepeatRow[];
}

/**
 * An Excel export (docs/ui/I18N.md, "Exports, PDF, email and SMS"): the list on the first sheet
 * with the same columns as the CSV, numbers and dates as real number and date cells, every other
 * value a plain text cell (never a formula or a link); a question that repeats inside an
 * application goes to a second sheet, one row per repeat with the application number. The writer
 * keeps the compressed sheets in memory until the end, about ten megabytes per hundred thousand
 * rows.
 */
export class XlsxFile {
  private readonly words: FileWords;
  private readonly guard: OutputGuard;
  private readonly book: ExcelJS.stream.xlsx.WorkbookWriter;
  private readonly rows: ExcelJS.Worksheet;
  private readonly repeats: ExcelJS.Worksheet | null;

  constructor(
    private readonly out: Writable,
    private readonly columns: readonly FileColumn[],
    private readonly locale: 'bn' | 'en',
    private readonly repeatColumns: readonly FileColumn[] = [],
  ) {
    this.guard = new OutputGuard(out);
    this.words = fileWords(locale);
    this.book = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: out,
      useStyles: true,
      useSharedStrings: false,
    });
    this.rows = this.book.addWorksheet(this.words.rowsSheet);
    this.rows.addRow(headersOf(columns, this.words)).commit();
    this.repeats =
      repeatColumns.length > 0 ? this.book.addWorksheet(this.words.repeatsSheet) : null;
    this.repeats
      ?.addRow([
        this.words.appNo,
        this.words.group,
        this.words.rowNo,
        ...headersOf(repeatColumns, this.words),
      ])
      .commit();
  }

  row(cells: Readonly<Record<string, Cell>>, repeats?: RepeatSet): Promise<void> {
    this.guard.check();
    this.put(this.rows, [], this.columns, cells);
    if (this.repeats && repeats)
      for (const r of repeats.rows)
        this.put(this.repeats, [repeats.appNo, r.group, r.index + 1], this.repeatColumns, r.cells);
    // the workbook writer keeps its parts until the end, so nothing waits here per row
    return Promise.resolve();
  }

  async end(): Promise<void> {
    this.guard.check();
    this.rows.commit();
    this.repeats?.commit();
    await this.book.commit();
    await finished(this.out);
  }

  private put(
    sheet: ExcelJS.Worksheet,
    lead: readonly (string | number)[],
    columns: readonly FileColumn[],
    cells: Readonly<Record<string, Cell>>,
  ): void {
    const row = sheet.addRow([]);
    let at = 1;
    for (const value of lead) row.getCell(at++).value = value;
    for (const column of columns) {
      const cell = Object.hasOwn(cells, column.id) ? cells[column.id] : undefined;
      for (const [value, numFmt] of this.valuesOf(cell, column)) {
        const target = row.getCell(at++);
        target.value = value;
        if (numFmt) target.numFmt = numFmt;
      }
    }
    row.commit();
  }

  /** A cell's values as typed workbook cells, with the number format of a date or an amount. */
  private valuesOf(
    cell: Cell | undefined,
    column: FileColumn,
  ): [ExcelJS.CellValue, string | undefined][] {
    if (column.kind === 'coded')
      return cell !== undefined && cell !== null && isCoded(cell)
        ? [
            [labelOf(cell, this.locale), undefined],
            [cell.code, undefined],
          ]
        : textsOf(cell, column, this.locale, this.words).map((t) => [t || null, undefined]);
    if (cell === undefined || cell === null) return [[null, undefined]];
    if (cell instanceof Date)
      return column.kind === 'datetime'
        ? [[new Date(cell.getTime() + DHAKA_MS), 'dd-mm-yyyy hh:mm']]
        : [[cell, 'dd-mm-yyyy']];
    if (typeof cell === 'number')
      return [[cell, column.kind === 'money' ? MONEY_FORMAT : undefined]];
    // every other value is text: a plain string cell, which a spreadsheet never runs
    const text = textsOf(cell, column, this.locale, this.words)[0] ?? '';
    return [[text.length > CELL_MAX ? `${text.slice(0, CELL_MAX - 1)}…` : text, undefined]];
  }
}
