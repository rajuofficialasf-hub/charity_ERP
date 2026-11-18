import { z } from 'zod';
import { type ComponentKey, isComponentKey } from '../components.js';
import { boundedLabel as label, code64 } from './common.js';

// project_components.settings (docs/database/json-schemas/project-component-settings.schema.json).
// The schema to apply is chosen by project_components.component_key; components without settings
// store {} (the docs schema uses anyOf so that {} stays valid). Every object is strict and every
// list and label has a maximum, so a caller cannot store unbounded configuration.
const codeLabel = z.strictObject({
  code: code64,
  label,
  active: z.boolean().optional(),
});
const codeLabels = (max: number) => z.array(codeLabel).max(max);
export const photoSource = z.enum(['camera_only', 'camera_or_gallery']);
export const photoRule = z.enum(['group', 'individual', 'both', 'per_application_type']);
/** Whether an application must answer a question, or answers it only when there is an answer. */
export const identityRequirement = z.enum(['required', 'optional']);
/** What a second appearance does at review: it is only told, or it holds the approval for a reason. */
export const repeatRule = z.enum(['tell', 'hold']);

/**
 * What a project's application asks about identity and contact, and what a repeated person or
 * family does. Each is optional: a project that says nothing behaves as `identityRules` of
 * `projects/identity-rules.ts` reads it, which is the one reader of these keys.
 */
export const identitySettingsShape = {
  identity_document: identityRequirement.optional(),
  mobile: identityRequirement.optional(),
  repeat_person: repeatRule.optional(),
  repeat_family: repeatRule.optional(),
};

/**
 * The review checklist of a project: the items an official checks before sending an application
 * for approval, and whether every item must be answered first. `reviewChecklist` of
 * `projects/review-checklist.ts` is the one reader, with the starting items for a project that
 * says nothing.
 */
export const reviewChecklistSettings = z.strictObject({
  required: z.boolean(),
  items: codeLabels(20),
});

export const componentSettingsSchemas = {
  application_form: z.strictObject({
    form_ids: z.array(z.uuid()).max(20).optional(),
    beneficiary_class_options: codeLabels(30).optional(),
    application_kinds: codeLabels(20).optional(),
    ...identitySettingsShape,
    review_checklist: reviewChecklistSettings.optional(),
  }),
  public_link: z.strictObject({
    enabled: z.boolean(),
    token: z.string().min(16).max(128).optional(),
    form_ids: z.array(z.uuid()).max(20).optional(),
  }),
  volunteer_assignment: z.strictObject({ team_members_allowed: z.boolean().optional() }),
  photo_rule: z.strictObject({
    rule: photoRule,
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
          key: z
            .string()
            .max(64)
            .regex(/^[a-z][a-z0-9_]*$/),
          label,
          photo_required: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(30),
  }),
  issue_log: z.strictObject({ issue_types: codeLabels(50).optional() }),
  volunteer_expenses: z.strictObject({ categories: codeLabels(50).optional() }),
  rating_criteria: z.strictObject({ criteria: codeLabels(5) }),
  scoring: z.strictObject({
    criteria: z
      .array(
        z.strictObject({
          key: z.string().max(64),
          label,
          max_points: z.number().min(0).max(100),
          rule: z.record(z.string(), z.unknown()),
        }),
      )
      .max(20),
  }),
  follow_up: z.strictObject({ questions: codeLabels(50).optional() }),
  dawah: z.strictObject({
    family_attendance: z.boolean().optional(),
    gender_split: z.boolean().optional(),
  }),
} as const;

export type ComponentWithSettings = keyof typeof componentSettingsSchemas;

/** Settings of a component that has no settings definition: always the empty object. */
export const emptySettingsSchema = z.strictObject({});

/**
 * Which settings definition a component uses. Components not listed store {}.
 * `scoring` belongs to application_form and is configured with the quotas in Phase 2.
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
