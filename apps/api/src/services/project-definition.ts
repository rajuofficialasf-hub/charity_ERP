import { uuidv7 } from '@css/shared';
import {
  definitionOf,
  RULES_PARTS,
  type TemplateDefinition,
  WORKFLOW_KEYS,
} from '@css/shared/projects';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { createFormFromDefinition, projectFormKindOf, readDefinition } from './forms.js';
import { storedRules, writeRulesVersion } from './project-rules.js';

/**
 * The copied parts of a project: its workflow, components with
 * their settings, syllabus, rules texts and its published form, read for a template or a copy
 * inside the caller's transaction. Nothing else is read, so nothing else can travel.
 */
export async function projectDefinition(db: Tx, projectId: string): Promise<TemplateDefinition> {
  // a setup change of the source waits until its parts are read, so they belong together
  await db.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR SHARE`;
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
      formsProject: {
        orderBy: { createdAt: 'asc' },
        select: {
          key: true,
          titleBn: true,
          titleEn: true,
          kind: true,
          formVersionsForm: { where: { status: 'published' }, select: { id: true } },
        },
      },
    },
  });
  // the first form with a published version travels as version 1 of the copy
  const published = project.formsProject.find((f) => f.formVersionsForm.length > 0);
  const form = published
    ? {
        key: published.key,
        title: { bn: published.titleBn, en: published.titleEn },
        kind: projectFormKindOf(published.kind),
        definition: await readDefinition(db, published.formVersionsForm[0]!.id, 'official'),
      }
    : null;
  const workflowKey = WORKFLOW_KEYS.find((k) => k === project.workflowDefinition.key);
  if (!workflowKey) throw new Error(`unknown workflow ${project.workflowDefinition.key}`);
  return definitionOf({
    workflowKey,
    components: project.projectComponentsProject,
    syllabus: project.dawahSyllabusTopicsProject.map((t) => ({
      title: { bn: t.titleBn, en: t.titleEn },
    })),
    rules: storedRules(project.rules),
    form,
  });
}

/**
 * Applies a definition to a new draft: the components it names replace the starting ones (with
 * their settings), the syllabus is written in its order, rules texts become version 1, and the
 * form it carries becomes draft 1. The draft is the caller's own new row; its activation checks
 * everything else.
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
  // rules with any text, even unfinished ones of a draft, become the first version; none stays at 0
  const written = RULES_PARTS.some((part) => {
    // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
    const text = definition.rules[part];
    return Boolean(text && (text.bn.trim() || text.en.trim()));
  });
  if (written) await writeRulesVersion(tx, projectId, definition.rules, 0, actor);
  if (definition.form) await createFormFromDefinition(tx, projectId, definition.form, actor);
}
