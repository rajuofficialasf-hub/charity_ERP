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
import {
  optionalIdentityOf,
  optionalIdentityQuestion,
  validate,
  type Answer,
  type FormField,
  type ValidateOptions,
} from './index.js';

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

describe('defaults and read-only questions', () => {
  const stored = (fields: FormField[], answers: Answer[], options: ValidateOptions = official) => {
    const result = validate(definitionWith(fields), [...coreAnswers(), ...answers], options);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return Object.fromEntries(result.answers.map((a) => [a.fieldKey, a.value]));
  };

  it('writes a read-only default itself, whatever the client sent', () => {
    const fields = [
      field('number_prefix', 'short_text', {
        settings: { default: { text: 'ASF-CBSRP-' }, read_only: true },
      }),
      field('approval_date', 'date', { settings: { default: { today: true }, read_only: true } }),
      field('fixed_amount', 'money', { settings: { default: { number: 500 }, read_only: true } }),
    ];
    const values = stored(fields, [
      answer('number_prefix', { t: 'short_text', v: 'changed' }),
      answer('approval_date', { t: 'date', v: '2020-01-01' }),
    ]);
    expect(values.number_prefix).toEqual({ t: 'short_text', v: 'ASF-CBSRP-' });
    expect(values.approval_date).toEqual({ t: 'date', v: TODAY });
    expect(values.fixed_amount).toEqual({ t: 'money', v: '500.00' });
  });

  it('keeps the date a read-only default was first given, on every later save', () => {
    const fields = [
      field('entry_date', 'date', { settings: { default: { today: true }, read_only: true } }),
    ];
    const definition = definitionWith(fields);
    const first = validate(definition, coreAnswers(), { ...official, today: '2026-10-01' });
    if (!first.ok) throw new Error('first save refused');
    const again = validate(definition, coreAnswers(), {
      ...official,
      today: '2026-10-26',
      previous: first.answers,
    });
    if (!again.ok) throw new Error('second save refused');
    expect(again.answers.find((a) => a.fieldKey === 'entry_date')!.value).toEqual({
      t: 'date',
      v: '2026-10-01',
    });
  });

  it('writes an office-only read-only default only for an official', () => {
    const definition = definitionWith(
      [],
      [
        section(
          'office',
          [
            field('approved_on', 'date', {
              settings: { default: { today: true }, read_only: true },
            }),
          ],
          { visibility: 'official_only' },
        ),
      ],
    );
    const by = (audience: ValidateOptions['audience']) => {
      const result = validate(definition, coreAnswers(), { ...official, audience });
      if (!result.ok) throw new Error(audience);
      return result.answers.some((a) => a.fieldKey === 'approved_on');
    };
    expect(by('volunteer')).toBe(false);
    expect(by('public')).toBe(false);
    expect(by('official')).toBe(true);
  });

  it('keeps an editable default as the filler sent it, and a cleared one cleared', () => {
    const fields = [field('visit_date', 'date', { settings: { default: { today: true } } })];
    expect(
      stored(fields, [answer('visit_date', { t: 'date', v: '2026-10-01' })]).visit_date,
    ).toEqual({
      t: 'date',
      v: '2026-10-01',
    });
    expect(stored(fields, []).visit_date).toBeUndefined();
  });

  it('never takes a read-only calculation from the client', () => {
    const fields = [
      field('a', 'number'),
      field('double', 'calculation', {
        calculation: { expr: { op: 'mul', args: [{ field: 'a' }, 2] } },
        settings: { read_only: true },
      }),
    ];
    const values = stored(fields, [
      answer('a', { t: 'number', v: 4 }),
      answer('double', { t: 'calculation', v: 999 }),
    ]);
    expect(values.double).toEqual({ t: 'calculation', v: 8 });
  });

  it('validates and stores an unchanged older definition as before', () => {
    const fields = [field('note_text', 'short_text'), field('count', 'number')];
    expect(
      stored(fields, [
        answer('note_text', { t: 'short_text', v: 'a' }),
        answer('count', { t: 'number', v: 2 }),
      ]),
    ).toMatchObject({ note_text: { t: 'short_text', v: 'a' }, count: { t: 'number', v: 2 } });
  });
});

