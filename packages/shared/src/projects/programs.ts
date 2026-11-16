import { z } from 'zod';
import { boundedLabel } from '../jsonb/common.js';
import { shortDescription } from './requests.js';

/** A program code: 2 to 12 capital letters (the contract's ProgramCreate). */
export const programCode = z.string().regex(/^[A-Z]{2,12}$/);

export const programCreateSchema = z.strictObject({
  code: programCode,
  name: boundedLabel,
  /** The short description on the program's card, in both languages. */
  description: shortDescription.optional(),
  pmUserId: z.uuid().optional(),
});
export type ProgramCreate = z.infer<typeof programCreateSchema>;

/**
 * Rename a program, change its short description (null removes it), deactivate or activate it; at
 * least one of the three.
 */
export const programUpdateSchema = z
  .strictObject({
    name: boundedLabel.optional(),
    description: shortDescription.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (b) => b.name !== undefined || b.description !== undefined || b.active !== undefined,
    'name, description or active is required',
  );
export type ProgramUpdate = z.infer<typeof programUpdateSchema>;

export const programPmSchema = z.strictObject({ pmUserId: z.uuid() });
export type ProgramPm = z.infer<typeof programPmSchema>;
