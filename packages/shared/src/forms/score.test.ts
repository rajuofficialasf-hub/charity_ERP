import { describe, expect, it } from 'vitest';
import { definitionWith, field, option, TODAY } from '../../test/forms-fixture.js';
import {
  checkDefinition,
  formDefinitionSchema,
  maxScoreOf,
  scoreOf,
  type Answer,
  type FormDefinition,
  type FormField,
} from './index.js';

// The priority score of an application: the points the form gives its answers, plus the points
// of "not previously assisted", out of 100. The form decides; the score only sorts and recommends.
const answer = (fieldKey: string, value: Answer['value']): Answer => ({ fieldKey, value });

const kind = field('kind', 'single_select', {
  options: [option('widow'), option('elderly'), option('other')],
  settings: { score: { options: { widow: 20, elderly: 15 } } },
});
const needs = field('needs', 'multi_select', {
  options: [option('cloth'), option('food'), option('blanket')],
  settings: { score: { options: { cloth: 5, food: 5, blanket: 10 } } },
});
const income = field('income', 'money', {
  settings: {
    score: {
      ranges: [
        { max: 3000, points: 30 },
        { min: 3000, max: 6000, points: 15 },
        { min: 6000, points: 0 },
      ],
    },
  },
});
const members = field('members', 'number', {
  settings: {
    score: {
      ranges: [
        { min: 6, points: 20 },
        { min: 4, points: 10 },
      ],
    },
  },
});
const scored = (fields: FormField[], notPreviouslyAssisted?: number): FormDefinition => ({
  ...definitionWith(fields),
  ...(notPreviouslyAssisted === undefined
    ? {}
    : { scoring: { not_previously_assisted: notPreviouslyAssisted } }),
});
const score = (definition: FormDefinition, answers: Answer[], notPreviouslyAssisted = false) =>
  scoreOf(definition, answers, { today: TODAY, notPreviouslyAssisted });

describe('the score of an application', () => {
  it('gives a choice its option points, a multiple choice the sum of the chosen', () => {
    const result = score(scored([kind, needs]), [
      answer('kind', { t: 'single_select', v: 'widow' }),
      answer('needs', { t: 'multi_select', v: ['cloth', 'blanket'] }),
    ]);
    expect(result?.total).toBe(35);
    expect(result?.items).toEqual([
      { key: 'kind', label: kind.label, input: 'widow', max_points: 20, points: 20 },
      {
        key: 'needs',
        label: needs.label,
        input: ['cloth', 'blanket'],
        max_points: 20,
        points: 15,
      },
    ]);
  });

  it('gives a number the points of the first range it falls in, open ends included', () => {
    const at = (v: string) => score(scored([income]), [answer('income', { t: 'money', v })]);
    expect(at('2500.00')?.total).toBe(30);
    expect(at('3000')?.total).toBe(30);
    expect(at('4500')?.total).toBe(15);
    expect(at('90000')?.total).toBe(0);
    const big = (v: number) =>
      score(scored([members]), [answer('members', { t: 'number', v })])?.total;
    expect(big(7)).toBe(20);
    expect(big(5)).toBe(10);
    expect(big(2)).toBe(0);
  });

  it('scores a calculated number by its value', () => {
    const total = field('total', 'calculation', {
      calculation: { expr: { op: 'add', args: [{ field: 'men' }, { field: 'women' }] } as never },
      settings: { score: { ranges: [{ min: 5, points: 20 }] } },
    });
    const definition = scored([field('men', 'number'), field('women', 'number'), total]);
    const result = score(definition, [
      answer('men', { t: 'number', v: 3 }),
      answer('women', { t: 'number', v: 3 }),
    ]);
    expect(result?.items).toEqual([
      { key: 'total', label: total.label, input: 6, max_points: 20, points: 20 },
    ]);
  });

  it('gives a hidden or empty question no points', () => {
    const hidden = field('hidden_kind', 'single_select', {
      options: [option('widow')],
      settings: { score: { options: { widow: 20 } } },
      logic: { show_if: { field: 'kind', op: 'eq', value: 'other' } },
    });
    const result = score(scored([kind, hidden]), [
      answer('kind', { t: 'single_select', v: 'elderly' }),
      answer('hidden_kind', { t: 'single_select', v: 'widow' }),
    ]);
    expect(result?.total).toBe(15);
    expect(result?.items.find((i) => i.key === 'hidden_kind')).toMatchObject({
      input: null,
      points: 0,
    });
    expect(score(scored([kind]), [])?.total).toBe(0);
  });

  it('adds "not previously assisted" only when the person was not assisted before', () => {
    const definition = scored([kind], 20);
    const answers = [answer('kind', { t: 'single_select', v: 'widow' })];
    expect(score(definition, answers, true)?.total).toBe(40);
    expect(score(definition, answers, false)?.total).toBe(20);
    expect(score(definition, answers, true)?.items.at(-1)).toEqual({
      key: 'not_previously_assisted',
      input: true,
      max_points: 20,
      points: 20,
    });
  });

  it('never goes above 100, and gives no score to a form without points', () => {
    const rich = field('rich', 'single_select', {
      options: [option('a')],
      settings: { score: { options: { a: 90 } } },
    });
    expect(
      score(scored([kind, rich]), [
        answer('kind', { t: 'single_select', v: 'widow' }),
        answer('rich', { t: 'single_select', v: 'a' }),
      ])?.total,
    ).toBe(100);
    expect(score(definitionWith([field('note', 'short_text')]), [], true)).toBeNull();
  });

  it('reads the maximum a form can give', () => {
    expect(maxScoreOf(scored([kind, needs, income, members], 20))).toBe(110);
    expect(maxScoreOf(definitionWith([]))).toBe(0);
  });
});

