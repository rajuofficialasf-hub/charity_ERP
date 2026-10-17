import { uuidv7 } from '@css/shared';
import type { TemplateSave, TemplateUpdate } from '@css/shared/projects';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import { projectDefinition } from './project-definition';

const SELECT = {
  id: true,
  nameBn: true,
  nameEn: true,
  description: true,
  projectType: true,
  active: true,
  version: true,
  sourceProjectId: true,
  updatedAt: true,
  updatedByRef: { select: { displayName: true } },
} satisfies Prisma.ProjectTemplateSelect;
type Row = Prisma.ProjectTemplateGetPayload<{ select: typeof SELECT }>;

function view(t: Row) {
  return {
    id: t.id,
    name: { bn: t.nameBn, en: t.nameEn },
    description: t.description,
    workflowKey: t.projectType,
    active: t.active,
    version: t.version,
    sourceProjectId: t.sourceProjectId,
    updatedAt: t.updatedAt.toISOString(),
    updatedByName: t.updatedByRef?.displayName ?? null,
  };
}

/**
 * The organisation's master project templates (BD-10, BR-064; DECISION_LOG D-096): everyone who
 * creates projects reads and uses every template; those who manage templates save a project's
 * setup as a new template or onto an existing one (its version goes up), rename, describe,
 * deactivate and activate them. A template is never deleted, and projects started from it are
 * snapshots that later changes never touch. Every change is audited.
 */
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
  ) {}

  async list(includeInactive: boolean) {
    const rows = await this.prisma.projectTemplate.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return rows.map(view);
  }

  async get(templateId: string) {
    const row = await this.prisma.projectTemplate.findUnique({
      where: { id: templateId },
      select: { ...SELECT, definition: true },
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    return { ...view(row), definition: row.definition };
  }

  async update(principal: Principal, templateId: string, body: TemplateUpdate) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedTemplate(tx, templateId);
      const after = await tx.projectTemplate.update({
        where: { id: templateId },
        data: {
          ...(body.name && { nameBn: body.name.bn.trim(), nameEn: body.name.en.trim() }),
          ...(body.description !== undefined && { description: body.description || null }),
          ...(body.active !== undefined && { active: body.active }),
          updatedBy: principal.userId,
        },
        select: SELECT,
      });
      await this.audit.record(tx, {
        action: 'template.update',
        entityType: 'project_template',
        entityId: templateId,
        old: { name: view(before).name, description: before.description, active: before.active },
        new: { name: view(after).name, description: after.description, active: after.active },
      });
      return view(after);
    });
  }

  /**
   * Saves the copied parts of a project the caller may view: as a new template with a name, or
   * onto an existing template, which keeps its name and raises its version.
   */
  async saveFromProject(principal: Principal, projectId: string, body: TemplateSave) {
    const actor = principal.userId;
    if (!(await this.access.holdsOnProject(actor, 'project.view', projectId))) {
      this.access.denied(actor, 'project.view', 'project');
      throw new ApiError('permission.not_found', 404);
    }
    return this.prisma.$transaction(async (tx) => {
      // a definition is plain JSON: zod built it from JSON values
      const definition = (await projectDefinition(
        tx,
        projectId,
      )) as unknown as Prisma.InputJsonObject;
      const parts = {
        projectType: String(definition.workflowKey),
        sourceProjectId: projectId,
        definition,
        updatedBy: actor,
      };
      if ('templateId' in body) {
        const before = await this.lockedTemplate(tx, body.templateId);
        const after = await tx.projectTemplate.update({
          where: { id: body.templateId },
          data: { ...parts, version: before.version + 1 },
          select: SELECT,
        });
        await this.audit.record(tx, {
          action: 'template.update',
          entityType: 'project_template',
          entityId: after.id,
          old: { version: before.version, sourceProjectId: before.sourceProjectId },
          new: { version: after.version, sourceProjectId: projectId, definition },
        });
        return view(after);
      }
      const id = uuidv7();
      const created = await tx.projectTemplate.create({
        data: {
          id,
          // a template's own key; its contents change in place with a new version
          key: `t_${id.replace(/-/g, '')}`,
          nameBn: body.name.bn.trim(),
          nameEn: body.name.en.trim(),
          description: body.description || null,
          ...parts,
          createdBy: actor,
        },
        select: SELECT,
      });
      await this.audit.record(tx, {
        action: 'template.create',
        entityType: 'project_template',
        entityId: id,
        new: { ...view(created), definition },
      });
      return view(created);
    });
  }

  private async lockedTemplate(tx: Tx, templateId: string): Promise<Row> {
    await tx.$queryRaw`SELECT id FROM project_templates WHERE id = ${templateId}::uuid FOR UPDATE`;
    const row = await tx.projectTemplate.findUnique({ where: { id: templateId }, select: SELECT });
    if (!row) throw new ApiError('permission.not_found', 404);
    return row;
  }
}
