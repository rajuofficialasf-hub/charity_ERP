import { z } from 'zod';
import { bilingual, code64 } from './common.js';

// project_components.settings (docs/database/json-schemas/project-component-settings.schema.json).
// The schema to apply is chosen by project_components.component_key; components without settings
// store {} (T1.2: the docs schema uses anyOf so that {} stays valid).
const codeLabel = z.strictObject({
  code: code64,
  label: bilingual,
  active: z.boolean().optional(),
});
const photoSource = z.enum(['camera_only', 'camera_or_gallery']);

export const componentSettingsSchemas = {
  application_form: z.strictObject({
    form_ids: z.array(z.uuid()).optional(),
    beneficiary_class_options: z.array(codeLabel).optional(),
  }),
  public_link: z.strictObject({
    enabled: z.boolean(),
    token: z.string().min(16).optional(),
    form_ids: z.array(z.uuid()).optional(),
  }),
  volunteer_assignment: z.strictObject({ team_members_allowed: z.boolean().optional() }),
  photo_rule: z.strictObject({
    rule: z.enum(['group', 'individual', 'both', 'per_application_type']),
    source: z
      .strictObject({
        distribution_proof: photoSource.optional(),
        construction_proof: photoSource.optional(),
        evidence: photoSource.optional(),
        voucher: photoSource.optional(),
        payment_copy: photoSource.optional(),
      })
      .optional(),
    dedup_identical: z.boolean().optional(),
  }),
  stages: z.strictObject({
    list: z
      .array(
        z.strictObject({
          key: z.string().regex(/^[a-z][a-z0-9_]*$/),
          label: bilingual,
          photo_required: z.boolean().optional(),
        }),
      )
      .min(1),
  }),
  issue_log: z.strictObject({ issue_types: z.array(codeLabel).optional() }),
  volunteer_expenses: z.strictObject({ categories: z.array(codeLabel).optional() }),
  rating_criteria: z.strictObject({ criteria: z.array(codeLabel).max(5) }),
  scoring: z.strictObject({
    criteria: z.array(
      z.strictObject({
        key: z.string(),
        label: bilingual,
        max_points: z.number().min(0).max(100),
        rule: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  follow_up: z.strictObject({ questions: z.array(codeLabel).optional() }),
  dawah: z.strictObject({
    family_attendance: z.boolean().optional(),
    gender_split: z.boolean().optional(),
  }),
} as const;

export type ComponentWithSettings = keyof typeof componentSettingsSchemas;

/** Settings of a component that has no settings definition: always the empty object. */
export const emptySettingsSchema = z.strictObject({});

export function componentSettingsSchema(componentKey: string): z.ZodType {
  return componentKey in componentSettingsSchemas
    ? componentSettingsSchemas[componentKey as ComponentWithSettings]
    : emptySettingsSchema;
}
