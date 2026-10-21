import { describe, expect, it } from 'vitest';
import {
  coreAnswers,
  definitionWith,
  DISTRICT,
  DIVISION,
  field,
  FILE_ID,
  option,
  section,
  TODAY,
  UNION,
  UPAZILA,
  yesNo,
} from '../../test/forms-fixture.js';
import { validate, type Answer, type FormField, type ValidateOptions } from './index.js';

// The validator: the value shape of every type, required only while visible, the limits and the
// patterns, options and the "other" text, repeat rows, the address, and the audiences.
const official: ValidateOptions = { audience: 'official', today: TODAY };
const answer = (fieldKey: string, value: Answer['value'], repeatIndex?: number): Answer =>
  repeatIndex === undefined ? { fieldKey, value } : { fieldKey, repeatIndex, value };

/** The errors of validating the core plus the given answers against the core plus the given fields. */
function errorsOf(fields: FormField[], answers: Answer[], options: ValidateOptions = official) {
  const result = validate(definitionWith(fields), [...coreAnswers(), ...answers], options);
  return result.ok ? [] : result.errors.map((e) => [e.path, e.code]);
}

describe('the value shape of every field type', () => {
  const good: [FormField['type'], Answer['value']][] = [
    ['short_text', { t: 'short_text', v: 'a' }],
    ['long_text', { t: 'long_text', v: 'a' }],
    ['number', { t: 'number', v: 3 }],
    ['decimal', { t: 'decimal', v: 2.5 }],
    ['money', { t: 'money', v: '1500.50' }],
    ['phone', { t: 'phone', v: '01712345678' }],
    ['email', { t: 'email', v: 'a@example.com' }],
    ['date', { t: 'date', v: '2026-10-21' }],
    ['time', { t: 'time', v: '16:40' }],
    ['datetime', { t: 'datetime', v: '2026-10-21T16:40:00+06:00' }],
    ['single_select', { t: 'single_select', v: 'a' }],
    ['multi_select', { t: 'multi_select', v: ['a'] }],
    ['radio', { t: 'radio', v: 'a' }],
    ['checkbox', { t: 'checkbox', v: ['a'] }],
    ['photo', { t: 'photo', v: [FILE_ID] }],
    ['file', { t: 'file', v: [FILE_ID] }],
    ['signature', { t: 'signature', v: [FILE_ID] }],
    ['gps', { t: 'gps', lat: 23.8, lng: 90.4, accuracy_m: 12 }],
    [
      'bd_address',
      {
        t: 'bd_address',
        division_id: DIVISION,
        district_id: DISTRICT,
        upazila_id: UPAZILA,
        union_id: UNION,
      },
    ],
  ];
  const withOptions = (type: FormField['type']) =>
    field('x', type, {
      ...(['single_select', 'multi_select', 'radio', 'checkbox'].includes(type)
        ? { options: [option('a')] }
        : {}),
    });

  it.each(good)('accepts a %s answer in its own branch', (type, value) => {
    expect(errorsOf([withOptions(type)], [answer('x', value)])).toEqual([]);
  });

  it.each(good)('refuses a %s answer in another branch', (type, value) => {
    const other = good.find(([t]) => t !== type)![1];
    expect(errorsOf([withOptions(type)], [answer('x', other)])).toEqual([
      ['x', 'validation.value_shape'],
    ]);
    expect(
      errorsOf([withOptions(type)], [answer('x', { ...value, t: 'calculation' } as never)]),
    ).toEqual([['x', 'validation.value_shape']]);
  });

  it('refuses file ids on a field that takes no files', () => {
    expect(
      errorsOf([field('x', 'short_text')], [answer('x', { t: 'photo', v: [FILE_ID] })]),
    ).toEqual([['x', 'validation.value_shape']]);
  });

  it('refuses a fraction on a whole-number field', () => {
    expect(errorsOf([field('x', 'number')], [answer('x', { t: 'number', v: 2.5 })])).toEqual([
      ['x', 'validation.whole_number'],
    ]);
  });
});

