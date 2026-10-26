import type { AnswerValue } from '@css/shared';
import type { Answer } from '@css/shared/forms';
import { z } from 'zod';

/**
 * The answers of a form being filled, in the engine's own shape (one entry per field and repeat
 * row), with the number of rows each repeat group shows and the step the person is on. An answer
 * that is emptied is removed, so the engine sees it as not given.
 */
export interface FormAnswers {
  clientUuid: string;
  answers: Answer[];
  /** Repeat group key → rows shown, including rows nobody has typed in yet. */
  rows: Record<string, number>;
  step: number;
  /**
   * Grows each time answers are replaced underneath the inputs (a row removed, a form sent), so
   * the inputs that hold a half-made choice of their own start again from the answers.
   */
  generation: number;
}

const rowOf = (a: Answer) => a.repeatIndex ?? 0;

export function answerOf(state: FormAnswers, fieldKey: string, row = 0): AnswerValue | undefined {
  return state.answers.find((a) => a.fieldKey === fieldKey && rowOf(a) === row)?.value;
}

/** Sets an answer, or removes it when `value` is null. */
export function setAnswer(
  state: FormAnswers,
  fieldKey: string,
  row: number,
  inGroup: boolean,
  value: AnswerValue | null,
): FormAnswers {
  const others = state.answers.filter((a) => !(a.fieldKey === fieldKey && rowOf(a) === row));
  if (value === null) return { ...state, answers: others };
  const answer: Answer = inGroup ? { fieldKey, repeatIndex: row, value } : { fieldKey, value };
  return { ...state, answers: [...others, answer] };
}

/** Removes a row of a group: its answers go and the rows after it move up by one. */
export function removeRow(
  state: FormAnswers,
  group: string,
  members: readonly string[],
  row: number,
): FormAnswers {
  const inGroup = new Set(members);
  const answers = state.answers.flatMap((a) => {
    if (!inGroup.has(a.fieldKey)) return [a];
    const r = rowOf(a);
    if (r === row) return [];
    return r > row ? [{ ...a, repeatIndex: r - 1 }] : [a];
  });
  return {
    ...state,
    answers,
    rows: { ...state.rows, [group]: Math.max(0, (state.rows[group] ?? 0) - 1) },
    generation: state.generation + 1,
  };
}

const storedSchema = z.object({
  clientUuid: z.uuid(),
  answers: z.array(
    z.object({
      fieldKey: z.string().min(1),
      repeatIndex: z.number().int().min(0).optional(),
      // the value's own rules are the engine's, which checks it before anything is sent
      value: z.looseObject({ t: z.string() }),
    }),
  ),
  rows: z.record(z.string(), z.number().int().min(0)),
  step: z.number().int().min(0),
  generation: z.number().int().min(0).optional(),
});

/** A stored copy of the answers, or null when it does not look like one. */
export function storedAnswersOf(raw: unknown): FormAnswers | null {
  const parsed = storedSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { generation = 0, answers, ...rest } = parsed.data;
  return { ...rest, generation, answers: answers as Answer[] };
}

/** Drops the rows of a group from `count` on: their answers go, and the group keeps `count` rows. */
export function trimRows(
  state: FormAnswers,
  group: string,
  members: readonly string[],
  count: number,
): FormAnswers {
  const keys = new Set(members);
  return {
    ...state,
    answers: state.answers.filter((a) => !keys.has(a.fieldKey) || (a.repeatIndex ?? 0) < count),
    rows: { ...state.rows, [group]: count },
  };
}

/** The rows of a group its answers fill: the highest answered row plus one. */
export function answeredRows(state: FormAnswers, members: readonly string[]): number {
  const keys = new Set(members);
  return state.answers.reduce(
    (rows, a) => (keys.has(a.fieldKey) ? Math.max(rows, (a.repeatIndex ?? 0) + 1) : rows),
    0,
  );
}
