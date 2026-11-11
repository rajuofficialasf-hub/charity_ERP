import { COMPONENT_KEYS, type ComponentKey } from '../components.js';
import { photoRule, photoSource } from '../jsonb/component-settings.js';
import type { WorkflowDefinition } from '../jsonb/workflow-definition.js';

/**
 * The six seeded workflow definitions a project is created from (the yaml files of
 * docs/architecture/workflow-templates/).
 */
export const WORKFLOW_KEYS = [
  'distribution',
  'construction',
  'advance_voucher',
  'implementation_evidence',
  'open_application_visit',
  'qurbani',
] as const;
export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];

/**
 * The components a new project of each workflow starts with, from the "used today in" column of the
 * component table (docs/MASTER_SPEC.md, "Program and project setup (project configuration)"). The
 * PM switches any of them on or off afterwards; nothing here is a rule about what a project may
 * use.
 */
export const WORKFLOW_COMPONENTS: Record<WorkflowKey, readonly ComponentKey[]> = {
  distribution: [
    'application_form',
    'volunteer_assignment',
    'dispatch_receive',
    'distribution',
    'volunteer_expenses',
    'rating_criteria',
  ],
  construction: [
    'application_form',
    'volunteer_assignment',
    'site_verification',
    'stages',
    'issue_log',
    'follow_up',
    'rating_criteria',
  ],
  advance_voucher: [
    'application_form',
    'volunteer_assignment',
    'stages',
    'beneficiary_payment',
    'vouchers',
    'rating_criteria',
  ],
  implementation_evidence: [
    'application_form',
    'volunteer_assignment',
    'site_verification',
    'dawah',
    'exams',
    'beneficiary_payment',
    'materials_placard',
    'vouchers',
    'follow_up',
    'rating_criteria',
  ],
  open_application_visit: [
    'application_form',
    'public_link',
    'volunteer_assignment',
    'dispatch_receive',
    'site_verification',
    'volunteer_expenses',
    'rating_criteria',
  ],
  qurbani: [
    'application_form',
    'volunteer_assignment',
    'dispatch_receive',
    'vouchers',
    'volunteer_expenses',
    'donors_animals',
    'rating_criteria',
  ],
};

export interface CodeLabel {
  code: string;
  label: { bn: string; en: string };
}

export interface StartingComponent {
  componentKey: ComponentKey;
  enabled: boolean;
  settings: Record<string, unknown>;
}

/**
 * Whether the workflow counts applications against a per-volunteer limit (its `limit_counts`
 * default lists the counted states). A workflow whose applications come from the public counts
 * none, so its projects need no limit.
 */
export function limitRequired(definition: WorkflowDefinition): boolean {
  const counts = definition.defaults?.limit_counts;
  return Array.isArray(counts) && counts.length > 0;
}

/**
 * The workflows that count no application against a volunteer, as `limitRequired` reads them from
 * the definitions; the screens use this list, which has no definition at hand (a test keeps the two
 * equal).
 */
export const WORKFLOWS_WITHOUT_LIMIT: readonly WorkflowKey[] = ['open_application_visit'];

/**
 * The photo rule of a workflow, a project-wide setting kept on the `distribution` row (the one
 * component with the photo-rule settings) whether that component is on or not. A fixed rule is
 * copied; "per project" means the PM must choose, so the rule starts missing and the activation
 * check reports it. The workflow's single photo source applies to the proof photos; vouchers and
 * payment copies start with the gallery allowed, as the owner's photo-source decision allows it
 * for vouchers and paper documents.
 */
function photoRuleSettings(defaults: Record<string, unknown>): Record<string, unknown> {
  const rule = photoRule.safeParse(defaults.photo_rule);
  const proof = photoSource.safeParse(defaults.photo_source);
  const source = proof.success ? proof.data : 'camera_only';
  return {
    ...(rule.success ? { rule: rule.data } : {}),
    source: {
      distribution_proof: source,
      construction_proof: source,
      evidence: source,
      voucher: 'camera_or_gallery',
      payment_copy: 'camera_or_gallery',
    },
  };
}

/** The workflow's stages as stage settings; the activity stays in the workflow snapshot only. */
function stageSettings(definition: WorkflowDefinition): Record<string, unknown> {
  const list = definition.stages?.list ?? [];
  if (list.length === 0) return {};
  return {
    list: list.map((s) => ({
      key: s.key,
      label: { bn: s.label_bn, en: s.label_en },
      ...(s.photo_required === undefined ? {} : { photo_required: s.photo_required }),
    })),
  };
}

/**
 * Every component row of a new project: switched on by `WORKFLOW_COMPONENTS`, with starting
 * settings from the workflow definition and the per-project list defaults (the beneficiary types
 * of the approved default list, and the application kinds of the workflow, labelled from the reference lists).
 */
export function startingComponents(
  workflowKey: WorkflowKey,
  definition: WorkflowDefinition,
  lists: { beneficiaryClasses: CodeLabel[]; applicationKinds: CodeLabel[] },
): StartingComponent[] {
  const defaults = definition.defaults ?? {};
  const enabled = new Set<ComponentKey>(WORKFLOW_COMPONENTS[workflowKey]);
  if (defaults.dawah === 'enabled') enabled.add('dawah');
  // the application kinds of an open-application workflow (tree planting) are workflow overrides
  const types = definition.overrides?.application_types;
  const kindCodes: unknown[] = Array.isArray(types) ? types : [];
  const kinds = lists.applicationKinds.filter((k) => kindCodes.includes(k.code));
  const settings: Partial<Record<ComponentKey, Record<string, unknown>>> = {
    application_form: {
      beneficiary_class_options: lists.beneficiaryClasses,
      ...(kinds.length ? { application_kinds: kinds } : {}),
    },
    distribution: photoRuleSettings(defaults),
    stages: stageSettings(definition),
    rating_criteria: { criteria: [] },
    ...(enabled.has('public_link') ? { public_link: { enabled: true } } : {}),
  };
  return COMPONENT_KEYS.map((componentKey) => ({
    componentKey,
    enabled: enabled.has(componentKey),
    // eslint-disable-next-line security/detect-object-injection -- componentKey comes from COMPONENT_KEYS
    settings: settings[componentKey] ?? {},
  }));
}