describe('the points at publish', () => {
  const atPublish = (definition: FormDefinition) =>
    checkDefinition(definition, { publishing: true }).map((issue) => [
      issue.code,
      issue.params?.fieldKey,
    ]);

  it('accepts points on choices and numbers up to 100 in all', () => {
    expect(atPublish(scored([kind, needs, income], 20))).toEqual([]);
    expect(formDefinitionSchema.safeParse(scored([kind, needs, income], 20)).success).toBe(true);
  });

  it('refuses points on a text question, an unknown option and a total above 100', () => {
    const text = field('note', 'short_text', { settings: { score: { options: { a: 5 } } } });
    const ghost = field('ghost', 'radio', {
      options: [option('yes')],
      settings: { score: { options: { no: 10 } } },
    });
    expect(atPublish(scored([text]))).toEqual([['form.score_misplaced', 'note']]);
    expect(atPublish(scored([ghost]))).toEqual([['form.score_option_unknown', 'ghost']]);
    expect(atPublish(scored([kind, needs, income, members], 20))).toEqual([
      ['form.score_over_max', undefined],
    ]);
  });

  it('refuses ranges on a choice and points inside a repeat group', () => {
    const ranged = field('kind2', 'radio', {
      options: [option('a')],
      settings: { score: { ranges: [{ min: 1, points: 5 }] } },
    });
    expect(atPublish(scored([ranged]))).toEqual([['form.score_misplaced', 'kind2']]);
    const group = field('family', 'repeat_group');
    const inside = field('age', 'number', {
      settings: { repeat: { group: 'family' }, score: { ranges: [{ min: 60, points: 10 }] } },
    });
    expect(atPublish(scored([group, inside]))).toEqual([['form.score_misplaced', 'age']]);
  });

  it('lets a draft keep points the publish would refuse', () => {
    expect(checkDefinition(scored([kind, needs, income, members], 20))).toEqual([]);
  });

  it('refuses points that are not whole numbers from 0 to 100', () => {
    const bad = field('bad', 'radio', {
      options: [option('a')],
      settings: { score: { options: { a: 101 } } },
    });
    expect(formDefinitionSchema.safeParse(scored([bad])).success).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        ...scored([kind]),
        scoring: { not_previously_assisted: 2.5 },
      }).success,
    ).toBe(false);
  });
});
