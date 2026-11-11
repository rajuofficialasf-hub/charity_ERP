import { PassThrough } from 'node:stream';
import { bn } from '@css/shared/i18n';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { FileColumn } from './file.js';
import { XlsxFile } from './xlsx.js';

/** The workbook an Excel file writes, read back from its bytes. */
async function written(
  columns: FileColumn[],
  rows: { cells: Record<string, unknown>; repeats?: { appNo: string; rows: unknown[] } }[],
  repeatColumns: FileColumn[] = [],
) {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c: Buffer) => chunks.push(c));
  const file = new XlsxFile(out, columns, 'bn', repeatColumns);
  for (const row of rows) await file.row(row.cells as never, row.repeats as never);
  await file.end();
  const book = new ExcelJS.Workbook();
  const bytes = Buffer.concat(chunks);
  await book.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return book;
}

const values = (sheet: ExcelJS.Worksheet, row: number) =>
  (sheet.getRow(row).values as unknown[]).slice(1);

describe('an Excel export', () => {
  it('holds the header row in the file’s language and keeps numbers, dates and words as such', async () => {
    const book = await written(
      [
        { id: 'name', header: 'নাম', kind: 'text' },
        { id: 'age', header: 'বয়স', kind: 'number' },
        { id: 'born', header: 'জন্মতারিখ', kind: 'date' },
        { id: 'status', header: 'অবস্থা', kind: 'coded' },
      ],
      [
        {
          cells: {
            name: 'আব্দুল করিম',
            age: 42,
            born: new Date('1990-03-05T00:00:00.000Z'),
            status: { code: 'active', source: 'beneficiary.status' },
          },
        },
      ],
    );
    const sheet = book.worksheets[0]!;
    expect(sheet.name).toBe('তালিকা');
    expect(values(sheet, 1)).toEqual(['নাম', 'বয়স', 'জন্মতারিখ', 'অবস্থা', 'অবস্থা (কোড)']);
    const [name, age, born, label, code] = values(sheet, 2);
    expect(name).toBe('আব্দুল করিম');
    expect(age).toBe(42);
    expect(born).toBeInstanceOf(Date);
    expect((born as Date).toISOString().slice(0, 10)).toBe('1990-03-05');
    expect(sheet.getRow(2).getCell(3).numFmt).toBe('dd-mm-yyyy');
    expect(label).toBe(bn.admin.beneficiaries.status.active);
    expect(code).toBe('active');
  });

  it('keeps a value that looks like a formula as plain text, never a formula or a link', async () => {
    const book = await written(
      [{ id: 'note', header: 'note', kind: 'text' }],
      [{ cells: { note: '=HYPERLINK("http://x","y")' } }, { cells: { note: '+1' } }],
    );
    const sheet = book.worksheets[0]!;
    for (const row of [2, 3]) {
      const cell = sheet.getRow(row).getCell(1);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.formula).toBeUndefined();
    }
    expect(sheet.getRow(2).getCell(1).value).toBe('=HYPERLINK("http://x","y")');
  });

  it('puts the repeated answers on a second sheet, one row per member with its application', async () => {
    const book = await written(
      [{ id: 'app_no', header: 'app', kind: 'text' }],
      [
        {
          cells: { app_no: 'WIN-2026-00001' },
          repeats: {
            appNo: 'WIN-2026-00001',
            rows: [
              { group: 'members', index: 0, cells: { 'q:m_name': 'করিম' } },
              { group: 'members', index: 1, cells: { 'q:m_name': 'রহিমা' } },
            ],
          },
        },
      ],
      [{ id: 'q:m_name', header: 'সদস্যের নাম', kind: 'text' }],
    );
    const repeats = book.worksheets[1]!;
    expect(repeats.name).toBe('বারবার আসা উত্তর');
    expect(values(repeats, 1)).toEqual(['আবেদন নম্বর', 'অংশ', 'সারি', 'সদস্যের নাম']);
    expect(values(repeats, 2)).toEqual(['WIN-2026-00001', 'members', 1, 'করিম']);
    expect(values(repeats, 3)).toEqual(['WIN-2026-00001', 'members', 2, 'রহিমা']);
  });

  it('writes twenty thousand rows into a workbook that reads back whole', async () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({ cells: { n: i, name: `নাম ${i}` } }));
    const book = await written(
      [
        { id: 'n', header: 'n', kind: 'number' },
        { id: 'name', header: 'name', kind: 'text' },
      ],
      rows,
    );
    const sheet = book.worksheets[0]!;
    expect(sheet.rowCount).toBe(20_001);
    expect(values(sheet, 20_001)).toEqual([19_999, 'নাম 19999']);
  });

  it('shows a moment at its Dhaka time, groups an amount by lakh, and cuts a text past Excel’s limit', async () => {
    const book = await written(
      [
        { id: 'at', header: 'at', kind: 'datetime' },
        { id: 'amount', header: 'amount', kind: 'money' },
        { id: 'long', header: 'long', kind: 'text' },
      ],
      [
        {
          cells: {
            at: new Date('2026-10-31T04:30:00.000Z'),
            amount: 1260000,
            long: 'ক'.repeat(40_000),
          },
        },
      ],
    );
    const row = book.worksheets[0]!.getRow(2);
    expect((row.getCell(1).value as Date).toISOString()).toBe('2026-10-31T10:30:00.000Z');
    expect(row.getCell(1).numFmt).toBe('dd-mm-yyyy hh:mm');
    expect(row.getCell(2).value).toBe(1260000);
    // grouped by lakh above a lakh and by crore above a crore
    expect(row.getCell(2).numFmt).toContain('[>=100000]');
    expect(row.getCell(2).numFmt).toContain('[>=10000000]');
    expect((row.getCell(3).value as string).length).toBe(32_767);
  });
});
