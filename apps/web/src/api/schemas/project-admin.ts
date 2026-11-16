import { PROJECT_STATUSES, WORKFLOW_KEYS } from '@css/shared/projects';
import { z } from 'zod';
import { bilingual, date, dateTime, versionedOf } from './common';

/** A project as an official sees it (`GET /projects`, `GET /projects/{id}`). */
export const projectSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  year: z.number().int(),
  name: bilingual,
  status: z.enum(PROJECT_STATUSES),
  workflowKey: z.enum(WORKFLOW_KEYS),
  applyFrom: date.nullable(),
  applyTo: date.nullable(),
  perVolunteerLimit: z.number().int().nullable(),
  dawahEnabled: z.boolean(),
  programId: z.uuid().optional(),
  /** The project series this session belongs to (officials only). */
  seriesId: z.uuid().optional(),
  /** The months the session runs, `yyyy-mm`, and its label read from them ("2026", "2026-27"). */
  periodFrom: z.string(),
  periodTo: z.string(),
  sessionLabel: z.string(),
  description: z.string().nullable().optional(),
  costPerBeneficiary: z.string().nullable().optional(),
  targetBeneficiaries: z.number().int().nullable().optional(),
  budgetPlanned: z.string().nullable().optional(),
  activatedAt: dateTime.nullable().optional(),
  closedAt: dateTime.nullable().optional(),
});
export type Project = z.infer<typeof projectSchema>;

/** A page of the project list with its cursors and its total. */
export const projectPageSchema = z.object({
  data: z.array(projectSchema),
  meta: z.object({
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.number().int().optional(),
  }),
});
export type ProjectPage = z.infer<typeof projectPageSchema>;

/** The project with its version, for the If-Match of a write. */
export const projectRecordSchema = versionedOf(projectSchema);
export type ProjectRecord = z.infer<typeof projectRecordSchema>;
