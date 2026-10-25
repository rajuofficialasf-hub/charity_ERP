import type { FieldType } from './library.js';
import type { FormDefinition, FormField } from './definition.js';
import { evaluate, plainOf, type Answer, type EvaluationContext } from './evaluate.js';

/** The highest priority score; points beyond it are not counted. */
export const MAX_SCORE = 100;

/** The key of the built-in criterion in a score's breakdown. */
export const NOT_PREVIOUSLY_ASSISTED = 'not_previously_assisted';

/** How a question type carries points: per option, per range of its number, or not at all. */
export function scoreKindOf(type: FieldType): 'options' | 'ranges' | null {
  switch (type) {
    case 'single_select':
    case 'radio':
    case 'multi_select':
    case 'checkbox':
      return 'options';
    case 'number':
    case 'decimal':
    case 'money':
    case 'calculation':
      return 'ranges';
    default:
      return null;
  }
}

const isMulti = (type: FieldType) => type === 'multi_select' || type === 'checkbox';

/** The most a question can give: its best option, all its options for a multiple choice, its best range. */
function maxOf(field: FormField): number {
  const score = field.settings?.score;
  if (!score) return 0;
  if (score.options) {
    const values = Object.values(score.options);
    if (isMulti(field.type)) return values.reduce((sum, p) => sum + p, 0);
    return values.length ? Math.max(...values) : 0;
  }
  if (score.ranges?.length) return Math.max(...score.ranges.map((r) => r.points));
  return 0;
}

/** The questions that carry points, in the order of the form. */
function scoredFields(definition: FormDefinition): FormField[] {
  return definition.sections.flatMap((s) =>
    s.fields.filter((f) => f.settings?.score && scoreKindOf(f.type) !== null),
  );
}

/** The maximum a form's points can reach, the form-level criterion included. */
export function maxScoreOf(definition: FormDefinition): number {
  return (
    scoredFields(definition).reduce((sum, f) => sum + maxOf(f), 0) +
    (definition.scoring?.not_previously_assisted ?? 0)
  );
}

/** Whether a form gives a priority score at all. */
export function scoresApplications(definition: FormDefinition): boolean {
  return (
    scoredFields(definition).length > 0 || (definition.scoring?.not_previously_assisted ?? 0) > 0
  );
}

export interface ScoreItem {
  key: string;
  label?: { bn: string; en: string };
  /** The answer read, or the derived fact for the built-in criterion. */
  input: unknown;
  max_points: number;
  points: number;
}

export interface ApplicationScore {
  items: ScoreItem[];
  /** The sum of the points, never above 100. */
  total: number;
}

export interface ScoreContext extends EvaluationContext {
  /** Whether the person had no application approved in an earlier project of the same program. */
  notPreviouslyAssisted: boolean;
}

/** A number as a range reads it: a number answer, an amount, or a calculated number. */
function numberOf(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The priority score of an application: each scored question's points for its answer (a hidden or
 * empty question gives none), plus the points of "not previously assisted" when it holds; null
 * for a form without points. It only sorts and recommends; it never decides.
 */
export function scoreOf(
  definition: FormDefinition,
  answers: readonly Answer[],
  context: ScoreContext,
): ApplicationScore | null {
  if (!scoresApplications(definition)) return null;
  const evaluation = evaluate(definition, answers, context);
  const byKey = new Map(
    answers.filter((a) => (a.repeatIndex ?? 0) === 0).map((a) => [a.fieldKey, a.value]),
  );
  const items: ScoreItem[] = scoredFields(definition)
    .filter((field) => !field.settings?.repeat?.group)
    .map((field) => {
      const score = field.settings!.score!;
      const max = maxOf(field);
      const visible = evaluation.fields[field.fieldKey]?.visible ?? false;
      const stored = byKey.get(field.fieldKey);
      let input: unknown = null;
      let earned = 0;
      if (visible && scoreKindOf(field.type) === 'options' && stored) {
        const chosen = plainOf(stored);
        const codes = Array.isArray(chosen) ? chosen : chosen === null ? [] : [String(chosen)];
        input = Array.isArray(chosen) ? codes : (codes[0] ?? null);
        earned = codes.reduce((sum, code) => sum + (score.options?.[code] ?? 0), 0);
      } else if (visible && scoreKindOf(field.type) === 'ranges') {
        const value = numberOf(
          field.type === 'calculation'
            ? evaluation.computed[field.fieldKey]
            : stored
              ? plainOf(stored)
              : null,
        );
        input = value;
        if (value !== null)
          earned =
            score.ranges?.find(
              (r) =>
                (r.min === undefined || value >= r.min) && (r.max === undefined || value <= r.max),
            )?.points ?? 0;
      }
      return { key: field.fieldKey, label: field.label, input, max_points: max, points: earned };
    });
  const criterion = definition.scoring?.not_previously_assisted ?? 0;
  if (criterion > 0)
    items.push({
      key: NOT_PREVIOUSLY_ASSISTED,
      input: context.notPreviouslyAssisted,
      max_points: criterion,
      points: context.notPreviouslyAssisted ? criterion : 0,
    });
  const sum = items.reduce((total, item) => total + item.points, 0);
  return { items, total: Math.min(MAX_SCORE, sum) };
}
