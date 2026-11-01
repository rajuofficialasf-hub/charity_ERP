import { columnsOf, type ExportList } from '@css/shared/exports';
import { type MessageKey, translate } from '@css/shared/i18n';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { expect } from 'vitest';
import type { ExportColumnView, ExportJob } from '../../src/features/exports/exports-api';
import { server } from './server';

/** The columns the API offers for a list: the shared catalogue's, in its words and order. */
export function catalogueColumns(list: ExportList): ExportColumnView[] {
  return columnsOf(list).map((c) => ({
    id: c.id,
    label: {
      bn: translate('bn', c.header as MessageKey),
      en: translate('en', c.header as MessageKey),
    },
    group: c.group,
    protected: c.cls === 'beneficiary.nid',
    onScreen: c.onScreen,
    kind: c.kind,
    section: null,
  }));
}

export const JOB_ID = '01900000-0000-7000-8000-0000000000e1';
export const FILE_ID = '01900000-0000-7000-8000-0000000000e2';

export const job = (over: Partial<ExportJob> = {}): ExportJob => ({
  id: JOB_ID,
  kind: 'beneficiaries',
  format: 'xlsx',
  status: 'queued',
  columns: ['name'],
  rowsDone: 0,
  rowsTotal: 3,
  rowCount: null,
  fileId: null,
  sensitive: false,
  errorCode: null,
  createdAt: '2026-11-01T04:00:00.000Z',
  finishedAt: null,
  ...over,
});

/**
 * The export endpoints of a list's dialog: the columns, the start (whose body is kept), and the
 * job, which answers each poll with the next of the given states.
 */
export function serveExports(
  list: ExportList,
  options: { columns?: ExportColumnView[]; states?: ExportJob[]; start?: Response } = {},
): { bodies: unknown[]; columnUrls: URL[] } {
  const bodies: unknown[] = [];
  const columnUrls: URL[] = [];
  const states = [...(options.states ?? [job()])];
  server.use(
    http.get('*/api/v1/exports/columns', ({ request }) => {
      columnUrls.push(new URL(request.url));
      return HttpResponse.json({
        data: { columns: options.columns ?? catalogueColumns(list) },
        meta: { requestId: 'req_test' },
      });
    }),
    http.post('*/api/v1/exports', async ({ request }) => {
      bodies.push(await request.json());
      if (options.start) return options.start;
      return HttpResponse.json({ data: job(), meta: { requestId: 'req_test' } }, { status: 202 });
    }),
    http.get('*/api/v1/exports/:jobId', () => {
      const next = states.length > 1 ? states.shift()! : states[0]!;
      return HttpResponse.json({ data: next, meta: { requestId: 'req_test' } });
    }),
  );
  return { bodies, columnUrls };
}

/** The ticked columns of an export dialog, in their order. */
export const tickedColumns = (dialog: HTMLElement): string[] =>
  within(dialog)
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => (box as HTMLInputElement).value);

/**
 * Opens the export dialog of the page on screen and checks that the columns it ticks first are
 * the table's own, in the table's order: each ticked id names a header of the page (several ids
 * may share one cell, as the application number sits in the person's cell).
 */
export async function expectOnScreenColumns(
  user: { click: (element: Element) => Promise<void> },
  headerOf: (id: string) => MessageKey,
): Promise<void> {
  const headers = (await screen.findAllByRole('columnheader')).map((h) => h.textContent?.trim());
  await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
  const expected = [...new Set(tickedColumns(dialog).map((id) => translate('bn', headerOf(id))))];
  expect(headers.filter((h) => h && expected.includes(h))).toEqual(expected);
}
