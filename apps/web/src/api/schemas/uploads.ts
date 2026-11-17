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

/**
 * The details of a stored file, as the photo viewer shows them: the position only for a reader
 * who may see it (absent otherwise), the uploader's name only for an official or the uploader.
 */
export const fileDetailsSchema = uploadedFileSchema.extend({
  gps: z
    .object({ lat: z.number(), lng: z.number(), accuracyM: z.number().nullable() })
    .nullable()
    .optional(),
  duplicateOf: z.uuid().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  uploadedBy: z.object({ name: z.string() }).nullable(),
  records: z.array(z.object({ entityType: z.string(), entityId: z.uuid() })),
});
export type FileDetails = z.infer<typeof fileDetailsSchema>;
