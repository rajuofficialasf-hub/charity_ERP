import { identityRules, identityRulesDiffer } from '@css/shared/projects';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** The component whose settings hold what a project's application asks. */
export const IDENTITY_RULES_COMPONENT = 'application_form';

/**
 * The part of a project select that carries the settings the identity rules are read from; a
 * project without the row gives an empty list, which `identityRulesOf` reads as the defaults.
 */
export const IDENTITY_RULES_SELECT = {
  projectComponentsProject: {
    where: { componentKey: IDENTITY_RULES_COMPONENT },
    select: { settings: true },
  },
} satisfies Prisma.ProjectSelect;

/** What the application of a project selected with `IDENTITY_RULES_SELECT` asks. */
export const identityRulesOf = (project: { projectComponentsProject: { settings: unknown }[] }) =>
  identityRules(project.projectComponentsProject[0]?.settings);

/**
 * Records a change of what a project's application asks about identity and contact and of what a
 * repeated person or family does: the four rules as they read before and after, whoever changed
 * the settings and by which path. Settings that read the same write nothing.
 */
export async function auditIdentityRulesChange(
  audit: AuditWriter,
  tx: Tx,
  projectId: string,
  settingsBefore: unknown,
  settingsAfter: unknown,
): Promise<void> {
  const before = identityRules(settingsBefore);
  const after = identityRules(settingsAfter);
  if (!identityRulesDiffer(before, after)) return;
  await audit.record(tx, {
    action: 'project.identity_rules_changed',
    entityType: 'project',
    entityId: projectId,
    old: before,
    new: after,
  });
}