describe('rows that follow a count', () => {
  const fields = [
    field('family_count', 'number', { settings: { validation: { min: 0, max: 20 } } }),
    field('members', 'repeat_group', { settings: { repeat: { count_from: 'family_count' } } }),
    field('member_name', 'short_text', {
      required: true,
      settings: { repeat: { group: 'members' } },
    }),
    field('member_income', 'money', { settings: { repeat: { group: 'members' } } }),
  ];
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => answer('member_name', { t: 'short_text', v: `m${i}` }, i));
  const count = (n: number) => answer('family_count', { t: 'number', v: n });

  it('holds as many rows as the count, asks each row’s required answers, and refuses one more', () => {
    expect(errorsOf(fields, [count(3), ...rows(3)])).toEqual([]);
    // a row left blank is still a row: its required name is asked for
    expect(errorsOf(fields, [count(3), ...rows(2)])).toEqual([
      ['member_name[2]', 'validation.required'],
    ]);
    expect(errorsOf(fields, [count(3), ...rows(4)])).toEqual([
      ['members', 'validation.repeat_rows_mismatch'],
    ]);
  });

  it('lets a draft hold rows that do not match the count, never more than the cap', () => {
    expect(errorsOf(fields, [count(5), ...rows(4)], { ...official, draft: true })).toEqual([]);
    expect(errorsOf(fields, [count(2), ...rows(51)], { ...official, draft: true })).toEqual([
      ['members', 'validation.rows_too_many'],
    ]);
  });
});

describe('a number table', () => {
  const livestock = field('livestock', 'number_table', {
    settings: {
      table: {
        rows: [
          { key: 'cow', label: { bn: 'গরু', en: 'Cow' } },
          { key: 'goat', label: { bn: 'ছাগল', en: 'Goat' } },
        ],
        cols: [
          { key: 'own', label: { bn: 'নিজের', en: 'Own' } },
          { key: 'shared', label: { bn: 'বর্গা', en: 'Sharecropped' } },
        ],
      },
    },
  });
  const table = (v: unknown) => answer('livestock', { t: 'number_table', v } as never);

  it('takes whole numbers in its own rows and columns, up to 1,000,000', () => {
    expect(
      errorsOf([livestock], [table({ cow: { own: 2, shared: 1 }, goat: { own: 0 } })]),
    ).toEqual([]);
    const result = validate(
      definitionWith([livestock]),
      [...coreAnswers(), table({ cow: { own: 1_000_000 } })],
      official,
    );
    expect(result.ok && result.answers.find((a) => a.fieldKey === 'livestock')!.value).toEqual({
      t: 'number_table',
      v: { cow: { own: 1_000_000 } },
    });
  });

  it('refuses a negative, a fraction, a cell above 1,000,000 and an unknown row or column', () => {
    for (const v of [
      { cow: { own: -1 } },
      { cow: { own: 1.5 } },
      { cow: { own: 1_000_001 } },
      { horse: { own: 1 } },
      { cow: { borrowed: 1 } },
      { constructor: { own: 1 } },
    ])
      expect(errorsOf([livestock], [table(v)]), JSON.stringify(v)).toEqual([
        ['livestock', 'validation.table_cell'],
      ]);
  });

  it('asks a required table to hold at least one number, and takes a table of zeros as answered', () => {
    expect(errorsOf([{ ...livestock, required: true }], [table({})])).toEqual([
      ['livestock', 'validation.required'],
    ]);
    // "no cows" is an answer
    expect(errorsOf([{ ...livestock, required: true }], [table({ cow: { own: 0 } })])).toEqual([]);
  });
});

