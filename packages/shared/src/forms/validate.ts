import { z } from 'zod';
import { answerValueSchema, type AnswerValue } from '../jsonb/answer-value.js';
import { snakeKey } from '../jsonb/common.js';
import { isAmount, toPaisa } from '../projects/budget.js';
import {
  COUNTED_ROWS_MAX,
  indexFields,
  validationOf,
  type FieldDefault,
  type FormDefinition,
  type FormField,
  type LocatedField,
} from './definition.js';
import {
  amountOf,
  evaluate,
  fieldPath,
  plainOf,
  type Answer,
  type ComputedValue,
  type EvaluationContext,
  type FieldState,
} from './evaluate.js';
import { isChoiceType, isFileType, isTextType, type FieldType } from './library.js';
import { matchesPattern, PATTERNS, TEXT_MAX_LENGTH, type PatternKey } from './patterns.js';
import { split, type FamilyMemberRow } from './split.js';

/**
 * Validates a set of answers against a definition, the same way on the phone and on the server:
 * the value shape per type, required only while visible, min, max, length and the named pattern,
 * option membership with branching and the "other" text, repeat rows, a complete address and
 * file ids only on file fields. Calculated answers from the client are dropped and recomputed.
 * The result carries the clean answers and their split for the application service.
 */
export type Audience = 'official' | 'volunteer' | 'public';

export interface ValidateOptions extends EvaluationContext {
  audience: Audience;
  /** A draft may leave required questions unanswered; every answer given is still checked. */
  draft?: boolean;
  /** The answers stored before this save: a read-only answer keeps the value it was first given. */
  previous?: readonly Answer[];
}

export interface ValidationError {
  /** `<fieldKey>` or `<fieldKey>[<row>]`. */
  path: string;
  /** A message key of the error catalogue. */
  code: string;
  params?: Record<string, string | number>;
}

export type ValidationResult =
  | {
      ok: true;
      /** The answers to store: the client's visible ones, trimmed, plus the recomputed values. */
      answers: Answer[];
      computed: Record<string, ComputedValue>;
      standard: Record<string, unknown>;
      familyMembers: FamilyMemberRow[];
      custom: Answer[];
    }
  | { ok: false; errors: ValidationError[] };

/** The answer a default gives a question of its type, or null for a default that does not fit. */
function defaultValue(field: FormField, start: FieldDefault, today: string): AnswerValue | null {
  if ('today' in start) return field.type === 'date' ? { t: 'date', v: today } : null;
  if ('text' in start)
    return isTextType(field.type) ? ({ t: field.type, v: start.text } as AnswerValue) : null;
  if (field.type === 'money')
    return { t: 'money', v: amountOf(BigInt(Math.round(start.number * 100))) };
  if (field.type === 'number' || field.type === 'decimal')
    return { t: field.type, v: start.number };
  return null;
}

/** The public never sends more rows than this, whatever the definition allows. */
export const PUBLIC_MAX_ROWS = 50;

/** An answer as sent: the key and row are checked here, the value against the field's type later. */
const incomingAnswerSchema = z.strictObject({
  fieldKey: snakeKey,
  repeatIndex: z.int().min(0).optional(),
  value: z.unknown(),
});

const isEmptyValue = (value: AnswerValue) => plainOf(value) === null && value.t !== 'calculation';

/** The four levels of an address as sent, before the full shape check, so a missing one is named. */
const addressProbe = z.looseObject({
  t: z.string().optional(),
  division_id: z.unknown().optional(),
  district_id: z.unknown().optional(),
  upazila_id: z.unknown().optional(),
  union_id: z.unknown().optional(),
});

/** A text as sent, before the full shape check, so a text over the cap is refused as too long. */
const textProbe = z.looseObject({ v: z.string() });

/** The implicit pattern of a typed text field, when the definition names none. */
const IMPLICIT_PATTERN: Partial<Record<FieldType, PatternKey>> = {
  email: 'email',
  phone: 'mobile',
};

class Validator {
  readonly errors: ValidationError[] = [];
  readonly fields: Map<string, LocatedField>;
  /** The answers kept, by slot `key#row`. */
  readonly kept = new Map<string, Answer>();
  /** The slots whose answer was refused on intake; a second error there would say nothing new. */
  private readonly refused = new Set<string>();

  constructor(
    private readonly definition: FormDefinition,
    private readonly options: ValidateOptions,
  ) {
    this.fields = indexFields(definition);
  }

