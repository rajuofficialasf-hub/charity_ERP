import type { Logger } from 'pino';
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

export interface RendererOptions {
  executablePath?: string;
  logger?: Pick<Logger, 'error'>;
  /** Starts the browser; the tests hand in their own to watch a crash. */
  launch?: () => Promise<Browser>;
}

/**
 * Prints the export PDFs from HTML (docs/ui/I18N.md, "Exports, PDF, email and SMS": Chromium's
 * shaping draws Bengali conjuncts and vowel signs correctly). One browser per worker process,
 * started on the first PDF and started again after it crashed or closed; each document gets a
 * fresh context with JavaScript off and every request refused, so a page loads nothing but what
 * it carries. The page's own CSS sets its size and orientation. Every failure answers a fixed
 * code; the browser's own message is logged, never handed on.
 */
export class PdfRenderer {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly options: RendererOptions = {}) {}

  /** The PDF of a page; refuses with `export.pdf_unavailable` when Chromium cannot start here. */
  async render(page: string): Promise<Buffer> {
    let browser = await this.started();
    // a browser that closed before its disconnect was heard is started again, not printed on
    if (!browser.isConnected()) {
      this.browser = null;
      browser = await this.started();
    }
    try {
      const context = await browser.newContext({ javaScriptEnabled: false });
      try {
        await context.route('**/*', (route) => route.abort());
        const tab = await context.newPage();
        tab.setDefaultTimeout(PRINT_TIMEOUT_MS);
        await tab.setContent(page, { waitUntil: 'load' });
        return await tab.pdf({ printBackground: true, preferCSSPageSize: true });
      } finally {
        await context.close().catch(() => undefined);
      }
    } catch (error) {
      this.options.logger?.error({ err: error }, 'export pdf: printing failed');
      throw new ApiError('export.pdf_failed', 500);
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
    if (this.browser) return this.browser;
    const launching = (
      this.options.launch ?? (() => chromium.launch(launchOptions(this.options.executablePath)))
    )()
      .then((browser) => {
        // a browser that crashed or closed is forgotten, so the next PDF starts a new one
        browser.on('disconnected', () => {
          if (this.browser === launching) this.browser = null;
        });
        return browser;
      })
      .catch((error: unknown) => {
        this.options.logger?.error({ err: error }, 'export pdf: the browser did not start');
        if (this.browser === launching) this.browser = null;
        throw new ApiError('export.pdf_unavailable', 503);
      });
    this.browser = launching;
    return launching;
  }
}
