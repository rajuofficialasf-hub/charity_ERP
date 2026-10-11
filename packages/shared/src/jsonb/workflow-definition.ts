import { z } from 'zod';

// workflow_definitions.definition and projects.workflow_snapshot: a merged workflow template
// (docs/architecture/workflow-templates/schema.json, referenced by workflow-definition.schema.json).
const stateKey = z.string().regex(/^[a-z][a-z0-9_]*$/);
const templateKey = z.string().regex(/^_?[a-z][a-z0-9_]*$/);
const activityType = z.enum([
  'distribution',
  'construction',
  'purchase',
  'training',
  'visit',
  'payment',
  'voucher',
  'expense',
  'issue',
  'inspection',
  'follow_up',
]);
const permissionName = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
const guardName = permissionName;
const effectName = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*(:[a-z0-9_.]+)?$/);

export const transitionSchema = z
  .strictObject({
    from: z.union([stateKey, z.array(stateKey)]),
    to: stateKey,
    permission: permissionName.optional(),
    auto: z.boolean().optional(),
    trigger: z.string().optional(),
    guards: z.array(guardName).optional(),
    effects: z.array(effectName).optional(),
    requires_reason: z.boolean().optional(),
    requires_comment_if: z.literal('against_score_order').optional(),
    actor_recorded_as: z
      .enum(['submitted_by', 'reviewed_by', 'approved_by', 'completed_by', 'verified_by'])
      .optional(),
    note: z.string().optional(),
  })
  // exactly one of: a permission, or an automatic trigger (oneOf in the JSON Schema)
  .refine(
    (t) => (t.permission !== undefined) !== (t.auto !== undefined && t.trigger !== undefined),
    'a transition needs either a permission or auto with a trigger, not both',
  );

const stageTransitionSchema = z.strictObject({
  from: z.union([stateKey, z.null()]).optional(),
  to: stateKey,
  permission: permissionName,
  activity: activityType.optional(),
  guards: z.array(guardName).optional(),
  effects: z.array(effectName).optional(),
  note: z.string().optional(),
});

const flowSchema = z.looseObject({
  states: z.array(stateKey),
  transitions: z.array(transitionSchema),
});

export const workflowDefinitionSchema = z.strictObject({
  template: templateKey,
  version: z.int().min(1),
  title_en: z.string(),
  title_bn: z.string(),
  extends: templateKey.optional(),
  projects: z.array(stateKey).optional(),
  source: z.array(z.string()).optional(),
  notes: z.string().optional(),
  states: z
    .array(
      z.strictObject({
        key: stateKey,
        label_en: z.string(),
        label_bn: z.string(),
        terminal: z.boolean().optional(),
        kind: z.enum(['common', 'template']).optional(),
      }),
    )
    .optional(),
  stages: z
    .strictObject({
      editable: z.boolean(),
      list: z.array(
        z.strictObject({
          key: stateKey,
          label_en: z.string(),
          label_bn: z.string(),
          activity: activityType.optional(),
          photo_required: z.boolean().optional(),
        }),
      ),
    })
    .optional(),
  transitions: z.array(transitionSchema).optional(),
  stage_transitions: z.array(stageTransitionSchema).optional(),
  sub_workflows: z
    .record(z.string(), flowSchema.extend({ allowed_in: z.array(stateKey).optional() }))
    .optional(),
  donor_flow: flowSchema.extend({ entity: z.string().optional() }).optional(),
  activities: z
    .array(
      z.strictObject({
        type: activityType,
        bulk_screen: z.string().optional(),
        attachments: z.string().optional(),
        outcomes: z.array(z.string()).optional(),
        available_in: z.array(stateKey).optional(),
        permission: permissionName.optional(),
      }),
    )
    .optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  project_close_guards: z.array(guardName).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  project_lifecycle: flowSchema.optional(),
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
