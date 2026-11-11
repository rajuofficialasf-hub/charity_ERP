import { PassThrough, Writable } from 'node:stream';
import { bn } from '@css/shared/i18n';
import { describe, expect, it } from 'vitest';
import { CsvFile } from './csv.js';
import type { FileColumn } from './file.js';

/** The whole text a CSV file writes, read back from its stream. */
async function written(
  columns: FileColumn[],
  rows: Record<string, unknown>[],
  locale: 'bn' | 'en' = 'bn',
) {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c: Buffer) => chunks.push(c));
  const file = new CsvFile(out, columns, locale);
  await file.start();
  for (const cells of rows) await file.row(cells as never);
  await file.end();
  return Buffer.concat(chunks);
}

const text = (id: string, header = id): FileColumn => ({ id, header, kind: 'text' });

describe('a CSV export', () => {
  it('opens with the byte-order mark, a header row and CRLF lines, with Bengali intact', async () => {
    const bytes = await written(
      [text('name', 'নাম'), text('village', 'গ্রাম')],
      [{ name: 'আব্দুল করিম', village: 'চর গ্রাম' }],
    );
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString('utf8')).toBe('নাম,গ্রাম\r\nআব্দুল করিম,চর গ্রাম\r\n');
  });

  it('quotes a value holding a comma, a quote or a line break', async () => {
    const out = (await written([text('a')], [{ a: 'x, "y"\nz' }])).subarray(3).toString('utf8');
    expect(out).toBe('a\r\n"x, ""y""\nz"\r\n');
  });

  it('never lets a value start a formula when the sheet opens', async () => {
    const values = ['=SUM(A1)', '+1', '-1', '@x', '\tx', '\rx'];
    const out = (
      await written(
        [text('a')],
        values.map((a) => ({ a })),
      )
    )
      .subarray(3)
      .toString('utf8');
    const lines = out.split('\r\n').slice(1, -1);
    expect(lines).toEqual(["'=SUM(A1)", "'+1", "'-1", "'@x", "'\tx", '"\'\rx"']);
  });

  it('writes a coded value as its words beside a column of its code', async () => {
    const out = (
      await written(
        [{ id: 'status', header: 'অবস্থা', kind: 'coded' }],
        [{ status: { code: 'submitted', source: 'application.status' } }],
      )
    )
      .subarray(3)
      .toString('utf8')
      .split('\r\n');
    expect(out[0]).toBe('অবস্থা,অবস্থা (কোড)');
    expect(out[1]).toBe(`${bn.applications.status.submitted},submitted`);
    expect(bn.applications.status.submitted).not.toBe('submitted');
  });

  it('writes dates as dd-mm-yyyy, numbers as plain digits, yes or no in words, and lists joined', async () => {
    const out = (
      await written(
        [
          { id: 'born', header: 'born', kind: 'date' },
          { id: 'age', header: 'age', kind: 'number' },
          { id: 'blocked', header: 'blocked', kind: 'flag' },
          { id: 'projects', header: 'projects', kind: 'text' },
          { id: 'missing', header: 'missing', kind: 'text' },
        ],
        [
          {
            born: new Date('1990-03-05T00:00:00.000Z'),
            age: 1234567,
            blocked: true,
            projects: ['শীতবস্ত্র', 'ইফতার'],
          },
        ],
        'en',
      )
    )
      .subarray(3)
      .toString('utf8')
      .split('\r\n');
    expect(out[1]).toBe('05-03-1990,1234567,Yes,"শীতবস্ত্র, ইফতার",');
  });

  it('writes a negative number as a number, and guards only the text', async () => {
    const out = (
      await written(
        [
          { id: 'n', header: 'n', kind: 'number' },
          { id: 'note', header: 'note', kind: 'text' },
        ],
        [{ n: -500, note: '-500' }],
      )
    )
      .subarray(3)
      .toString('utf8')
      .split('\r\n');
    expect(out[1]).toBe("-500,'-500");
  });

  it('fails a row instead of waiting forever when its stream has broken', async () => {
    const broken = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, done) {
        setImmediate(() => done());
      },
    });
    const file = new CsvFile(broken, [text('a')], 'bn');
    await file.start();
    broken.destroy(new Error('disk full'));
    await new Promise((r) => setImmediate(r));
    await expect(file.row({ a: 'x' })).rejects.toThrow('disk full');
  });
});