  private fail(path: string, code: string, params?: ValidationError['params']) {
    this.errors.push(params ? { path, code, params } : { path, code });
  }

  /** Takes the client's answers in: unknown keys, wrong places and official-only answers fail. */
  intake(raw: readonly unknown[]) {
    for (const item of raw) {
      const parsed = incomingAnswerSchema.safeParse(item);
      if (!parsed.success) {
        const named = z.looseObject({ fieldKey: z.string() }).safeParse(item);
        this.fail(named.success ? named.data.fieldKey : '', 'validation.malformed');
        continue;
      }
      const { fieldKey, value } = parsed.data;
      const row = parsed.data.repeatIndex ?? 0;
      const located = this.fields.get(fieldKey);
      if (!located) {
        this.fail(fieldKey, 'form.unknown_field');
        continue;
      }
      const path = fieldPath(fieldKey, row, located.group !== null);
      if (located.section.visibility === 'official_only' && this.options.audience !== 'official') {
        this.fail(path, 'form.official_only_field');
        continue;
      }
      const { type } = located.field;
      if (type === 'note' || type === 'repeat_group' || (located.group === null && row > 0)) {
        this.fail(path, 'form.unexpected_answer');
        continue;
      }
      // a calculated or read-only value is never trusted: the engine recomputes it, or the default
      // is written below
      if (type === 'calculation' || located.field.settings?.read_only === true) continue;
      const slot = `${fieldKey}#${row}`;
      if (this.kept.has(slot)) {
        this.fail(path, 'form.duplicate_answer');
        continue;
      }
      const shaped = this.shape(located, path, value);
      if (shaped === null) {
        this.refused.add(slot);
        continue;
      }
      if (isEmptyValue(shaped)) continue;
      this.kept.set(slot, { fieldKey, repeatIndex: row, value: shaped });
    }
  }

  /** The value in its field's branch, trimmed where it is text; null (and an error) otherwise. */
  private shape(located: LocatedField, path: string, value: unknown): AnswerValue | null {
    const { type } = located.field;
    if (type === 'bd_address') {
      const probe = addressProbe.safeParse(value);
      if (probe.success && (probe.data.t === undefined || probe.data.t === 'bd_address')) {
        const given = probe.data;
        const missing = [
          ['division_id', given.division_id],
          ['district_id', given.district_id],
          ['upazila_id', given.upazila_id],
          ['union_id', given.union_id],
        ]
          .filter(([, id]) => !z.uuid().safeParse(id).success)
          .map(([level]) => level);
        if (missing.length) {
          this.fail(path, 'validation.address_incomplete', { missing: missing.join(',') });
          return null;
        }
      }
    }
    if (isTextType(type)) {
      const probe = textProbe.safeParse(value);
      const cap = Math.min(
        validationOf(located.field).max_length ?? TEXT_MAX_LENGTH,
        TEXT_MAX_LENGTH,
      );
      if (probe.success && probe.data.v.length > cap) {
        this.fail(path, 'validation.too_long', { max: cap });
        return null;
      }
    }
    const parsed = answerValueSchema.safeParse(value);
    if (!parsed.success || parsed.data.t !== type) {
      this.fail(path, 'validation.value_shape', { type });
      return null;
    }
    const shaped = parsed.data;
    switch (shaped.t) {
      case 'short_text':
      case 'long_text':
      case 'phone':
      case 'email':
        return { t: shaped.t, v: shaped.v.trim() };
      case 'single_select':
      case 'radio':
      case 'multi_select':
      case 'checkbox':
        return shaped.other === undefined ? shaped : { ...shaped, other: shaped.other.trim() };
      default:
        return shaped;
    }
  }

  /**
   * Writes the default of every read-only question outside a group, whatever the client sent: the
   * value it was first given when one is stored, else the default; an office-only one only for an
   * official.
   */
  applyReadOnlyDefaults() {
    for (const located of this.fields.values()) {
      const { field } = located;
      const start = field.settings?.default;
      if (field.settings?.read_only !== true || start === undefined || located.group !== null)
        continue;
      if (located.section.visibility === 'official_only' && this.options.audience !== 'official')
        continue;
      const value = defaultValue(field, start, this.options.today);
      if (!value) continue;
      const stored = this.options.previous?.find(
        (a) => a.fieldKey === field.fieldKey && (a.repeatIndex ?? 0) === 0,
      );
      this.kept.set(`${field.fieldKey}#0`, {
        fieldKey: field.fieldKey,
        repeatIndex: 0,
        value: stored && stored.value.t === value.t ? stored.value : value,
      });
    }
  }

