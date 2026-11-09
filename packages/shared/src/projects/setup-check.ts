import { componentSettingsSchema, componentSettingsSchemas } from '../jsonb/component-settings.js';
import { isAmount, plannedBudgetPaisa, sumPaisa, toPaisa } from './budget.js';
import { missingRuleParts, type RulesPart } from './rules.js';

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
  /** The current rules texts (`projects.rules`); the dawah part counts while dawah is on. */
  rules: unknown;
  dawahEnabled: boolean;
  /** Whether a form of the project has a published version (the application form component needs one). */
  publishedForm: boolean;
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
  | 'photo_rule'
  | 'form'
  | `component:${string}`
  | `rules:${RulesPart}`;

/**
 * Everything a draft needs before it can be activated (DECISION_LOG D-095): the basics, the
 * application window, the per-volunteer limit where the workflow has one, the budget, fund sources
 * that add up to the planned budget, at least one area with an RPM, a photo rule, and valid
 * settings for every enabled component. The values are checked, not only their presence: the
 * window runs forwards, the limit is a whole number of at least 1, cost and target are above zero.
 * The rules texts every volunteer accepts are needed too: the volunteer's duties, the
 * implementation process and the consequences of misconduct, and the Local দায়ী's duties while
 * dawah is on (DECISION_LOG D-096), and a published application form while the application-form
 * component is on. An empty list means the project may be activated.
 */
export function setupCheck(input: SetupInput): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!input.name?.bn.trim() || !input.name.en.trim()) missing.push('name');
  if (input.year === null) missing.push('year');
  if (!input.workflowKey) missing.push('workflow');
  // ISO dates (yyyy-mm-dd) compare correctly as strings
  if (!input.applyFrom || !input.applyTo || input.applyFrom > input.applyTo) missing.push('window');
  const limit = input.perVolunteerLimit;
  if (input.limitRequired && (limit === null || !Number.isInteger(limit) || limit < 1))
    missing.push('limit');
  const cost = input.costPerBeneficiary;
  const costOk = cost !== null && isAmount(cost) && toPaisa(cost) > 0n;
  if (!costOk) missing.push('cost');
  const target = input.targetBeneficiaries;
  const targetOk = target !== null && Number.isInteger(target) && target > 0;
  if (!targetOk) missing.push('target');
  if (input.fundSources.length === 0) missing.push('fund_sources');
  else if (input.fundSources.some((f) => !isAmount(f.amount))) missing.push('fund_sources_total');
  else if (costOk && targetOk) {
    const planned = plannedBudgetPaisa(cost, target);
    if (sumPaisa(input.fundSources.map((f) => f.amount)) !== planned)
      missing.push('fund_sources_total');
  }
  if (input.areaCount === 0) missing.push('area');
  const form = input.components.find((c) => c.componentKey === 'application_form');
  if (form?.enabled && !input.publishedForm) missing.push('form');
  missing.push(...componentsCheck(input.components));
  missing.push(
    ...missingRuleParts(input.rules, input.dawahEnabled).map((part) => `rules:${part}` as const),
  );
  return missing;
}

/**
 * The component part of the activation check, which an active project keeps passing: a photo rule,
 * and valid settings for every enabled component.
 */
export function componentsCheck(components: SetupInput['components']): MissingItem[] {
  const missing: MissingItem[] = [];
  // the photo rule is a project-wide setting on the distribution row, needed whether that
  // component is on or not
  const photo = components.find((c) => c.componentKey === 'distribution');
  if (!photo || !componentSettingsSchemas.photo_rule.safeParse(photo.settings).success)
    missing.push('photo_rule');
  for (const c of components)
    if (
      c.enabled &&
      c.componentKey !== 'distribution' &&
      !componentSettingsSchema(c.componentKey).safeParse(c.settings).success
    )
      missing.push(`component:${c.componentKey}`);
  return missing;
}
