import { once } from 'node:events';
import type { Writable } from 'node:stream';
import type { ColumnKind } from '@css/shared/exports';
import { formatDate, formatDateTime } from '@css/shared/format';
import { bn, en, type MessageKey, translate } from '@css/shared/i18n';
import type { Cell, CodedCell, CodedSource } from './rows.js';

/** A column of an export file: its id among the row's cells, its header and how it is written. */
export interface FileColumn {
  id: string;
  header: string;
  kind: ColumnKind;
}

/** The words of a file in its language: the code column's header, yes and no, sheet names. */
export interface FileWords {
  codeHeader: (header: string) => string;
  yes: string;
  no: string;
  rowsSheet: string;
  repeatsSheet: string;
  appNo: string;
  group: string;
  rowNo: string;
}

export function fileWords(locale: 'bn' | 'en'): FileWords {
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, `exports.file.${key}` as MessageKey, params);
  return {
    codeHeader: (header) => t('code', { header }),
    yes: t('yes'),
    no: t('no'),
    rowsSheet: t('rows_sheet'),
    repeatsSheet: t('repeats_sheet'),
    appNo: t('app_no'),
    group: t('group'),
    rowNo: t('row_no'),
  };
}

/** Where the words of each code list live in the message catalogue (the screens' own words). */
const LABELS: Readonly<Record<CodedSource, string>> = {
  'user.state': 'admin.volunteers.state',
  'volunteer.type': 'admin.projects.volunteers.type',
  'beneficiary.status': 'admin.beneficiaries.status',
  'reference.beneficiary_class': 'admin.beneficiaries.types',
  'reference.gender': 'admin.beneficiaries.gender',
  'application.status': 'applications.status',
};

/** The words of a coded value in the file's language; its code when the catalogue has none. */
export function labelOf(cell: CodedCell, locale: 'bn' | 'en'): string {
  const path = `${LABELS[cell.source]}.${cell.code}`.split('.');
  let node: unknown = locale === 'en' ? en : bn;
  for (const part of path) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return cell.code;
    // an own key of the message catalogue, checked on the line above
    // eslint-disable-next-line security/detect-object-injection
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : cell.code;
}

/** A coded cell, told apart from the other values of a cell. */
export function isCoded(cell: Cell): cell is CodedCell {
  return (
    typeof cell === 'object' && cell !== null && !(cell instanceof Date) && !Array.isArray(cell)
  );
}

/** The headers of a file: a coded column adds a column of its code after its words. */
export function headersOf(columns: readonly FileColumn[], words: FileWords): string[] {
  return columns.flatMap((c) =>
    c.kind === 'coded' ? [c.header, words.codeHeader(c.header)] : [c.header],
  );
}

/**
 * A cell as the text a CSV or a PDF shows: dates dd-mm-yyyy, a moment with its time, numbers in
 * plain digits, yes or no in words, lists joined; a coded value gives its words and its code.
 */
export function textsOf(
  cell: Cell | undefined,
  column: FileColumn,
  locale: 'bn' | 'en',
  words: FileWords,
): string[] {
  if (column.kind === 'coded') {
    if (cell === undefined || cell === null) return ['', ''];
    if (isCoded(cell)) return [labelOf(cell, locale), cell.code];
    return [String(cell), String(cell)];
  }
  if (cell === undefined || cell === null) return [''];
  if (cell instanceof Date)
    return [column.kind === 'datetime' ? formatDateTime(cell, locale) : formatDate(cell)];
  if (typeof cell === 'boolean') return [cell ? words.yes : words.no];
  if (Array.isArray(cell)) return [cell.join(', ')];
  if (isCoded(cell)) return [labelOf(cell, locale)];
  return [String(cell)];
}

/**
 * A text cell that a spreadsheet would read as a formula or a command starts with an apostrophe,
 * so opening the file never runs what someone typed (docs/security/SECURITY_POLICY.md, input and
 * output).
 */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * Watches the stream a file is written to: an error or an early close is kept and thrown at the
 * next write or at the end, and a wait for the stream to drain ends with it, so a job never
 * hangs on a stream that will not take more.
 */
export class OutputGuard {
  private failure: Error | null = null;
  private readonly closed: Promise<never>;

  constructor(private readonly out: Writable) {
    out.on('error', (error: Error) => {
      this.failure ??= error;
    });
    this.closed = once(out, 'close').then(() => {
      throw this.failure ?? new Error('export output closed');
    });
    // a write that never waits must not leave the close unheard
    this.closed.catch(() => undefined);
  }

  /** Throws the stream's error, or that it closed, once either happened. */
  check(): void {
    if (this.failure) throw this.failure;
    if (this.out.destroyed) throw new Error('export output closed');
  }

  /** A drain, or the stream's end with its error, whichever comes first. */
  async drained(drain: Promise<unknown>): Promise<void> {
    await Promise.race([drain, this.closed]);
  }
}
