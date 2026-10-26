import { describe, expect, it } from 'vitest';
import { definitionWith, field, option, TODAY } from '../../test/forms-fixture.js';
import { answerTexts, evaluate, pipeKeys, pipeText, type Answer } from './index.js';

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

  it('lists the keys a text names', () => {
    expect(pipeKeys('{{a}} and {{b|x}}, not {c} or {{Bad}}')).toEqual(['a', 'b']);
  });
});
