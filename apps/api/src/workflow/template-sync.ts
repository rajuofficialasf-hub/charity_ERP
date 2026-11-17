import type { WorkflowDefinition } from '@css/shared';
import { loadAccessRegistry } from '../access/registry.js';
import type { Tx } from '../core/prisma.service.js';
import { stableId } from '../core/stable-id.js';
import { assertWorkflowNamesKnown } from './registry.js';
import { mergedWorkflowDefinitions } from './templates.js';

/**
 * The shipped workflow definitions (docs/architecture/workflow-templates/, docs/architecture/
 * WORKFLOW_ENGINE.md, "Versioning and snapshots"): each template merged with its extends chain,
 * validated, and checked to name only guards, effects and permissions that exist.
 */
export function shippedWorkflowDefinitions(): WorkflowDefinition[] {
  const definitions = mergedWorkflowDefinitions();
  assertWorkflowNamesKnown(definitions, loadAccessRegistry().isKnownPermission);
  return definitions;
}

/** One row of workflow_transitions, derived from a definition for querying. */
export interface TransitionRow {
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

/** Every transition of a definition as rows, one per from-state. */
export function deriveTransitions(def: WorkflowDefinition): TransitionRow[] {
  return [
    ...rows('application', def.transitions),
    ...rows('stage', def.stage_transitions),
    ...rows('project', def.project_lifecycle?.transitions),
    ...rows('donor_flow', def.donor_flow?.transitions),
    ...Object.values(def.sub_workflows ?? {}).flatMap((s) => rows('field_unlock', s.transitions)),
  ];
}

/** The stable id of a definition, the same in the development seed and in the sync. */
export const workflowDefinitionId = (key: string, version: number) =>
  stableId(`workflow:${key}:${version}`);

/** The stable id of one transition row of a definition, the same in the seed and in the sync. */
export const workflowTransitionId = (def: WorkflowDefinition, index: number, r: TransitionRow) =>
  stableId(
    `workflow-transition:${def.template}:${def.version}:${index}:${r.scope}:${r.from ?? '-'}:${r.to}`,
  );

/**
 * Inserts every shipped workflow definition whose key and version have no row yet, with its
 * transitions (part of `pnpm db:migrate`, docs/ops/DEPLOYMENT.md). A stored definition is never
 * changed: one whose content differs from the shipped template of the same version is named in the
 * answer, since a changed template needs a new version (a project keeps the snapshot of the
 * version it was activated with). Idempotent.
 */
export async function syncWorkflowTemplates(
  db: Tx,
): Promise<{ inserted: string[]; present: number; differing: string[] }> {
  const inserted: string[] = [];
  const differing: string[] = [];
  let present = 0;
  for (const def of shippedWorkflowDefinitions()) {
    const name = `${def.template} v${def.version}`;
    const body = JSON.stringify(def);
    const [stored] = await db.$queryRaw<{ same: boolean }[]>`
      SELECT definition = ${body}::jsonb AS same FROM workflow_definitions
       WHERE key = ${def.template} AND version = ${def.version}`;
    if (stored) {
      present += 1;
      if (!stored.same) differing.push(name);
      continue;
    }
    const id = workflowDefinitionId(def.template, def.version);
    await db.$executeRaw`
      INSERT INTO workflow_definitions (id, key, version, title_bn, title_en, definition, schema_version)
      VALUES (${id}::uuid, ${def.template}, ${def.version}, ${def.title_bn}, ${def.title_en},
              ${body}::jsonb, 1)`;
    for (const [index, r] of deriveTransitions(def).entries())
      await db.$executeRaw`
        INSERT INTO workflow_transitions
          (id, workflow_definition_id, scope, from_state, to_state, permission_name, guards, effects)
        VALUES (${workflowTransitionId(def, index, r)}::uuid, ${id}::uuid, ${r.scope}, ${r.from},
                ${r.to}, ${r.permission}, ${r.guards}::text[], ${r.effects}::text[])`;
    inserted.push(name);
  }
  return { inserted, present, differing };
}
