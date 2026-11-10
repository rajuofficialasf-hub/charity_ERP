import { type MissingItem, setupCheck, WORKFLOWS_WITHOUT_LIMIT } from '@css/shared/projects';
import type { StepMark } from '@/ui';
import type { Project } from '../projects-api';
import type { Area, FundSource, ProjectComponent } from './setup-api';

/** The steps of the project setup in their order; budget and syllabus come when they apply, the rules always. */
export const STEP_IDS = [
  'basics',
  'components',
  'budget',
  'window',
  'areas',
  'staff',
  'syllabus',
  'rules',
  'review',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export const isStepId = (value: string | null): value is StepId =>
  (STEP_IDS as readonly (string | null)[]).includes(value);

/** The step each missing activation item is fixed in. */
const STEP_OF = new Map<MissingItem, StepId>([
  ['name', 'basics'],
  ['year', 'basics'],
  ['workflow', 'basics'],
  ['window', 'window'],
  ['limit', 'window'],
  ['cost', 'budget'],
  ['target', 'budget'],
  ['fund_sources', 'budget'],
  ['fund_sources_total', 'budget'],
  ['area', 'areas'],
  ['photo_rule', 'components'],
  ['form', 'components'],
]);
export const stepOfMissing = (item: string): StepId =>
  item.startsWith('component:')
    ? 'components'
    : item.startsWith('rules:')
      ? 'rules'
      : (STEP_OF.get(item as MissingItem) ?? 'basics');

/** The steps whose data the activation check reads: only they carry a complete or missing mark. */
const CHECKED = new Set<StepId>(['basics', 'components', 'budget', 'window', 'areas', 'rules']);

/** What activation still needs, from the same shared check the server runs. */
export function missingItems(
  project: Project,
  components: ProjectComponent[],
  fundSources: FundSource[],
  areas: Area[],
  rules: unknown,
  publishedForm: boolean,
): MissingItem[] {
  return setupCheck({
    name: project.name,
    year: project.year,
    workflowKey: project.workflowKey,
    applyFrom: project.applyFrom,
    applyTo: project.applyTo,
    perVolunteerLimit: project.perVolunteerLimit,
    limitRequired: !WORKFLOWS_WITHOUT_LIMIT.includes(project.workflowKey),
    costPerBeneficiary: project.costPerBeneficiary ?? null,
    targetBeneficiaries: project.targetBeneficiaries ?? null,
    fundSources,
    areaCount: areas.length,
    components: components.map((c) => ({ ...c, settings: c.settings ?? {} })),
    rules,
    dawahEnabled: project.dawahEnabled,
    publishedForm,
  });
}

/** A mark per step: complete or missing for the checked steps, none for the others or unknown. */
export function marksFor(steps: StepId[], missing: string[] | null): StepMark[] {
  if (!missing) return steps.map(() => undefined);
  const open = new Set(missing.map(stepOfMissing));
  return steps.map((s) => (!CHECKED.has(s) ? undefined : open.has(s) ? 'missing' : 'complete'));
}

/**
 * Where a return to the setup starts: the first step with something missing, else the review;
 * the first step when what is missing is not known (a part did not load).
 */
export function firstOpenStep(steps: StepId[], missing: string[] | null): StepId {
  if (!missing) return steps[0] ?? 'basics';
  const open = new Set(missing.map(stepOfMissing));
  return steps.find((s) => open.has(s)) ?? 'review';
}