describe('required', () => {
  it('requires a visible required field and a filled core', () => {
    const result = validate(definitionWith(), coreAnswers().slice(0, 5), official);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toEqual([
        { path: 'address', code: 'validation.required' },
        { path: 'village', code: 'validation.required' },
      ]);
  });

  it('treats a blank text, an empty list and a missing answer alike', () => {
    const fields = [
      field('t', 'short_text', { required: true }),
      field('m', 'multi_select', { required: true, options: [option('a')] }),
    ];
    expect(
      errorsOf(fields, [
        answer('t', { t: 'short_text', v: '  ' }),
        answer('m', { t: 'multi_select', v: [] }),
      ]),
    ).toEqual([
      ['t', 'validation.required'],
      ['m', 'validation.required'],
    ]);
  });

  it('never requires a hidden field and drops its answer', () => {
    const fields = [
      yesNo('has_loan'),
      field('loan_total', 'money', {
        required: true,
        logic: { show_if: { field: 'has_loan', op: 'eq', value: 'yes' } },
      }),
    ];
    const definition = definitionWith(fields);
    const no = answer('has_loan', { t: 'radio', v: 'no' });
    expect(errorsOf(fields, [no])).toEqual([]);
    const result = validate(
      definition,
      [...coreAnswers(), no, answer('loan_total', { t: 'money', v: '5.00' })],
      official,
    );
    expect(result.ok && result.answers.map((a) => a.fieldKey)).not.toContain('loan_total');
    expect(errorsOf(fields, [answer('has_loan', { t: 'radio', v: 'yes' })])).toEqual([
      ['loan_total', 'validation.required'],
    ]);
  });

  it('honours a required-if', () => {
    const fields = [
      yesNo('has_loan'),
      field('purpose', 'short_text', {
        logic: { required_if: { field: 'has_loan', op: 'eq', value: 'yes' } },
      }),
    ];
    expect(errorsOf(fields, [answer('has_loan', { t: 'radio', v: 'yes' })])).toEqual([
      ['purpose', 'validation.required'],
    ]);
    expect(errorsOf(fields, [answer('has_loan', { t: 'radio', v: 'no' })])).toEqual([]);
  });
});

describe('limits and patterns', () => {
  it('checks the length of a text against the field cap', () => {
    const fields = [
      field('t', 'short_text', { settings: { validation: { min_length: 3, max_length: 5 } } }),
    ];
    expect(errorsOf(fields, [answer('t', { t: 'short_text', v: 'ab' })])).toEqual([
      ['t', 'validation.too_short'],
    ]);
    expect(errorsOf(fields, [answer('t', { t: 'short_text', v: 'abcdef' })])).toEqual([
      ['t', 'validation.too_long'],
    ]);
    expect(errorsOf(fields, [answer('t', { t: 'short_text', v: 'abcde' })])).toEqual([]);
  });

  it('refuses a text over 4,000 characters for every audience, before any pattern runs', () => {
    const fields = [field('t', 'long_text', { settings: { validation: { pattern: 'digits' } } })];
    const long = answer('t', { t: 'long_text', v: '1'.repeat(4001) });
    expect(errorsOf(fields, [long])).toEqual([['t', 'validation.too_long']]);
    expect(errorsOf(fields, [long], { audience: 'public', today: TODAY })).toEqual([
      ['t', 'validation.too_long'],
    ]);
    expect(errorsOf(fields, [answer('t', { t: 'long_text', v: '1'.repeat(4000) })])).toEqual([]);
  });

  it('checks min and max of a number, a decimal and an amount', () => {
    const fields = [
      field('n', 'number', { settings: { validation: { min: 0, max: 120 } } }),
      field('m', 'money', { settings: { validation: { min: 100, max: 1000.5 } } }),
    ];
    expect(
      errorsOf(fields, [
        answer('n', { t: 'number', v: 121 }),
        answer('m', { t: 'money', v: '99.99' }),
      ]),
    ).toEqual([
      ['n', 'validation.out_of_range'],
      ['m', 'validation.out_of_range'],
    ]);
    expect(
      errorsOf(fields, [
        answer('n', { t: 'number', v: 120 }),
        answer('m', { t: 'money', v: '1000.50' }),
      ]),
    ).toEqual([]);
  });

  it('applies every named pattern with its own message key, or the one the field names', () => {
    const cases: [string, string, string, string][] = [
      ['nid', '1000000001', '12345', 'validation.nid_format'],
      ['birth_reg', '20261011000000001', '1000000001', 'validation.birth_reg_format'],
      ['mobile', '01712345678', '02712345678', 'validation.mobile_format'],
      ['bangla_text', 'চরপাড়া', 'Charpara', 'validation.bangla_text'],
      ['email', 'a@example.com', 'a@b', 'validation.email_format'],
      ['post_code', '1200', '12000', 'validation.post_code_format'],
      ['digits', '007', '7a', 'validation.digits_only'],
    ];
    for (const [pattern, good, bad, code] of cases) {
      const fields = [
        field('t', 'short_text', { settings: { validation: { pattern: pattern as never } } }),
      ];
      expect(errorsOf(fields, [answer('t', { t: 'short_text', v: good })]), pattern).toEqual([]);
      expect(errorsOf(fields, [answer('t', { t: 'short_text', v: bad })]), pattern).toEqual([
        ['t', code],
      ]);
    }
    const named = [
      field('t', 'short_text', {
        settings: { validation: { pattern: 'digits', message_key: 'validation.job_id_format' } },
      }),
    ];
    expect(errorsOf(named, [answer('t', { t: 'short_text', v: 'x' })])).toEqual([
      ['t', 'validation.job_id_format'],
    ]);
  });

  it('checks an email field and a phone field by their type when no pattern is named', () => {
    const fields = [field('e', 'email'), field('p', 'phone')];
    expect(
      errorsOf(fields, [
        answer('e', { t: 'email', v: 'nope' }),
        answer('p', { t: 'phone', v: '123' }),
      ]),
    ).toEqual([
      ['e', 'validation.email_format'],
      ['p', 'validation.mobile_format'],
    ]);
  });
});

