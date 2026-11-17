import type { ExportList, ExportRequest } from '@css/shared/exports';
import { api } from '../../api/client';
import { saveFile } from '../../lib/save-file';
import type { ExportColumns, ExportColumnView, ExportJob } from '../../api/schemas';

export type { ExportColumnView, ExportJob };

export const EXPORTS_KEY = ['exports'] as const;

/** The reasons a job may fail with; any other code reads as a plain failure. */
const FAILURES = [
  'export.failed',
  'export.pdf_unavailable',
  'export.pdf_failed',
  'export.timed_out',
] as const;

/** The message key of a failed job's reason. */
export const failureKey = (code: string | null): (typeof FAILURES)[number] =>
  FAILURES.find((known) => known === code) ?? 'export.failed';

/** The columns of a list this person may export; the application list names its project. */
export async function exportColumns(
  list: ExportList,
  projectId?: string,
): Promise<ExportColumnView[]> {
  const query = new URLSearchParams({ list, ...(projectId ? { projectId } : {}) });
  const data = await api<ExportColumns>(`/exports/columns?${query.toString()}`);
  return data.columns;
}

export function startExport(request: ExportRequest): Promise<ExportJob> {
  return api<ExportJob>('/exports', { method: 'POST', body: request });
}

/** Starts the PDF of one record: a beneficiary's profile or an application. */
export function startRecordPdf(
  kind: 'beneficiary_profile' | 'application',
  id: string,
): Promise<ExportJob> {
  return kind === 'beneficiary_profile'
    ? api<ExportJob>(`/beneficiaries/${id}/pdf`, { method: 'POST' })
    : api<ExportJob>(`/applications/${id}/pdf`, { method: 'POST' });
}

export function exportJob(id: string): Promise<ExportJob> {
  return api<ExportJob>(`/exports/${id}`);
}

/** The person's own exports of the last 30 days. */
export function myExports(): Promise<ExportJob[]> {
  return api<ExportJob[]>('/exports');
}

/** Dhaka is six hours ahead of UTC all year; the day of a file is Dhaka's, as the server names it. */
const DHAKA_MS = 6 * 60 * 60 * 1000;

/** The name a file is saved under: the list, the day it was asked for, the format. */
export function exportFileName(job: Pick<ExportJob, 'kind' | 'format' | 'createdAt'>): string {
  const day = new Date(Date.parse(job.createdAt) + DHAKA_MS).toISOString().slice(0, 10);
  return `${job.kind}-${day}.${job.format}`;
}

/**
 * Saves a finished export: the API streams it to its requester after its checks, and the browser
 * keeps it under its name. No link that works on its own ever leaves the page.
 */
export async function downloadExport(job: ExportJob): Promise<void> {
  if (!job.fileId) throw new Error('export file missing');
  const blob = await api<Blob>(`/files/${job.fileId}/content`, { blob: true });
  saveFile(blob, exportFileName(job));
}