describe('the identity questions a project lets stay empty', () => {
  const without = (...keys: string[]) => coreAnswers().filter((a) => !keys.includes(a.fieldKey));
  const replaced = (key: string, value: Answer['value']) => [...without(key), answer(key, value)];
  /** The errors of the core form alone, for the given answers. */
  const errors = (answers: Answer[], options: Partial<ValidateOptions> = {}) => {
    const result = validate(definitionWith(), answers, { ...official, ...options });
    return result.ok ? [] : result.errors.map((e) => [e.path, e.code]);
  };
  const BOTH = { optionalIdentity: { document: true, mobile: true } };

  it('requires both without the option, and with an option that names neither', () => {
    const missing = [
      ['nid_or_birth_reg', 'validation.required'],
      ['mobile', 'validation.required'],
    ];
    expect(errors(without('nid_or_birth_reg', 'mobile'))).toEqual(missing);
    expect(errors(without('nid_or_birth_reg', 'mobile'), { optionalIdentity: {} })).toEqual(
      missing,
    );
    expect(
      errors(without('nid_or_birth_reg', 'mobile'), {
        optionalIdentity: { document: false, mobile: false },
      }),
    ).toEqual(missing);
  });

  it('passes an empty document answer and an empty mobile answer, each by its own flag', () => {
    expect(errors(without('nid_or_birth_reg', 'mobile'), BOTH)).toEqual([]);
    expect(
      errors(without('nid_or_birth_reg', 'mobile'), { optionalIdentity: { document: true } }),
    ).toEqual([['mobile', 'validation.required']]);
    expect(
      errors(without('nid_or_birth_reg', 'mobile'), { optionalIdentity: { mobile: true } }),
    ).toEqual([['nid_or_birth_reg', 'validation.required']]);
    // a blank text is no answer
    expect(
      errors(
        [
          ...without('nid_or_birth_reg', 'mobile'),
          answer('nid_or_birth_reg', { t: 'short_text', v: '  ' }),
          answer('mobile', { t: 'phone', v: '' }),
        ],
        BOTH,
      ),
    ).toEqual([]);
  });

  it('stores no identity number and no mobile for the answers left empty', () => {
    const result = validate(definitionWith(), without('nid_or_birth_reg', 'mobile'), {
      ...official,
      ...BOTH,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const answered = result.answers.map((a) => a.fieldKey);
    expect(answered).not.toContain('nid_or_birth_reg');
    expect(answered).not.toContain('mobile');
    for (const column of ['nid', 'birth_reg', 'mobile'])
      expect(Object.keys(result.standard)).not.toContain(column);
    expect(result.standard).toMatchObject({ name: 'Rahima Khatun', village: 'Charpara' });
  });

  it('still checks a number and a mobile that are given, with the codes of a required question', () => {
    const badNumber = replaced('nid_or_birth_reg', { t: 'short_text', v: '12345' });
    const badMobile = replaced('mobile', { t: 'phone', v: '02712345678' });
    const wrongShape = replaced('mobile', { t: 'short_text', v: '01712345678' });
    for (const options of [{}, BOTH]) {
      expect(errors(badNumber, options)).toEqual([['nid_or_birth_reg', 'validation.nid_format']]);
      expect(errors(badMobile, options)).toEqual([['mobile', 'validation.mobile_format']]);
      expect(errors(wrongShape, options)).toEqual([['mobile', 'validation.value_shape']]);
    }
    // a good answer is kept as it is
    const result = validate(definitionWith(), coreAnswers(), { ...official, ...BOTH });
    expect(result.ok && result.standard).toMatchObject({
      nid: '1234567890',
      mobile: '01712345678',
    });
  });

  it('leaves every other required question required', () => {
    expect(errors(without('name', 'gender', 'address', 'village'), BOTH)).toEqual([
      ['name', 'validation.required'],
      ['gender', 'validation.required'],
      ['address', 'validation.required'],
      ['village', 'validation.required'],
    ]);
    const extra = [field('income', 'number', { required: true })];
    const result = validate(definitionWith(extra), without('nid_or_birth_reg', 'mobile'), {
      ...official,
      ...BOTH,
    });
    expect(result.ok ? [] : result.errors).toEqual([
      { path: 'income', code: 'validation.required' },
    ]);
  });

  it('finds the two questions by their standard column, under any key and never inside a group', () => {
    const renamed = definitionWith();
    for (const f of renamed.sections.flatMap((s) => s.fields)) {
      if (f.standardColumn === 'nid_or_birth_reg') f.fieldKey = 'id_number';
      if (f.standardColumn === 'mobile') f.fieldKey = 'phone_number';
    }
    const result = validate(renamed, without('nid_or_birth_reg', 'mobile'), {
      ...official,
      ...BOTH,
    });
    expect(result.ok ? [] : result.errors).toEqual([]);
    // a phone question that fills no profile column stays as the form made it
    expect(
      errorsOf([field('second_phone', 'phone', { required: true })], [], {
        ...official,
        ...BOTH,
      }),
    ).toEqual([['second_phone', 'validation.required']]);

    const both = { document: true, mobile: true };
    const document = { standardColumn: 'nid_or_birth_reg' };
    const mobile = { standardColumn: 'mobile' };
    expect(optionalIdentityQuestion(document, both)).toBe('document');
    expect(optionalIdentityQuestion(mobile, both)).toBe('mobile');
    expect(optionalIdentityQuestion(document, { mobile: true })).toBeNull();
    expect(optionalIdentityQuestion(mobile, { document: true })).toBeNull();
    expect(optionalIdentityQuestion(mobile, undefined)).toBeNull();
    expect(optionalIdentityQuestion({ standardColumn: 'name' }, both)).toBeNull();
    expect(optionalIdentityQuestion({ standardColumn: null }, both)).toBeNull();
    // a family member's number in a row of a group is not the applicant's
    expect(
      optionalIdentityQuestion({ ...mobile, settings: { repeat: { group: 'members' } } }, both),
    ).toBeNull();
  });

  it('builds the option from the rules of a project, and always asks the mobile of a public entry', () => {
    type Choice = 'required' | 'optional';
    const CASES: [Choice, Choice, boolean, boolean][] = [
      ['required', 'required', false, false],
      ['optional', 'required', true, false],
      ['required', 'optional', false, true],
      ['optional', 'optional', true, true],
    ];
    for (const [document, mobile, documentOptional, mobileOptional] of CASES) {
      for (const audience of ['volunteer', 'official'] as const)
        expect(optionalIdentityOf({ document, mobile }, audience), `${document}/${mobile}`).toEqual(
          { document: documentOptional, mobile: mobileOptional },
        );
      expect(optionalIdentityOf({ document, mobile }, 'public'), `${document}/${mobile}`).toEqual({
        document: documentOptional,
        mobile: false,
      });
    }
  });
});
