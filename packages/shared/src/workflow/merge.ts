import { type WorkflowDefinition, workflowDefinitionSchema } from '../jsonb/workflow-definition.js';

/**
 * Resolves a workflow template's `extends` chain into one definition (WORKFLOW_ENGINE §5, §12).
 * Rule: the arrays states, transitions, activities and project_close_guards are concatenated,
 * parent first; plain objects (defaults, overrides, sub_workflows) are merged key by key with the
 * child winning; every other field (title, version, stages, project_lifecycle, donor_flow, ...)
 * comes from the child when present, otherwise from the parent. The result keeps the child's
 * `template`, `version` and `extends`, and is validated with the zod schema.
 * Used by the seed and by the workflow engine (Phase 2), so both read the same definition.
 */
type Template = Record<string, unknown> & { template: string; extends?: string };

const CONCATENATED = ['states', 'transitions', 'activities', 'project_close_guards'] as const;
const MERGED_OBJECTS = ['defaults', 'overrides', 'sub_workflows'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* eslint-disable security/detect-object-injection -- keys come from the fixed lists above */
function mergePair(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...parent, ...child };
  for (const key of CONCATENATED) {
    const a = parent[key];
    const b = child[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      merged[key] = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    }
  }
  for (const key of MERGED_OBJECTS) {
    const a = parent[key];
    const b = child[key];
    if (isPlainObject(a) || isPlainObject(b)) {
      merged[key] = { ...(isPlainObject(a) ? a : {}), ...(isPlainObject(b) ? b : {}) };
    }
  }
  // the parent's project list and notes describe the parent only
  if (child.projects === undefined) delete merged.projects;
  if (child.notes === undefined) delete merged.notes;
  return merged;
}
/* eslint-enable security/detect-object-injection */

export function mergeWorkflowTemplates(
  templateKey: string,
  templates: readonly Template[],
): WorkflowDefinition {
  const byKey = new Map(templates.map((t) => [t.template, t]));
  const chain: Template[] = [];
  const seen = new Set<string>();
  let current = byKey.get(templateKey);
  if (!current) throw new Error(`workflow template ${templateKey} not found`);
  while (current) {
    if (seen.has(current.template))
      throw new Error(`workflow template cycle at ${current.template}`);
    seen.add(current.template);
    chain.unshift(current);
    if (!current.extends) break;
    const parent = byKey.get(current.extends);
    if (!parent)
      throw new Error(`workflow template ${current.template} extends missing ${current.extends}`);
    current = parent;
  }
  const merged = chain
    .slice(1)
    .reduce<Record<string, unknown>>((acc, t) => mergePair(acc, t), { ...chain[0] });
  return workflowDefinitionSchema.parse(merged);
}
