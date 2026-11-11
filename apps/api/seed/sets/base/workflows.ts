import { mergeWorkflowTemplates, type WorkflowDefinition } from '@css/shared';
import { loadAccessRegistry } from '../../../src/access/registry.js';
import { assertWorkflowNamesKnown } from '../../../src/workflow/registry.js';
import { readWorkflowTemplates } from '../../../src/workflow/templates.js';
import { json, type SeedContext, seedId } from '../../context.js';

export { readWorkflowTemplates };

/**
 * Workflow definitions from docs/architecture/workflow-templates/
 * (docs/architecture/WORKFLOW_ENGINE.md, "Versioning and snapshots"): each template merged with its
 * extends chain and validated, stored in workflow_definitions, and its transitions derived into
 * workflow_transitions for querying. A template change needs a new version: workflow_transitions is
 * append-only, so a changed row of the same version fails.
 */
interface TransitionRow {
  scope: 'application' | 'stage' | 'project' | 'donor_flow' | 'field_unlock';
  from: string | null;
  to: string;
  permission: string | null;
  guards: string[];
  effects: string[];
}

type AnyTransition = {
  from?: string | string[] | null;
  to: string;
  permission?: string;
  guards?: string[];
  effects?: string[];
};

function rows(scope: TransitionRow['scope'], list: AnyTransition[] | undefined): TransitionRow[] {
  return (list ?? []).flatMap((t) => {
    const froms = Array.isArray(t.from) ? t.from : [t.from ?? null];
    return froms.map((from) => ({
      scope,
      from,
      to: t.to,
      permission: t.permission ?? null,
      guards: t.guards ?? [],
      effects: t.effects ?? [],
    }));
  });
}

export function deriveTransitions(def: WorkflowDefinition): TransitionRow[] {
  return [
    ...rows('application', def.transitions),
    ...rows('stage', def.stage_transitions),
    ...rows('project', def.project_lifecycle?.transitions),
    ...rows('donor_flow', def.donor_flow?.transitions),
    ...Object.values(def.sub_workflows ?? {}).flatMap((s) => rows('field_unlock', s.transitions)),
  ];
}

/** The version the seed stores for a template, so a project of the demo binds the current one. */
export function workflowVersionOf(key: string): number {
  const template = readWorkflowTemplates().find((t) => t.template === key);
  if (!template) throw new Error(`unknown workflow template ${key}`);
  return template.version;
}

export async function seedWorkflows(ctx: SeedContext): Promise<void> {
  const templates = readWorkflowTemplates();
  const definitions = templates.map((t) => mergeWorkflowTemplates(t.template, templates));
  // a template may name only guards, effects and permissions that exist
  assertWorkflowNamesKnown(definitions, loadAccessRegistry().isKnownPermission);
  for (const def of definitions) {
    const definitionId = seedId(`workflow:${def.template}:${def.version}`);
    await ctx.upsert('workflow_definitions', {
      id: definitionId,
      key: def.template,
      version: def.version,
      title_bn: def.title_bn,
      title_en: def.title_en,
      definition: json(def),
      schema_version: 1,
      ...ctx.audit(),
    });
    for (const [index, r] of deriveTransitions(def).entries()) {
      await ctx.upsert('workflow_transitions', {
        id: seedId(
          `workflow-transition:${def.template}:${def.version}:${index}:${r.scope}:${r.from ?? '-'}:${r.to}`,
        ),
        workflow_definition_id: definitionId,
        scope: r.scope,
        from_state: r.from,
        to_state: r.to,
        permission_name: r.permission,
        guards: r.guards,
        effects: r.effects,
        created_by: ctx.actorId,
      });
    }
  }
}
