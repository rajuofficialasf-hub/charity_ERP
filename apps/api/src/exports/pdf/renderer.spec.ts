import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type Browser, chromium } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { documentHtml, html, raw } from './html';
import { listTableHtml } from './list-table';
import { launchOptions, PdfRenderer } from './renderer';

// The PDFs of the exports: HTML built on the server with every value escaped, printed by a
// sandboxed Chromium with the two fonts embedded, no script and no network.
const renderer = new PdfRenderer();
afterAll(async () => renderer.close());

const SAMPLE = listTableHtml({
  locale: 'bn',
  title: 'উপকারভোগীর তালিকা',
  filters: 'জেলা: ঢাকা',
  date: '01-11-2026',
  rowCount: 2,
  headers: ['নাম', 'BEN নম্বর', 'গ্রাম'],
  rows: [
    ['আব্দুল করিম', '1001', 'চর ক্ষেত্রপাড়া'],
    ['রহিমা খাতুন', '1002', 'শ্রীপুর'],
  ],
});

describe('the HTML of a PDF', () => {
  it('prints every value as text, never as markup', () => {
    const out = html`<p title="${'"x"'}">${'<script>alert(1)</script>'}</p>`;
    expect(out.value).toBe('<p title="&quot;x&quot;">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(html`<div>${raw('<b>kept</b>')}</div>`.value).toBe('<div><b>kept</b></div>');
  });

  it('shapes Bengali conjuncts with the embedded Bornomala, as the PDF prints them', async () => {
    // the zero-width non-joiner, by its code: the same letters with the conjunct forced apart
    const apart = `ক্${String.fromCharCode(0x200c)}ষ`;
    const browser = await chromium.launch(launchOptions());
    try {
      const page = await browser.newPage();
      await page.setContent(
        documentHtml({
          locale: 'bn',
          title: 'probe',
          landscape: false,
          body: html`<span id="joined">ক্ষ</span> <span id="apart">${apart}</span>`,
        }),
      );
      await page.evaluate('document.fonts.ready');
      const width = async (id: string) => (await page.locator(`#${id}`).boundingBox())!.width;
      // shaped, the three characters become one narrower glyph than the letters drawn apart
      expect(await width('joined')).toBeGreaterThan(0);
      expect(await width('joined')).toBeLessThan((await width('apart')) * 0.9);
      expect(await page.evaluate("document.fonts.check('16px Bornomala')")).toBe(true);
      expect(await page.evaluate("document.fonts.check('16px UbuntuSans')")).toBe(true);
    } finally {
      await browser.close();
    }
  });
});

describe('the PDF renderer', () => {
  it('prints a list table into a PDF that embeds both fonts', async () => {
    const pdf = await renderer.render(SAMPLE);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = pdf.toString('latin1');
    expect(text).toMatch(/Bornomala/);
    expect(text).toMatch(/Ubuntu/);
  });

  it('lets no request leave while printing', async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      res.end('x');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const page = documentHtml({
        locale: 'en',
        title: 'probe',
        landscape: false,
        body: raw(
          `<img src="http://127.0.0.1:${port}/a.png"><link rel="stylesheet" href="http://127.0.0.1:${port}/b.css"><iframe src="http://127.0.0.1:${port}/c"></iframe>`,
        ),
      });
      const pdf = await renderer.render(page);
      expect(pdf.length).toBeGreaterThan(0);
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });

  it('always runs Chromium in its sandbox', () => {
    const options = launchOptions();
    expect(options.chromiumSandbox).toBe(true);
    expect(options.args ?? []).not.toContain('--no-sandbox');
  });

  it('says a PDF is unavailable when the browser cannot start, instead of falling back', async () => {
    const broken = new PdfRenderer({ executablePath: 'D:/no/such/chromium.exe' });
    await expect(broken.render(SAMPLE)).rejects.toMatchObject({
      code: 'export.pdf_unavailable',
    });
    await broken.close();
  });

  it('starts a new browser after the one it had crashed', async () => {
    const launched: Browser[] = [];
    const recovering = new PdfRenderer({
      launch: async () => {
        const browser = await chromium.launch(launchOptions());
        launched.push(browser);
        return browser;
      },
    });
    try {
      await recovering.render(SAMPLE);
      await launched[0]!.close();
      const pdf = await recovering.render(SAMPLE);
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(launched).toHaveLength(2);
    } finally {
      await recovering.close();
    }
  });
});
