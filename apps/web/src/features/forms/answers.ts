import type { AnswerValue } from '@css/shared';
import type { Answer } from '@css/shared/forms';

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
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

/**
 * A stored copy of the answers, or null when it does not look like one; the values themselves are
 * checked by the engine before anything is sent.
 */
export function storedAnswersOf(raw: unknown): FormAnswers | null {
  if (!isRecord(raw) || typeof raw.clientUuid !== 'string' || !UUID.test(raw.clientUuid))
    return null;
  if (!Array.isArray(raw.answers) || !isRecord(raw.rows) || !isCount(raw.step)) return null;
  const answers = raw.answers.filter(
    (a): a is Answer =>
      isRecord(a) &&
      typeof a.fieldKey === 'string' &&
      (a.repeatIndex === undefined || isCount(a.repeatIndex)) &&
      isRecord(a.value) &&
      typeof a.value.t === 'string',
  );
  if (answers.length !== raw.answers.length || !Object.values(raw.rows).every(isCount)) return null;
  return {
    clientUuid: raw.clientUuid,
    answers,
    rows: raw.rows as Record<string, number>,
    step: raw.step as number,
  };
}
