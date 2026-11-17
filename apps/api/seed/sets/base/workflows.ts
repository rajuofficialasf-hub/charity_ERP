import {
  deriveTransitions,
  shippedWorkflowDefinitions,
  workflowDefinitionId,
  workflowTransitionId,
} from '../../../src/workflow/template-sync.js';
import { readWorkflowTemplates } from '../../../src/workflow/templates.js';
import { json, type SeedContext } from '../../context.js';

export { deriveTransitions, readWorkflowTemplates };

/**
 * Workflow definitions from docs/architecture/workflow-templates/
 * (docs/architecture/WORKFLOW_ENGINE.md, "Versioning and snapshots"): each template merged with its
 * extends chain and validated, stored in workflow_definitions, and its transitions derived into
 * workflow_transitions for querying. A template change needs a new version: workflow_transitions is
 * append-only, so a changed row of the same version fails. The production sync of
 * `src/workflow/template-sync.ts` gives the rows the same ids.
 */
/** The version the seed stores for a template, so a project of the demo binds the current one. */
export function workflowVersionOf(key: string): number {
  const template = readWorkflowTemplates().find((t) => t.template === key);
  if (!template) throw new Error(`unknown workflow template ${key}`);
  return template.version;
}

export async function seedWorkflows(ctx: SeedContext): Promise<void> {
  for (const def of shippedWorkflowDefinitions()) {
    const definitionId = workflowDefinitionId(def.template, def.version);
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
        id: workflowTransitionId(def, index, r),
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
