import type { ExportFormat, ExportKind, ExportList, ExportRequest } from '@css/shared/exports';
import type { Bilingual } from '@css/shared/i18n';
import { api } from '../../lib/api';

/** One column the dialog offers, as `GET /exports/columns` answers it. */
export interface ExportColumnView {
  id: string;
  label: Bilingual;
  group: 'list' | 'detail' | 'question';
  protected: boolean;
  onScreen: boolean;
  kind: string;
  section: { key: string; title: Bilingual } | null;
}

/** An export job as its requester follows it. */
export interface ExportJob {
  id: string;
  kind: ExportKind;
  format: ExportFormat;
  status: 'queued' | 'running' | 'done' | 'failed';
  columns: string[];
  rowsDone: number;
  rowsTotal: number | null;
  rowCount: number | null;
  fileId: string | null;
  sensitive: boolean;
  errorCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export const EXPORTS_KEY = ['exports'] as const;

/** The columns of a list this person may export; the application list names its project. */
export async function exportColumns(
  list: ExportList,
  projectId?: string,
): Promise<ExportColumnView[]> {
  const query = new URLSearchParams({ list, ...(projectId ? { projectId } : {}) });
  const data = await api<{ columns: ExportColumnView[] }>(`/exports/columns?${query.toString()}`);
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
  const path =
    kind === 'beneficiary_profile' ? `/beneficiaries/${id}/pdf` : `/applications/${id}/pdf`;
  return api<ExportJob>(path, { method: 'POST' });
}

export function exportJob(id: string): Promise<ExportJob> {
  return api<ExportJob>(`/exports/${id}`);
}

/** The person's own exports of the last 30 days. */
export function myExports(): Promise<ExportJob[]> {
  return api<ExportJob[]>('/exports');
}

/** The name a file is saved under: the list, the day it was asked for, the format. */
/** Dhaka is six hours ahead of UTC all year; the day of a file is Dhaka's, as the server names it. */
const DHAKA_MS = 6 * 60 * 60 * 1000;

export function exportFileName(job: Pick<ExportJob, 'kind' | 'format' | 'createdAt'>): string {
  const day = new Date(Date.parse(job.createdAt) + DHAKA_MS).toISOString().slice(0, 10);
  return `${job.kind}-${day}.${job.format}`;
}

/**
 * Saves a finished export: the API streams it to its requester after its checks, and the browser
 * keeps it under its name. No link that works on its own ever leaves the page.
 */
export async function downloadExport(job: ExportJob): Promise<void> {
  if (!job.fileId) return;
  const blob = await api<Blob>(`/files/${job.fileId}/content`, { blob: true });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(job);
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // the save has started; the object is let go once the click is handled
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
