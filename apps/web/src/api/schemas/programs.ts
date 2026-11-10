import { z } from 'zod';
import { bilingual, versionedOf } from './common';

/** A program as `GET /programs` returns it. */
export const programSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: bilingual,
  pmUserId: z.uuid().nullable(),
  pmName: z.string().nullable(),
  active: z.boolean(),
});
export type Program = z.infer<typeof programSchema>;

/** The program with its version, read when the edit opens (If-Match). */
export const programRecordSchema = versionedOf(programSchema);
export type ProgramRecord = z.infer<typeof programRecordSchema>;
