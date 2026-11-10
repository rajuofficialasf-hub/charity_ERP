import type { AccessRegistry } from './registry';

/** The facts a condition may need; a missing fact means the condition fails (default deny). */
export interface ConditionContext {
  actor: { userId: string; roles: string[]; volunteerType: string | null };
  /** The project the action is on, with its workflow template key (workflow_definitions.key). */
  project?: { workflowKey: string | null };
  /** The record the action is on. */
  record?: { createdBy?: string | null; raisedByRoles?: string[]; ownPart?: boolean };
  /** The record lies in the actor's own region inside the project (scope resolution decides). */
  inOwnRegion?: boolean;
  /** The target volunteer of a deactivation, for `no_open_applications`. */
  target?: { openApplications?: number };
  /** The actor is attached to the house-construction project (the Procurement Team). */
  attachedToProject?: boolean;
}

export type ConditionCheck = (ctx: ConditionContext) => boolean;

/** The workflow templates the template conditions name (docs/architecture/workflow-templates). */
const TEMPLATE = {
  houseConstruction: 'construction',
  safeWater: 'advance_voucher',
  treePlanting: 'open_application_visit',
} as const;

const onTemplate =
  (key: string): ConditionCheck =>
  (ctx) =>
    ctx.project?.workflowKey === key;

/**
 * One check per `conditions` key of permissions.yaml (docs/security/RBAC.md, "permissions.yaml
 * schema and loading"). `if_rpm_grants` is never checked at run time: a default with it is not a
 * grant at all, and the grant arrives through the project extras without the condition
 * (docs/security/RBAC.md, "Volunteer permission sets and RPM-granted extras").
 */
const CONDITIONS: Record<string, ConditionCheck> = {
  if_rpm_grants: () => false,
  house_construction_only: onTemplate(TEMPLATE.houseConstruction),
  safe_water_only: onTemplate(TEMPLATE.safeWater),
  tree_planting_only: onTemplate(TEMPLATE.treePlanting),
  house_construction_project: (ctx) =>
    ctx.project?.workflowKey === TEMPLATE.houseConstruction && ctx.attachedToProject === true,
  own_created: (ctx) =>
    ctx.record?.createdBy !== undefined && ctx.record.createdBy === ctx.actor.userId,
  own_or_paid_volunteer_issues: (ctx) =>
    ctx.record?.createdBy === ctx.actor.userId ||
    (ctx.record?.raisedByRoles?.includes('volunteer_paid') ?? false),
  own_region: (ctx) => ctx.inOwnRegion === true,
  own_part: (ctx) => ctx.record?.ownPart === true,
  type_both_only: (ctx) => ctx.actor.volunteerType === 'both',
  no_open_applications: (ctx) => ctx.target?.openApplications === 0,
};

/**
 * True when the named condition holds; an unknown name or a missing fact denies
 * (docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md).
 */
export function checkCondition(name: string, ctx: ConditionContext): boolean {
  const check = Object.hasOwn(CONDITIONS, name) ? CONDITIONS[name] : undefined;
  return check ? check(ctx) : false;
}

/** Stops the start when permissions.yaml names a condition that has no check here. */
export function assertConditionsCovered(registry: AccessRegistry): void {
  const missing = [...registry.conditions].filter((name) => !Object.hasOwn(CONDITIONS, name));
  if (missing.length)
    throw new Error(`permissions.yaml names conditions without a check: ${missing.join(', ')}`);
}
