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
  // a workflow's starting setup, a master template, or a copy of a previous project (BD-10)
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('workflow'), workflowKey: z.enum(WORKFLOW_KEYS) }),
    z.strictObject({ kind: z.literal('template'), templateId: z.uuid() }),
    z.strictObject({ kind: z.literal('copy'), projectId: z.uuid() }),
  ]),
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

/** A later end date for the application window of an active project, with the reason (BD-16). */
export const extendDeadlineSchema = z.strictObject({
  newApplyTo: date,
  reason: z.string().trim().min(3).max(1000),
});
export type ExtendDeadline = z.infer<typeof extendDeadlineSchema>;

export const projectFilterSchema = z.strictObject({
  programId: z.uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  /** Only the projects whose application window ends within the next few days. */
  endingSoon: z.enum(['true']).optional(),
});
export type ProjectFilter = z.infer<typeof projectFilterSchema>;