describe('options', () => {
  const kind = field('kind', 'radio', { options: [option('a'), option('b')] });
  const sub = field('sub', 'single_select', {
    logic: { options_depend_on: 'kind' },
    options: [
      option('x', { dependsOnOptionCode: 'a' }),
      option('y', { dependsOnOptionCode: 'b' }),
      option('other', { allowsOtherText: true }),
    ],
  });

  it('accepts an option of the list and refuses one outside it', () => {
    expect(errorsOf([kind], [answer('kind', { t: 'radio', v: 'c' })])).toEqual([
      ['kind', 'validation.option_unknown'],
    ]);
    expect(errorsOf([kind], [answer('kind', { t: 'radio', v: 'a' })])).toEqual([]);
    const multi = field('m', 'checkbox', { options: [option('a'), option('b')] });
    expect(errorsOf([multi], [answer('m', { t: 'checkbox', v: ['a', 'c'] })])).toEqual([
      ['m', 'validation.option_unknown'],
    ]);
  });

  it('accepts a branching option only while the previous answer offers it', () => {
    const a = answer('kind', { t: 'radio', v: 'a' });
    expect(errorsOf([kind, sub], [a, answer('sub', { t: 'single_select', v: 'x' })])).toEqual([]);
    expect(errorsOf([kind, sub], [a, answer('sub', { t: 'single_select', v: 'y' })])).toEqual([
      ['sub', 'validation.option_unknown'],
    ]);
    expect(errorsOf([kind, sub], [answer('sub', { t: 'single_select', v: 'other' })])).toEqual([]);
  });

  it('takes the other text only on an option that opens it', () => {
    const a = answer('kind', { t: 'radio', v: 'a' });
    expect(
      errorsOf(
        [kind, sub],
        [a, answer('sub', { t: 'single_select', v: 'other', other: 'tailoring' })],
      ),
    ).toEqual([]);
    expect(
      errorsOf([kind, sub], [a, answer('sub', { t: 'single_select', v: 'x', other: 'tailoring' })]),
    ).toEqual([['sub', 'validation.other_text_not_allowed']]);
  });
});

describe('repeat rows', () => {
  const group = (overrides: Partial<FormField> = {}) => [
    field('earners', 'repeat_group', overrides),
    field('earner_name', 'short_text', {
      required: true,
      settings: { repeat: { group: 'earners' } },
    }),
    field('earner_income', 'money', { settings: { repeat: { group: 'earners' } } }),
  ];
  const row = (i: number, name = `earner ${i}`) =>
    answer('earner_name', { t: 'short_text', v: name }, i);

  it('refuses rows below the minimum and above the maximum', () => {
    const fields = group({ settings: { repeat: { min_rows: 2, max_rows: 3 } } });
    expect(errorsOf(fields, [row(0)])).toEqual([['earners', 'validation.rows_too_few']]);
    expect(errorsOf(fields, [row(0), row(1), row(2), row(3)])).toEqual([
      ['earners', 'validation.rows_too_many'],
    ]);
    expect(errorsOf(fields, [row(0), row(1)])).toEqual([]);
  });

  it('requires at least one row of a required group and the required fields of every row', () => {
    expect(errorsOf(group({ required: true }), [])).toEqual([['earners', 'validation.required']]);
    expect(
      errorsOf(group(), [row(0), answer('earner_income', { t: 'money', v: '5.00' }, 1)]),
    ).toEqual([['earner_name[1]', 'validation.required']]);
  });

  it('caps the public at 50 rows where the definition sets no limit', () => {
    const rows = Array.from({ length: 51 }, (_, i) => row(i));
    expect(errorsOf(group(), rows, { audience: 'public', today: TODAY })).toEqual([
      ['earners', 'validation.rows_too_many'],
    ]);
    expect(errorsOf(group(), rows)).toEqual([]);
    expect(errorsOf(group(), rows.slice(0, 50), { audience: 'public', today: TODAY })).toEqual([]);
  });

  it('refuses a row on a field outside any group', () => {
    expect(
      errorsOf([field('t', 'short_text')], [answer('t', { t: 'short_text', v: 'x' }, 1)]),
    ).toEqual([['t', 'form.unexpected_answer']]);
  });
});

