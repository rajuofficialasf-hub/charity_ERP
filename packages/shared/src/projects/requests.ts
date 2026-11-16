import { z } from 'zod';
import { boundedLabel } from '../jsonb/common.js';
import { PROJECT_STATUSES } from './lifecycle.js';
import { SESSION_YEAR_MAX, SESSION_YEAR_MIN, sessionPeriod } from './session.js';
import { WORKFLOW_KEYS } from './workflow-defaults.js';

/** A project code: 2 to 8 capital letters, also the prefix of the application ids. */
export const projectCode = z.string().regex(/^[A-Z]{2,8}$/);
const year = z.number().int().min(SESSION_YEAR_MIN).max(SESSION_YEAR_MAX);
/** A calendar date, yyyy-mm-dd. */
const date = z.iso.date();
/** Taka with up to two decimals, as a string so no amount passes through floating point. */
// eslint-disable-next-line security/detect-unsafe-regex -- bounded repetitions without nesting: linear
export const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

/** Where a new project starts: a workflow's starting setup, a master template, or a copy. */
const startingSource = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('workflow'), workflowKey: z.enum(WORKFLOW_KEYS) }),
  z.strictObject({ kind: z.literal('template'), templateId: z.uuid() }),
  z.strictObject({ kind: z.literal('copy'), projectId: z.uuid() }),
]);

export const projectCreateSchema = z.strictObject({
  programId: z.uuid(),
  code: projectCode,
  year,
  name: boundedLabel,
  description: z.string().max(2000).optional(),
  source: startingSource,
});
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

/** The most characters of a short description, per language. */
export const SHORT_DESCRIPTION_MAX = 500;
const shortText = z.string().trim().max(SHORT_DESCRIPTION_MAX, { message: 'validation.too_long' });
/**
 * The short description of a program or a project series in both languages, as the names are a
 * pair; a language left empty is an empty text.
 */
export const shortDescription = z.strictObject({ bn: shortText, en: shortText });
export type ShortDescription = z.infer<typeof shortDescription>;

/**
 * A project series, the permanent project its yearly sessions belong to: the program it sits in,
 * the code every session carries (the prefix of the application ids), and its names.
 */
export const projectSeriesCreateSchema = z.strictObject({
  programId: z.uuid(),
  code: projectCode,
  name: boundedLabel,
  description: shortDescription.optional(),
});
export type ProjectSeriesCreate = z.infer<typeof projectSeriesCreateSchema>;

/**
 * Rename a series or change its description (null removes it); at least one of the two. The
 * program and the code are fixed once the series exists, so the body has no place for them.
 */
export const projectSeriesUpdateSchema = z
  .strictObject({
    name: boundedLabel.optional(),
    description: shortDescription.nullable().optional(),
  })
  .refine(
    (b) => b.name !== undefined || b.description !== undefined,
    'name or description is required',
  );
export type ProjectSeriesUpdate = z.infer<typeof projectSeriesUpdateSchema>;

/**
 * A new session of a series: its period and the session it copies (the newest one when left
 * out). The code, the program and the names come from the series.
 */
export const sessionCreateSchema = sessionPeriod.safeExtend({
  sourceProjectId: z.uuid().optional(),
});
export type SessionCreate = z.infer<typeof sessionCreateSchema>;

/**
 * A session created in the setup's first step: the series it belongs to, its period and where
 * its setup starts. The code, the program, the names and the year come from the series and the
 * period, never from the body.
 */
export const seriesSessionCreateSchema = sessionPeriod.safeExtend({
  seriesId: z.uuid(),
  source: startingSource,
});
export type SeriesSessionCreate = z.infer<typeof seriesSessionCreateSchema>;

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

/** A later end date for the application window of an active project, with the reason. */
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
