import { uuidv7 } from '@css/shared';
import {
  editableIn,
  missingRuleParts,
  PROJECT_STATUSES,
  type ProjectRules,
  projectRulesSchema,
  RULES_PARTS,
} from '@css/shared/projects';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { ProjectViewer, ProjectsService } from './projects';

/** The rules texts in the fixed part order, so equal texts compare equal. */
function ordered(rules: ProjectRules): ProjectRules {
  return Object.fromEntries(
    // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
    RULES_PARTS.flatMap((part) => (rules[part] ? [[part, rules[part]]] : [])),
  );
}

/** Rules read from the database; a value the schema does not take reads as no rules. */
export const storedRules = (value: unknown): ProjectRules =>
  ordered(projectRulesSchema.safeParse(value).data ?? {});

/** The missing rules texts as the activation check names them, refused like a missing setup part. */
export function refuseIncompleteRules(rules: ProjectRules, dawahEnabled: boolean): void {
  const missing = missingRuleParts(rules, dawahEnabled);
  if (missing.length)
    throw new ApiError(
      'workflow.guard.project_setup_complete',
      409,
      undefined,
      missing.map((part) => ({ path: `rules:${part}`, code: 'validation.required' })),
    );
}

/**
 * Writes the texts as the project's next rules version and sets every acceptance of the project,
 * by assigned volunteers and team members alike, back to pending: nobody works under rules they
 * have not read. Runs inside the caller's transaction, with the project row locked.
 */
export async function writeRulesVersion(
  tx: Tx,
  projectId: string,
  rules: ProjectRules,
  fromVersion: number,
  actor: string,
) {
  const version = fromVersion + 1;
  await tx.projectRulesVersion.create({
    data: { id: uuidv7(), projectId, version, texts: rules, createdBy: actor },
  });
  await tx.project.update({
    where: { id: projectId },
    data: { rules, rulesVersion: version, updatedBy: actor },
  });
  const pending = { consentStatus: 'pending', consentAt: null, updatedBy: actor };
  const [assigned, members] = await Promise.all([
    tx.projectVolunteer.updateMany({
      where: { projectId, endedAt: null, consentStatus: 'accepted' },
      data: pending,
    }),
    tx.volunteerTeam.updateMany({
      where: { projectId, removedAt: null, consentStatus: 'accepted' },
      data: pending,
    }),
  ]);
  return { version, consentsReset: { assigned: assigned.count, teamMembers: members.count } };
}

/**
 * The four rules texts of a project. Every saved change is a new
 * version kept in `project_rules_versions`, and in the same transaction every acceptance of the
 * project, by assigned volunteers and team members alike, goes back to pending: nobody works under
 * rules they have not read. Once a project has been active it keeps every text its volunteers must
 * accept. Officials of the project read and write them; volunteers read them through their own
 * projects.
 */
export class ProjectRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
  ) {}

  private officialsOnly(viewer: ProjectViewer): void {
    if (viewer.principal.kind !== 'volunteer') return;
    this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
    throw new ApiError('permission.denied', 403);
  }

  async get(viewer: ProjectViewer, projectId: string) {
    this.officialsOnly(viewer);
    await this.projects.get(viewer, projectId);
    const row = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { rules: true, rulesVersion: true },
    });
    return { version: row.rulesVersion, rules: storedRules(row.rules) };
  }

  /** Saves the texts as the next version; the same texts again change nothing. */
  async replace(viewer: ProjectViewer, projectId: string, body: ProjectRules) {
    this.officialsOnly(viewer);
    const actor = viewer.principal.userId;
    const rules = ordered(body);
    return this.prisma.$transaction(async (tx) => {
      const project = await this.projects.locked(tx, viewer, projectId);
      const status = PROJECT_STATUSES.find((s) => s === project.status);
      if (!status || !editableIn(status, 'rules')) throw new ApiError('project.read_only', 409);
      const current = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { rules: true, rulesVersion: true, dawahEnabled: true },
      });
      // a running project never loses a text its volunteers must accept
      if (status !== 'draft') refuseIncompleteRules(rules, current.dawahEnabled);
      const before = storedRules(current.rules);
      if (current.rulesVersion > 0 && JSON.stringify(before) === JSON.stringify(rules)) {
        // saved again unchanged: no new version, and nobody has to accept again
        await this.audit.record(tx, {
          action: 'project.configure',
          entityType: 'project',
          entityId: projectId,
          old: { rulesVersion: current.rulesVersion },
          new: { rulesVersion: current.rulesVersion, unchanged: true },
        });
        return { version: current.rulesVersion, rules: before };
      }
      const written = await writeRulesVersion(tx, projectId, rules, current.rulesVersion, actor);
      await this.audit.record(tx, {
        action: 'project.configure',
        entityType: 'project',
        entityId: projectId,
        old: { rules: before, rulesVersion: current.rulesVersion },
        new: { rules, rulesVersion: written.version, consentsReset: written.consentsReset },
      });
      return { version: written.version, rules };
    });
  }
}
