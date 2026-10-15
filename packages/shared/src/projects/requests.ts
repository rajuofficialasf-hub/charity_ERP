import { z } from 'zod';
import { boundedLabel } from '../jsonb/common.js';
import { PROJECT_STATUSES } from './lifecycle.js';
import { WORKFLOW_KEYS } from './workflow-defaults.js';

/** A project code: 2 to 8 capital letters, also the prefix of the application ids (O-03). */
export const projectCode = z.string().regex(/^[A-Z]{2,8}$/);
const year = z.number().int().min(2020).max(2100);
/** A calendar date, yyyy-mm-dd. */
const date = z.iso.date();
/** Taka with up to two decimals, as a string so no amount passes through floating point. */
// eslint-disable-next-line security/detect-unsafe-regex -- bounded repetitions without nesting: linear
export const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

export const projectCreateSchema = z.strictObject({
  programId: z.uuid(),
  code: projectCode,
  year,
  name: boundedLabel,
  description: z.string().max(2000).optional(),
  // a master template and a copy of a project come as further kinds of source
  source: z.strictObject({ kind: z.literal('workflow'), workflowKey: z.enum(WORKFLOW_KEYS) }),
});
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

/**
 * Setup fields of the project row. Which of them may change depends on the project's state
 * (`editableIn`); the server refuses the others. At least one field.
 */
export const projectUpdateSchema = z
  .strictObject({
    name: boundedLabel.optional(),
    description: z.string().max(2000).nullable().optional(),
    programId: z.uuid().optional(),
    year: year.optional(),
    workflowKey: z.enum(WORKFLOW_KEYS).optional(),
    applyFrom: date.nullable().optional(),
    applyTo: date.nullable().optional(),
    perVolunteerLimit: z.number().int().min(1).max(100_000).nullable().optional(),
    costPerBeneficiary: money.nullable().optional(),
    targetBeneficiaries: z.number().int().min(1).max(10_000_000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const projectFilterSchema = z.strictObject({
  programId: z.uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});
export type ProjectFilter = z.infer<typeof projectFilterSchema>;
