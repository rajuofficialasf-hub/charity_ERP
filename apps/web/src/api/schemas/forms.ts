import type { FormDefinition } from '@css/shared/forms';
import { formScoringSchema, formSectionSchema } from '@css/shared/forms';
import { z } from 'zod';
import { bilingual, date } from './common';

/**
 * A form version's sections as the caller's audience sees them, checked with the shared engine's
 * own definition schema, so the renderer and the API read one shape.
 */
export const formDefinitionShape = {
  sections: z.array(formSectionSchema),
  /** The form-level points of the priority score; a form without any points gives no score. */
  scoring: formScoringSchema.optional(),
};
export const formDefinitionSchema = z.object(
  formDefinitionShape,
) satisfies z.ZodType<FormDefinition>;

/** The form behind a public link, as the API answers it to anyone: the volunteer-visible part. */
export const publicFormSchema = z.object({
  project: z.object({ name: bilingual, applyTo: date.nullable() }),
  form: z.object({ id: z.uuid(), versionNo: z.number().int(), ...formDefinitionShape }),
});
export type PublicForm = z.infer<typeof publicFormSchema>;

/** A public application received: it waits for the office's verification. */
export const publicSubmissionSchema = z.object({ id: z.uuid(), status: z.string() });
export type PublicSubmission = z.infer<typeof publicSubmissionSchema>;
