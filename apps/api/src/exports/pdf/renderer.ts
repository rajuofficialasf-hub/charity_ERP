import { type Browser, chromium, type LaunchOptions } from 'playwright-core';
import { ApiError } from '../../i18n/api-error';

/** The longest a page may take to load and print. */
const PRINT_TIMEOUT_MS = 60_000;

/**
 * How Chromium starts for the PDFs: always inside its sandbox (never `--no-sandbox`), so a page
 * built from what applicants typed cannot reach the worker, its files or its secrets even through
 * a browser bug. A host that cannot give the sandbox keeps the PDFs off (the export service
 * decision in docs/DECISION_LOG.md).
 */
export function launchOptions(executablePath?: string): LaunchOptions {
  return {
    headless: true,
    chromiumSandbox: true,
    args: ['--disable-dev-shm-usage'],
    ...(executablePath ? { executablePath } : {}),
  };
}

/**
 * Prints the export PDFs from HTML (docs/ui/I18N.md, "Exports, PDF, email and SMS": Chromium's
 * shaping draws Bengali conjuncts and vowel signs correctly). One browser per worker process,
 * started on the first PDF; each document gets a fresh context with JavaScript off and every
 * request refused, so a page loads nothing but what it carries.
 */
export class PdfRenderer {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly options: { executablePath?: string } = {}) {}

  /** The PDF of a page; refuses with `export.pdf_unavailable` when Chromium cannot start here. */
  async render(page: string, options: { landscape: boolean }): Promise<Buffer> {
    const browser = await this.started();
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      await context.route('**/*', (route) => route.abort());
      const tab = await context.newPage();
      tab.setDefaultTimeout(PRINT_TIMEOUT_MS);
      await tab.setContent(page, { waitUntil: 'load' });
      return await tab.pdf({
        format: 'A4',
        landscape: options.landscape,
        printBackground: true,
        preferCSSPageSize: true,
      });
    } finally {
      await context.close();
    }
  }

  /** Closes the browser, if one started; the next PDF starts a new one. */
  async close(): Promise<void> {
    const started = this.browser;
    this.browser = null;
    const browser = started ? await started.catch(() => null) : null;
    await browser?.close();
  }

  private started(): Promise<Browser> {
    this.browser ??= chromium.launch(launchOptions(this.options.executablePath)).catch(() => {
      // the job records the failure with this code; the host's browser problem is no one's input
      this.browser = null;
      throw new ApiError('export.pdf_unavailable', 503);
    });
    return this.browser;
  }
}
