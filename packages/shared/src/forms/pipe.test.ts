import { describe, expect, it } from 'vitest';
import { definitionWith, field, option, T, TODAY } from '../../test/forms-fixture.js';
import { answerTexts, evaluate, pipeKeys, pipeText, pipeWithout, type Answer } from './index.js';

// A question's text may repeat an earlier answer: in the reader's language, as plain text, with a
// fallback while the answer is empty.
const fields = [
  field('q_farm', 'single_select', {
    options: [option('cow', { label: { bn: 'গরু', en: 'Cow' } }), option('goat')],
  }),
  field('q_name', 'short_text'),
  field('q_count', 'number', {
    label: { bn: 'কতটি {{q_farm|পশু}} পালন করতে চান?', en: 'How many {{q_farm|animals}}?' },
  }),
];
const textsOf = (answers: Answer[], locale: 'bn' | 'en') => {
  const definition = definitionWith(fields);
  return answerTexts(definition, answers, evaluate(definition, answers, { today: TODAY }), locale);
};
const farm: Answer = { fieldKey: 'q_farm', value: { t: 'single_select', v: 'cow' } };

describe('an earlier answer in a question’s text', () => {
  it('reads a choice by its label in the reader’s language', () => {
    expect(pipeText('কতটি {{q_farm|পশু}} পালন করতে চান?', textsOf([farm], 'bn'))).toBe(
      'কতটি গরু পালন করতে চান?',
    );
    expect(pipeText('How many {{q_farm|animals}}?', textsOf([farm], 'en'))).toBe('How many Cow?');
  });

  it('reads a choice of a draft written in one language by that language', () => {
    const definition = definitionWith([
      field('q_farm', 'single_select', {
        options: [option('cow', { label: { bn: 'গরু', en: '' } })],
      }),
      field('q_count', 'number'),
    ]);
    const read = answerTexts(
      definition,
      [farm],
      evaluate(definition, [farm], { today: TODAY }),
      'en',
    );
    expect(pipeText('How many {{q_farm|animals}}?', read)).toBe('How many গরু?');
  });

  it('reads the fallback, or nothing, while the answer is empty', () => {
    expect(pipeText('কতটি {{q_farm|পশু}} পালন করতে চান?', textsOf([], 'bn'))).toBe(
      'কতটি পশু পালন করতে চান?',
    );
    expect(pipeText('Name: {{q_name}}.', textsOf([], 'en'))).toBe('Name: .');
  });

  it('gives an answer back as the same plain text, markup included', () => {
    const typed: Answer = {
      fieldKey: 'q_name',
      value: { t: 'short_text', v: '<img src=x onerror=alert(1)>' },
    };
    expect(pipeText('Name: {{q_name}}', textsOf([typed], 'en'))).toBe(
      'Name: <img src=x onerror=alert(1)>',
    );
  });

  it('reads a calculation’s text result by its label and a number as written', () => {
    const calculated = definitionWith([
      field('income', 'money'),
      field('band', 'calculation', {
        calculation: {
          expr: {
            if: [{ when: { field: 'income', op: 'lt', value: 5000 }, then: { result: 'low' } }],
            else: { result: 'high' },
          },
        },
        settings: {
          results: [
            { code: 'low', label: { bn: 'কম', en: 'Low' } },
            { code: 'high', label: T('high') },
          ],
        },
      }),
      field('double', 'calculation', {
        calculation: { expr: { op: 'mul', args: [{ field: 'count' }, 2] } },
      }),
      field('count', 'number'),
    ]);
    const answers: Answer[] = [
      { fieldKey: 'income', value: { t: 'money', v: '3000.00' } },
      { fieldKey: 'count', value: { t: 'number', v: 4 } },
    ];
    const read = answerTexts(
      calculated,
      answers,
      evaluate(calculated, answers, { today: TODAY }),
      'bn',
    );
    expect(pipeText('{{band}} · {{double}}', read)).toBe('কম · 8');
  });

  it('reads a hidden answer as empty, so the fallback shows', () => {
    const hidden = definitionWith([
      field('has_farm', 'radio', { options: [option('yes'), option('no')] }),
      field('farm_name', 'short_text', {
        logic: { show_if: { field: 'has_farm', op: 'eq', value: 'yes' } },
      }),
    ]);
    const answers: Answer[] = [
      { fieldKey: 'has_farm', value: { t: 'radio', v: 'no' } },
      { fieldKey: 'farm_name', value: { t: 'short_text', v: 'Green' } },
    ];
    const read = answerTexts(hidden, answers, evaluate(hidden, answers, { today: TODAY }), 'en');
    expect(pipeText('Farm: {{farm_name|none}}', read)).toBe('Farm: none');
  });

  it('reads a group’s answer at the row asked for', () => {
    const grouped = definitionWith([
      field('members', 'repeat_group'),
      field('m_name', 'short_text', { settings: { repeat: { group: 'members' } } }),
    ]);
    const answers: Answer[] = [
      { fieldKey: 'm_name', repeatIndex: 0, value: { t: 'short_text', v: 'Karim' } },
      { fieldKey: 'm_name', repeatIndex: 1, value: { t: 'short_text', v: 'Rahima' } },
    ];
    const evaluation = evaluate(grouped, answers, { today: TODAY });
    expect(pipeText('{{m_name}}', answerTexts(grouped, answers, evaluation, 'en', 1))).toBe(
      'Rahima',
    );
  });

  it('lists the keys a text names', () => {
    expect(pipeKeys('{{a}} and {{b|x}}, not {c} or {{Bad}}')).toEqual(['a', 'b']);
  });

  it('takes the tokens of the named keys out of a text and leaves the rest as written', () => {
    const gone = (key: string) => key === 'a';
    expect(pipeWithout('{{a}} and {{b|x}}, then {{a|none}}.', gone)).toBe(' and {{b|x}}, then .');
    expect(pipeWithout('{{b}} {a} {{Bad}} {{a_b}}', gone)).toBe('{{b}} {a} {{Bad}} {{a_b}}');
  });
});