  /** The rows a group's answers fill: its highest answered row plus one. */
  private answeredRows(group: string): number {
    let rows = 0;
    for (const answer of this.kept.values())
      if (this.fields.get(answer.fieldKey)?.group === group)
        rows = Math.max(rows, (answer.repeatIndex ?? 0) + 1);
    return rows;
  }

  /** The rules of every visible field, per row inside a group. */
  check() {
    const evaluation = evaluate(this.definition, [...this.kept.values()], this.options);
    const states = new Map(Object.entries(evaluation.fields));
    this.states = states;
    const rows = new Map(Object.entries(evaluation.rows));
    for (const located of this.fields.values()) {
      const { field } = located;
      if (located.group === null) {
        const state = states.get(field.fieldKey);
        if (!state) continue;
        if (field.type === 'repeat_group')
          this.checkRows(located, state, rows.get(field.fieldKey) ?? 0);
        else this.checkField(located, 0, state);
        continue;
      }
      const count = rows.get(located.group) ?? 0;
      for (let row = 0; row < count; row += 1) {
        const state = states.get(fieldPath(field.fieldKey, row, true));
        if (state) this.checkField(located, row, state);
      }
    }
    // an answer to a hidden field is dropped, never stored
    for (const [slot, answer] of this.kept) {
      const located = this.fields.get(answer.fieldKey)!;
      const state = states.get(
        fieldPath(answer.fieldKey, answer.repeatIndex ?? 0, located.group !== null),
      );
      if (!state?.visible) this.kept.delete(slot);
    }
    return evaluation;
  }

  private states = new Map<string, FieldState>();

  private checkRows(located: LocatedField, state: FieldState, count: number) {
    if (!state.visible) return;
    const { field } = located;
    const repeat = field.settings?.repeat ?? {};
    // rows that follow a count: never more than the cap; a draft may differ from the count, the
    // submission holds the count's rows (a blank one too) and nothing beyond them
    if (repeat.count_from !== undefined) {
      const answered = this.answeredRows(field.fieldKey);
      const cap = Math.min(repeat.max_rows ?? COUNTED_ROWS_MAX, COUNTED_ROWS_MAX);
      if (answered > cap) {
        this.fail(field.fieldKey, 'validation.rows_too_many', { max: cap });
        return;
      }
      if (this.options.draft) return;
      const source = this.kept.get(`${repeat.count_from}#0`);
      const given =
        this.states.get(repeat.count_from)?.visible && source?.value.t === 'number'
          ? source.value.v
          : 0;
      const expected = Math.min(Math.max(Math.floor(given), 0), cap);
      if (answered > expected)
        this.fail(field.fieldKey, 'validation.repeat_rows_mismatch', { expected });
      return;
    }
    const min = repeat.min_rows ?? (state.required ? 1 : 0);
    const definedMax = repeat.max_rows;
    const max =
      this.options.audience === 'public'
        ? Math.min(definedMax ?? PUBLIC_MAX_ROWS, PUBLIC_MAX_ROWS)
        : definedMax;
    if (count === 0 && state.required) {
      if (!this.options.draft) this.fail(field.fieldKey, 'validation.required');
    } else if (count < min) this.fail(field.fieldKey, 'validation.rows_too_few', { min });
    if (max !== undefined && count > max)
      this.fail(field.fieldKey, 'validation.rows_too_many', { max });
  }

  private checkField(located: LocatedField, row: number, state: FieldState) {
    const { field } = located;
    if (!state.visible || field.type === 'calculation' || field.type === 'note') return;
    const path = fieldPath(field.fieldKey, row, located.group !== null);
    if (this.refused.has(`${field.fieldKey}#${row}`)) return;
    const answer = this.kept.get(`${field.fieldKey}#${row}`);
    if (!answer) {
      if (state.required && !this.options.draft) this.fail(path, 'validation.required');
      return;
    }
    const { value } = answer;
    if (isTextType(field.type) && 'v' in value && typeof value.v === 'string')
      this.checkText(field, path, value.v);
    else if (value.t === 'number' || value.t === 'decimal') this.checkNumber(field, path, value.v);
    else if (value.t === 'money') this.checkMoney(field, path, value.v);
    else if (isChoiceType(field.type) && (value.t === 'single_select' || value.t === 'radio'))
      this.checkChoice(path, state, [value.v], value.other);
    else if (isChoiceType(field.type) && (value.t === 'multi_select' || value.t === 'checkbox'))
      this.checkChoice(path, state, value.v, value.other);
    else if (isFileType(field.type) && 'v' in value && Array.isArray(value.v))
      this.checkCount(field, path, value.v.length);
  }

