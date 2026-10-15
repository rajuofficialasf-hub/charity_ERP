import { componentSettingsSchema } from '../jsonb/component-settings.js';
import { plannedBudgetPaisa, sumPaisa } from './budget.js';

/** What the activation check reads of a project and its setup parts. */
export interface SetupInput {
  name: { bn: string; en: string } | null;
  year: number | null;
  workflowKey: string | null;
  applyFrom: string | null;
  applyTo: string | null;
  perVolunteerLimit: number | null;
  /** False for a workflow whose applications come from the public (no per-volunteer limit). */
  limitRequired: boolean;
  costPerBeneficiary: string | null;
  targetBeneficiaries: number | null;
  fundSources: { source: string; amount: string }[];
  areaCount: number;
  components: { componentKey: string; enabled: boolean; settings: unknown }[];
}

/** A missing item: a fixed key, or `component:<key>` for an enabled component with bad settings. */
export type MissingItem =
  | 'name'
  | 'year'
  | 'workflow'
  | 'window'
  | 'limit'
  | 'cost'
  | 'target'
  | 'fund_sources'
  | 'fund_sources_total'
  | 'area'
  | `component:${string}`;

/**
 * Everything a draft needs before it can be activated (DECISION_LOG D-095): the basics, the
 * application window, the per-volunteer limit where the workflow has one, the budget, fund sources
 * that add up to the planned budget, at least one area with an RPM, and valid settings for every
 * enabled component. The published form and the rules texts join this check in later tasks.
 * An empty list means the project may be activated.
 */
export function setupCheck(input: SetupInput): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!input.name?.bn.trim() || !input.name.en.trim()) missing.push('name');
  if (input.year === null) missing.push('year');
  if (!input.workflowKey) missing.push('workflow');
  if (!input.applyFrom || !input.applyTo) missing.push('window');
  if (input.limitRequired && input.perVolunteerLimit === null) missing.push('limit');
  if (input.costPerBeneficiary === null) missing.push('cost');
  if (input.targetBeneficiaries === null) missing.push('target');
  if (input.fundSources.length === 0) missing.push('fund_sources');
  else {
    const planned = plannedBudgetPaisa(input.costPerBeneficiary, input.targetBeneficiaries);
    if (planned !== null && sumPaisa(input.fundSources.map((f) => f.amount)) !== planned)
      missing.push('fund_sources_total');
  }
  if (input.areaCount === 0) missing.push('area');
  for (const c of input.components)
    if (c.enabled && !componentSettingsSchema(c.componentKey).safeParse(c.settings).success)
      missing.push(`component:${c.componentKey}`);
  return missing;
}
