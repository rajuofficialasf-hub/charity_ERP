import type { WorkflowDefinition } from '@css/shared';

/**
 * The guards and effects a workflow template may name (docs/architecture/WORKFLOW_ENGINE.md,
 * "Guard catalogue" and "Effect catalogue"). A built name has its code in `guards.ts` or
 * `effects.ts`; a declared name belongs to a later module and refuses the transition that reaches
 * it, so a template never passes a check or skips a side effect by naming something that does not
 * exist yet. A name in neither list stops the seed and the API start.
 */
export const BUILT_GUARDS = [
  'project.active',
  'project.not_closed',
  'deadline.open',
  'limit.not_exceeded',
  'identity.present',
  'mandatory_fields.present',
  'beneficiary.not_blocked',
  'volunteer.not_blocked',
  'consent.accepted',
  'actor.not_creator',
  'approver.has_permission',
  'score.comment_if_against_order',
  'zakat.eligible_if_zakat_fund',
] as const;
export type BuiltGuard = (typeof BUILT_GUARDS)[number];

export const DECLARED_GUARDS = [
  'project.setup_complete',
  'template.project_close_guards',
  'receipt.confirmed',
  'photos.required_per_rule',
  'photos.not_pending_sync',
  'stock.balanced',
  'stages.all_completed',
  'evidence.photo_present',
  'exam.passed',
  'payment.recorded',
  'vouchers.verified',
  'site_verification.recorded',
  'field_unlock.open',
  'workers.assigned',
  'animals.allocated',
  'donor.notified',
  'animal_photos.complete',
] as const;

/** An effect name, or the part before the colon for effects that take a parameter. */
export const BUILT_EFFECTS = [
  'audit',
  'notify',
  'score.compute',
  'score.snapshot',
  'quota.increment',
  'lock:fields',
  'ledger.post:approved',
] as const;

export const DECLARED_EFFECTS = [
  'waitlist.enqueue',
  'waitlist.dequeue',
  'needs_verification.link',
  'unlock',
  'lock:photos',
  'lock:vouchers',
  'ledger.post',
  'outcome.set',
  'profile.status',
  'stock.recompute',
  'activity.create',
  'activity.close',
  'alert.raise',
  'donor.email',
  'applications.restore_prior_state',
] as const;

const has = (list: readonly string[], name: string) => list.includes(name);

/** The name an effect is known by: itself, else the part before its parameter. */
export function effectKey(name: string, list: readonly string[]): string | null {
  if (has(list, name)) return name;
  const colon = name.indexOf(':');
  if (colon > 0 && has(list, name.slice(0, colon))) return name.slice(0, colon);
  return null;
}

export const isBuiltGuard = (name: string): name is BuiltGuard => has(BUILT_GUARDS, name);
export const isDeclaredGuard = (name: string) => has(DECLARED_GUARDS, name);
export const isBuiltEffect = (name: string) => effectKey(name, BUILT_EFFECTS) !== null;
export const isDeclaredEffect = (name: string) => effectKey(name, DECLARED_EFFECTS) !== null;

interface NamedTransition {
  permission?: string;
  guards?: readonly string[];
  effects?: readonly string[];
}

function transitionsOf(def: WorkflowDefinition): NamedTransition[] {
  return [
    ...(def.transitions ?? []),
    ...(def.stage_transitions ?? []),
    ...(def.project_lifecycle?.transitions ?? []),
    ...(def.donor_flow?.transitions ?? []),
    ...Object.values(def.sub_workflows ?? {}).flatMap((s) => s.transitions),
  ];
}

/**
 * Throws one error naming every guard, effect or permission a definition uses that is neither
 * built nor declared (or, for a permission, not in permissions.yaml).
 */
export function assertWorkflowNamesKnown(
  definitions: readonly WorkflowDefinition[],
  isKnownPermission: (name: string) => boolean,
): void {
  const problems: string[] = [];
  for (const def of definitions) {
    const where = `${def.template} v${def.version}`;
    for (const t of transitionsOf(def)) {
      for (const g of t.guards ?? [])
        if (!isBuiltGuard(g) && !isDeclaredGuard(g)) problems.push(`${where}: unknown guard ${g}`);
      for (const e of t.effects ?? [])
        if (!isBuiltEffect(e) && !isDeclaredEffect(e))
          problems.push(`${where}: unknown effect ${e}`);
      if (t.permission && !isKnownPermission(t.permission))
        problems.push(`${where}: unknown permission ${t.permission}`);
    }
    for (const g of def.project_close_guards ?? [])
      if (!isBuiltGuard(g) && !isDeclaredGuard(g))
        problems.push(`${where}: unknown close guard ${g}`);
  }
  if (problems.length)
    throw new Error(`workflow templates name what is not implemented:\n${problems.join('\n')}`);
}
