import { z } from 'zod';
import { EXPORT_FORMATS, EXPORT_LIMITS, EXPORT_LISTS } from './constants.js';

/**
 * The request for a list's export: the list, the format, the chosen columns and the list's own
 * filters as its page sends them (the API checks them with that list's filter schema). An
 * application list belongs to one project, so it names it; the other lists name none.
 */
export const exportRequestSchema = z
  .strictObject({
    kind: z.enum(EXPORT_LISTS),
    format: z.enum(EXPORT_FORMATS),
    columns: z
      .array(z.string().min(1).max(120))
      .min(1)
      .max(EXPORT_LIMITS.maxColumns)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'columns.duplicate' }),
    filters: z.record(z.string(), z.unknown()),
    projectId: z.uuid().optional(),
    /** A coded column's code beside its words (a state, a type, a gender); the words alone by default. */
    withCodes: z.boolean().optional(),
  })
  .refine((r) => (r.kind === 'applications') === (r.projectId !== undefined), {
    message: 'projectId.required_for_applications_only',
    path: ['projectId'],
  });
export type ExportRequest = z.infer<typeof exportRequestSchema>;
