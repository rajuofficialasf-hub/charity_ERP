import { z } from 'zod';
import { dateTime } from './common';

/** An upload in progress as the server holds it. */
export const uploadSessionSchema = z.object({
  id: z.uuid(),
  chunkSize: z.number().int(),
  partCount: z.number().int(),
  partsReceived: z.array(z.number().int()),
  bytesReceived: z.number().int(),
  expiresAt: dateTime,
  fileId: z.uuid().nullable(),
});
export type UploadSession = z.infer<typeof uploadSessionSchema>;

/** A stored file right after its upload. */
export const uploadedFileSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  capturedAt: dateTime.nullable(),
  uploadedAt: dateTime,
  virusScan: z.enum(['pending', 'clean', 'infected', 'failed', 'skipped']),
  flags: z.array(z.string()),
});
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