  private checkText(field: FormField, path: string, text: string) {
    const rules = validationOf(field);
    const cap = Math.min(rules.max_length ?? TEXT_MAX_LENGTH, TEXT_MAX_LENGTH);
    if (text.length > cap) {
      this.fail(path, 'validation.too_long', { max: cap });
      return;
    }
    if (rules.min_length !== undefined && text.length < rules.min_length) {
      this.fail(path, 'validation.too_short', { min: rules.min_length });
      return;
    }
    const pattern = rules.pattern ?? IMPLICIT_PATTERN[field.type];
    if (pattern !== undefined && !matchesPattern(pattern, text, cap))
      this.fail(path, rules.message_key ?? PATTERNS[pattern].messageKey);
  }

  private checkNumber(field: FormField, path: string, n: number) {
    if (field.type === 'number' && !Number.isInteger(n)) {
      this.fail(path, 'validation.whole_number');
      return;
    }
    const rules = validationOf(field);
    if ((rules.min !== undefined && n < rules.min) || (rules.max !== undefined && n > rules.max))
      this.fail(path, rules.message_key ?? 'validation.out_of_range', this.range(rules));
  }

  private checkMoney(field: FormField, path: string, amount: string) {
    const rules = validationOf(field);
    if (!isAmount(amount)) {
      this.fail(path, 'validation.amount_format');
      return;
    }
    const paisa = toPaisa(amount);
    const bound = (n: number | undefined) =>
      n === undefined ? undefined : BigInt(Math.round(n * 100));
    const min = bound(rules.min);
    const max = bound(rules.max);
    if ((min !== undefined && paisa < min) || (max !== undefined && paisa > max))
      this.fail(path, rules.message_key ?? 'validation.out_of_range', this.range(rules));
  }

  private range(rules: { min?: number; max?: number }) {
    const params: Record<string, number> = {};
    if (rules.min !== undefined) params.min = rules.min;
    if (rules.max !== undefined) params.max = rules.max;
    return params;
  }

  private checkChoice(path: string, state: FieldState, codes: string[], other: string | undefined) {
    const allowed = new Map(state.options.map((o) => [o.code, o]));
    const unknown = codes.filter((code) => !allowed.has(code));
    if (unknown.length) {
      this.fail(path, 'validation.option_unknown', { code: unknown.join(',') });
      return;
    }
    if (
      other !== undefined &&
      other !== '' &&
      !codes.some((code) => allowed.get(code)?.allowsOtherText)
    )
      this.fail(path, 'validation.other_text_not_allowed');
  }

  private checkCount(field: FormField, path: string, count: number) {
    const rules = validationOf(field);
    if (rules.max !== undefined && count > rules.max)
      this.fail(path, 'validation.out_of_range', this.range(rules));
  }
}

/**
 * Validates answers for an audience. The official audience may answer every section; the
 * volunteer and the public never an official-only one, and the public is capped at 4,000
 * characters per text and 50 rows per group whatever the definition says.
 */
export function validate(
  definition: FormDefinition,
  answers: readonly unknown[],
  options: ValidateOptions,
): ValidationResult {
  const validator = new Validator(definition, options);
  validator.intake(answers);
  validator.applyReadOnlyDefaults();
  const evaluation = validator.check();
  if (validator.errors.length) return { ok: false, errors: validator.errors };
  const kept = [...validator.kept.values()];
  const computedAnswers: Answer[] = [];
  for (const [path, v] of Object.entries(evaluation.computed)) {
    if (v === null) continue;
    const match = /^([a-z0-9_]+)(?:\[(\d+)\])?$/u.exec(path);
    if (!match) continue;
    const repeatIndex = match[2] === undefined ? 0 : Number(match[2]);
    computedAnswers.push({ fieldKey: match[1]!, repeatIndex, value: { t: 'calculation', v } });
  }
  const all = [...kept, ...computedAnswers];
  const parts = split(definition, all);
  return { ok: true, answers: all, computed: evaluation.computed, ...parts };
}
