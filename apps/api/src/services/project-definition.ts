import { uuidv7 } from '@css/shared';
import {
  definitionOf,
  missingRuleParts,
  RULES_PARTS,
  type TemplateDefinition,
  WORKFLOW_KEYS,
} from '@css/shared/projects';
import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { storedRules, writeRulesVersion } from './project-rules';

/**
 * The copied parts of a project (BD-10, BR-065; DECISION_LOG D-096): its workflow, components with
 * their settings, syllabus and rules texts, read for a template or a copy. Nothing else is read,
 * so nothing else can travel.
 */
export async function projectDefinition(db: Tx, projectId: string): Promise<TemplateDefinition> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      rules: true,
      workflowDefinition: { select: { key: true } },
      projectComponentsProject: {
        orderBy: { componentKey: 'asc' },
        select: { componentKey: true, enabled: true, settings: true },
      },
      dawahSyllabusTopicsProject: {
        orderBy: { sortOrder: 'asc' },
        select: { titleBn: true, titleEn: true },
      },
    },
  });
  const workflowKey = WORKFLOW_KEYS.find((k) => k === project.workflowDefinition.key);
  if (!workflowKey) throw new Error(`unknown workflow ${project.workflowDefinition.key}`);
  return definitionOf({
    workflowKey,
    components: project.projectComponentsProject,
    syllabus: project.dawahSyllabusTopicsProject.map((t) => ({
      title: { bn: t.titleBn, en: t.titleEn },
    })),
    rules: storedRules(project.rules),
  });
}

/**
 * Applies a definition to a new draft: the components it names replace the starting ones (with
 * their settings), the syllabus is written in its order, and rules texts become version 1. The
 * draft is the caller's own new row; its activation checks everything else.
 */
export async function applyDefinition(
  tx: Tx,
  projectId: string,
  definition: TemplateDefinition,
  actor: string,
): Promise<void> {
  for (const c of definition.components)
    await tx.projectComponent.update({
      where: { projectId_componentKey: { projectId, componentKey: c.componentKey } },
      data: { enabled: c.enabled, settings: c.settings as Prisma.InputJsonValue, updatedBy: actor },
    });
  if (definition.syllabus.length)
    await tx.dawahSyllabusTopic.createMany({
      data: definition.syllabus.map((title, index) => ({
        id: uuidv7(),
        projectId,
        titleBn: title.bn,
        titleEn: title.en,
        sortOrder: index + 1,
        createdBy: actor,
        updatedBy: actor,
      })),
    });
  // rules with any text become the first version; an empty set stays at version 0
  if (missingRuleParts(definition.rules, true).length < RULES_PARTS.length)
    await writeRulesVersion(tx, projectId, definition.rules, 0, actor);
}
