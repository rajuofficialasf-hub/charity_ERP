import { z } from 'zod';
import { type ComponentKey, isComponentKey } from '../components.js';
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

/**
 * Which settings definition a component uses (D-062). Components not listed store {}.
 * `scoring` belongs to application_form and is applied with project setup (T1.11).
 */
export const COMPONENT_SETTINGS_DEFINITION: Partial<Record<ComponentKey, ComponentWithSettings>> = {
  application_form: 'application_form',
  public_link: 'public_link',
  volunteer_assignment: 'volunteer_assignment',
  distribution: 'photo_rule',
  stages: 'stages',
  issue_log: 'issue_log',
  volunteer_expenses: 'volunteer_expenses',
  rating_criteria: 'rating_criteria',
  follow_up: 'follow_up',
  dawah: 'dawah',
};

/* eslint-disable security/detect-object-injection -- componentKey is checked against COMPONENT_KEYS */
export function componentSettingsSchema(componentKey: string): z.ZodType {
  const definition = isComponentKey(componentKey)
    ? COMPONENT_SETTINGS_DEFINITION[componentKey]
    : undefined;
  return definition ? componentSettingsSchemas[definition] : emptySettingsSchema;
}
/* eslint-enable security/detect-object-injection */
