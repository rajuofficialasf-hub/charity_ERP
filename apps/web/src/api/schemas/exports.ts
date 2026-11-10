import { EXPORT_FORMATS, EXPORT_KINDS } from '@css/shared/exports';
import { z } from 'zod';
import { bilingual, dateTime } from './common';

/** One column the export dialog offers, as `GET /exports/columns` answers it. */
export const exportColumnViewSchema = z.object({
  id: z.string(),
  label: bilingual,
  group: z.enum(['list', 'detail', 'question']),
  protected: z.boolean(),
  onScreen: z.boolean(),
  kind: z.string(),
  section: z.object({ key: z.string(), title: bilingual }).nullable(),
});
export type ExportColumnView = z.infer<typeof exportColumnViewSchema>;

export const exportColumnsSchema = z.object({ columns: z.array(exportColumnViewSchema) });
export type ExportColumns = z.infer<typeof exportColumnsSchema>;

/** An export job as its requester follows it. */
export const exportJobSchema = z.object({
  id: z.uuid(),
  kind: z.enum(EXPORT_KINDS),
  format: z.enum(EXPORT_FORMATS),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  columns: z.array(z.string()),
  rowsDone: z.number().int(),
  rowsTotal: z.number().int().nullable(),
  rowCount: z.number().int().nullable(),
  fileId: z.uuid().nullable(),
  sensitive: z.boolean(),
  errorCode: z.string().nullable(),
  createdAt: dateTime,
  finishedAt: dateTime.nullable(),
  /** The file was deleted after its keep time; the job stays. */
  expired: z.boolean(),
});
export type ExportJob = z.infer<typeof exportJobSchema>;
