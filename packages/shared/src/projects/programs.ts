import { z } from 'zod';
import { boundedLabel } from '../jsonb/common.js';

/** A program code: 2 to 12 capital letters (the contract's ProgramCreate). */
export const programCode = z.string().regex(/^[A-Z]{2,12}$/);

export const programCreateSchema = z.strictObject({
  code: programCode,
  name: boundedLabel,
  pmUserId: z.uuid().optional(),
});
export type ProgramCreate = z.infer<typeof programCreateSchema>;

/** Rename, deactivate or activate a program; at least one of the two. */
export const programUpdateSchema = z
  .strictObject({ name: boundedLabel.optional(), active: z.boolean().optional() })
  .refine((b) => b.name !== undefined || b.active !== undefined, 'name or active is required');
export type ProgramUpdate = z.infer<typeof programUpdateSchema>;

export const programPmSchema = z.strictObject({ pmUserId: z.uuid() });
export type ProgramPm = z.infer<typeof programPmSchema>;