describe('the address', () => {
  it('fails an address missing a level and passes a complete one', () => {
    const answers = coreAnswers().filter((a) => a.fieldKey !== 'address');
    const partial = {
      t: 'bd_address',
      division_id: DIVISION,
      district_id: DISTRICT,
      upazila_id: UPAZILA,
    };
    const result = validate(
      definitionWith(),
      [...answers, { fieldKey: 'address', value: partial as never }],
      official,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toEqual([
        { path: 'address', code: 'validation.address_incomplete', params: { missing: 'union_id' } },
      ]);
    expect(validate(definitionWith(), coreAnswers(), official).ok).toBe(true);
  });
});

describe('what the client may send', () => {
  it('replaces a calculated answer the client sent with the recomputed value', () => {
    const fields = [
      field('a', 'number'),
      field('b', 'number'),
      field('total', 'calculation', {
        calculation: { expr: { op: 'add', args: [{ field: 'a' }, { field: 'b' }] } },
      }),
    ];
    const answers = [
      ...coreAnswers(),
      answer('a', { t: 'number', v: 3 }),
      answer('b', { t: 'number', v: 2 }),
      answer('total', { t: 'calculation', v: 999 }),
    ];
    const result = validate(definitionWith(fields), answers, official);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.computed).toEqual({ total: 5 });
      expect(result.answers.filter((a) => a.fieldKey === 'total')).toEqual([
        { fieldKey: 'total', repeatIndex: 0, value: { t: 'calculation', v: 5 } },
      ]);
    }
  });

  it('refuses an unknown field key, a note answer, a duplicate and a malformed item', () => {
    const fields = [field('info', 'note')];
    const result = validate(
      definitionWith(fields),
      [
        ...coreAnswers(),
        answer('nope', { t: 'short_text', v: 'x' }),
        answer('info', { t: 'short_text', v: 'x' }),
        answer('name', { t: 'short_text', v: 'again' }),
        { fieldKey: 'name' },
        'junk',
      ],
      official,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((e) => [e.path, e.code])).toEqual([
        ['nope', 'form.unknown_field'],
        ['info', 'form.unexpected_answer'],
        ['name', 'form.duplicate_answer'],
        ['name', 'validation.malformed'],
        ['', 'validation.malformed'],
      ]);
  });

  it('refuses an official-only answer from a volunteer or the public, and takes it from an official', () => {
    const definition = definitionWith(
      [],
      [section('official', [field('comment', 'long_text')], { visibility: 'official_only' })],
    );
    const answers = [...coreAnswers(), answer('comment', { t: 'long_text', v: 'fine' })];
    for (const audience of ['volunteer', 'public'] as const) {
      const result = validate(definition, answers, { audience, today: TODAY });
      expect(result.ok, audience).toBe(false);
      if (!result.ok)
        expect(result.errors).toEqual([{ path: 'comment', code: 'form.official_only_field' }]);
    }
    expect(validate(definition, answers, official).ok).toBe(true);
  });

  it('answers with the clean answers, the computed values and the split', () => {
    const result = validate(
      definitionWith([yesNo('q')]),
      [...coreAnswers(), answer('q', { t: 'radio', v: 'yes' })],
      official,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.standard).toMatchObject({
        name: 'Rahima Khatun',
        village: 'Charpara',
        union_id: UNION,
      });
      expect(result.custom).toEqual([
        { fieldKey: 'q', repeatIndex: 0, value: { t: 'radio', v: 'yes' } },
      ]);
      expect(result.familyMembers).toEqual([]);
      expect(result.answers).toHaveLength(8);
    }
  });
});
