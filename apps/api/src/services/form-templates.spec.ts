import {
  checkDefinition,
  definitionFromTemplate,
  formDefinitionSchema,
  validate,
  type Answer,
  type FormDefinition,
  type LibraryOption,
  type TemplateSources,
} from '@css/shared/forms';
import { describe, expect, it } from 'vitest';
import { FORM_TEMPLATES, LIBRARY_FIELDS, SECTIONS } from '../../seed/sets/base/forms.js';
import { REFERENCE_LISTS } from '../../seed/sets/base/reference-lists.js';

// The two seeded application forms of the current forms (docs/MASTER_SPEC.md, "Appendix B — Current
// form fields and mapping to the new system"), built through the engine with the seeded reference
// lists: valid definitions whose calculations give the blueprint's numbers.
const sources: TemplateSources = {
  libraryFields: LIBRARY_FIELDS,
  librarySections: SECTIONS,
  resolveList: (listKey): LibraryOption[] =>
    (Object.hasOwn(REFERENCE_LISTS, listKey) ? REFERENCE_LISTS[listKey]! : []).map(
      ([code, bn, en]) => ({ code, label_bn: bn, label_en: en }),
    ),
};
const templateOf = (key: string) => FORM_TEMPLATES.find((t) => t.key === key)!.definition.form;
const distribution = () => definitionFromTemplate(templateOf('form_distribution'), sources);
const selfReliance = () =>
  definitionFromTemplate(templateOf('form_self_reliance_construction'), sources);

const DIVISION = '0190a1b2-c3d4-7e5f-8a9b-000000000001';
const DISTRICT = '0190a1b2-c3d4-7e5f-8a9b-000000000002';
const UPAZILA = '0190a1b2-c3d4-7e5f-8a9b-000000000003';
const UNION = '0190a1b2-c3d4-7e5f-8a9b-000000000004';
const TODAY = '2026-10-21';

const text = (fieldKey: string, v: string): Answer => ({ fieldKey, value: { t: 'short_text', v } });
const money = (fieldKey: string, v: string, repeatIndex?: number): Answer =>
  repeatIndex === undefined
    ? { fieldKey, value: { t: 'money', v } }
    : { fieldKey, repeatIndex, value: { t: 'money', v } };
const number = (fieldKey: string, v: number): Answer => ({ fieldKey, value: { t: 'number', v } });
const decimal = (fieldKey: string, v: number): Answer => ({ fieldKey, value: { t: 'decimal', v } });
const radio = (fieldKey: string, v: string): Answer => ({ fieldKey, value: { t: 'radio', v } });
const select = (fieldKey: string, v: string): Answer => ({
  fieldKey,
  value: { t: 'single_select', v },
});

const core: Answer[] = [
  text('nid_or_birth_reg', '1234567890'),
  { fieldKey: 'mobile', value: { t: 'phone', v: '01712345678' } },
  text('name', 'রহিমা খাতুন'),
  text('father_or_husband_name', 'আব্দুল করিম'),
  select('gender', 'female'),
  {
    fieldKey: 'address',
    value: {
      t: 'bd_address',
      division_id: DIVISION,
      district_id: DISTRICT,
      upazila_id: UPAZILA,
      union_id: UNION,
    },
  },
  text('village', 'চরপাড়া'),
];

function computedOf(definition: FormDefinition, answers: Answer[], nisabValue?: string) {
  const result = validate(definition, answers, { audience: 'official', today: TODAY, nisabValue });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
}

describe('the seeded forms', () => {
  it('both build into valid definitions with the core and the beneficiary types of the reference list', () => {
    for (const definition of [distribution(), selfReliance()]) {
      expect(checkDefinition(definition)).toEqual([]);
      expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
    }
    const classField = distribution()
      .sections.flatMap((s) => s.fields)
      .find((f) => f.fieldKey === 'beneficiary_class')!;
    expect(classField.options?.map((o) => o.code)).toEqual([
      'elderly',
      'widow',
      'orphan',
      'disabled',
      'ill',
      'labourer',
      'extreme_poor',
      'other',
    ]);
    expect(classField.options?.find((o) => o.code === 'other')?.allowsOtherText).toBe(true);
    expect(selfReliance().sections[0]).toMatchObject({
      key: 'official',
      visibility: 'official_only',
    });
  });

  it('counts 5 household members from 3 aged 14 or more and 2 children', () => {
    const result = computedOf(distribution(), [
      ...core,
      number('members_14_plus', 3),
      number('children_under_14', 2),
    ]);
    expect(result.computed).toEqual({ total_members: 5 });
    expect(result.standard).toMatchObject({ members_14_plus: 3, children_under_14: 2 });
    expect(result.custom.map((a) => a.fieldKey)).toContain('total_members');
  });

  it('sums the household income across the beneficiary and two earners', () => {
    const result = computedOf(selfReliance(), [
      ...core,
      money('monthly_income', '5000.00'),
      radio('has_multiple_earners', 'yes'),
      text('earner_name', 'করিম'),
      money('earner_monthly_income', '3000.00', 0),
      { fieldKey: 'earner_name', repeatIndex: 1, value: { t: 'short_text', v: 'সালমা' } },
      money('earner_monthly_income', '2500.50', 1),
    ]);
    expect(result.computed.household_income_total).toBe('10500.50');
    expect(result.familyMembers).toEqual([
      {
        group: 'earners',
        repeatIndex: 0,
        columns: { name: 'করিম', monthly_income: '3000.00' },
        isEarner: true,
      },
      {
        group: 'earners',
        repeatIndex: 1,
        columns: { name: 'সালমা', monthly_income: '2500.50' },
        isEarner: true,
      },
    ]);
  });

  it('values gold and silver by amount times the price per ana', () => {
    const result = computedOf(selfReliance(), [
      ...core,
      decimal('gold_amount', 2.5),
      money('gold_price_per_ana', '7000.00'),
      decimal('silver_amount', 10),
      money('silver_price_per_ana', '100.00'),
    ]);
    expect(result.computed).toMatchObject({ gold_value: '17500.00', silver_value: '1000.00' });
  });

  it('totals the assets and the debts, nets them and proposes the zakat status against the nisab', () => {
    const answers = [
      ...core,
      money('zakat_cash', '1000.00'),
      money('zakat_bank_deposit', '2000.00'),
      decimal('gold_amount', 2.5),
      money('gold_price_per_ana', '7000.00'),
      decimal('silver_amount', 10),
      money('silver_price_per_ana', '100.00'),
      money('zakat_savings_certificates', '500.00'),
      money('zakat_stock_goods', '300.00'),
      money('zakat_receivables', '200.00'),
      money('zakat_rent_crop_income', '100.00'),
      money('zakat_land_for_sale', '50000.00'),
      money('zakat_security_deposit', '400.00'),
      money('zakat_debts', '3000.00'),
      radio('has_loan', 'yes'),
      money('loan_total', '2000.00'),
    ];
    const below = computedOf(selfReliance(), answers, '70000.00');
    expect(below.computed).toMatchObject({
      zakat_total_assets: '73000.00',
      zakat_total_debts: '5000.00',
      zakat_net_assets: '68000.00',
      zakat_status_suggestion: false,
    });
    const atNisab = computedOf(selfReliance(), answers, '68000.00');
    expect(atNisab.computed.zakat_status_suggestion).toBe(true);
    const without = computedOf(selfReliance(), answers);
    expect(without.computed.zakat_status_suggestion).toBeUndefined();
    // a loan hidden behind "no" counts for nothing in the debts
    const noLoan = computedOf(
      selfReliance(),
      [...answers.slice(0, -2), radio('has_loan', 'no')],
      '70000.00',
    );
    expect(noLoan.computed.zakat_total_debts).toBe('3000.00');
  });

  it('sends the name and the address to the profile and a project question to the answers', () => {
    const result = computedOf(selfReliance(), [...core, radio('prior_business', 'no')]);
    expect(result.standard).toMatchObject({
      nid: '1234567890',
      name: 'রহিমা খাতুন',
      division_id: DIVISION,
      union_id: UNION,
      village: 'চরপাড়া',
    });
    expect(result.standard).not.toHaveProperty('prior_business');
    expect(result.custom).toContainEqual({
      fieldKey: 'prior_business',
      repeatIndex: 0,
      value: { t: 'radio', v: 'no' },
    });
  });

  it('refuses a volunteer answer for the official section and a village in Latin letters', () => {
    const result = validate(
      selfReliance(),
      [
        ...core.filter((a) => a.fieldKey !== 'village'),
        text('village', 'Charpara'),
        text('official_comment', 'x'),
      ],
      { audience: 'volunteer', today: TODAY },
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((e) => [e.path, e.code])).toEqual([
        ['official_comment', 'form.official_only_field'],
        ['village', 'validation.bangla_text'],
      ]);
  });
});

describe('whose number the mobile is, in the seeded forms', () => {
  const keysOf = (definition: FormDefinition) =>
    definition.sections.flatMap((section) => section.fields).map((field) => field.fieldKey);
  const standardOf = (answers: Answer[]) =>
    computedOf(distribution(), [...core, ...answers]).standard;

  it('stands right after the mobile question in both forms, optional, with the list’s options and no identity mark', () => {
    for (const definition of [distribution(), selfReliance()]) {
      const keys = keysOf(definition);
      const at = keys.indexOf('mobile');
      expect(keys.slice(at, at + 3)).toEqual(['mobile', 'mobile_owner', 'mobile_owner_name']);
      const fields = definition.sections.flatMap((section) => section.fields);
      const owner = fields.find((field) => field.fieldKey === 'mobile_owner')!;
      const ownerName = fields.find((field) => field.fieldKey === 'mobile_owner_name')!;
      expect(owner).toMatchObject({
        type: 'single_select',
        required: false,
        standardColumn: 'mobile_owner_code',
        label: { bn: 'নম্বরটি কার?', en: 'Whose number is it?' },
        logic: { show_if: { field: 'mobile', op: 'not_empty' } },
      });
      expect(owner.options?.map((o) => o.code)).toEqual(['own', 'family', 'neighbour', 'other']);
      expect(ownerName).toMatchObject({
        type: 'short_text',
        required: false,
        standardColumn: 'mobile_owner_name',
        label: { bn: 'যাঁর নম্বর, তাঁর নাম', en: "Name of the number's owner" },
        logic: { show_if: { field: 'mobile_owner', op: 'neq', value: 'own' } },
        settings: { validation: { max_length: 200 } },
      });
      expect(
        checkDefinition(definition, { publishing: true, kind: 'beneficiary_application' }),
      ).toEqual([]);
    }
  });

  it('takes the owner and the owner’s name of a number that is someone else’s', () => {
    expect(
      standardOf([select('mobile_owner', 'neighbour'), text('mobile_owner_name', 'করিম মিয়া')]),
    ).toMatchObject({ mobile_owner_code: 'neighbour', mobile_owner_name: 'করিম মিয়া' });
  });

  it('drops the owner’s name of the person’s own number, and both without a mobile', () => {
    const own = standardOf([
      select('mobile_owner', 'own'),
      text('mobile_owner_name', 'করিম মিয়া'),
    ]);
    expect(own).toMatchObject({ mobile_owner_code: 'own' });
    expect(Object.keys(own)).not.toContain('mobile_owner_name');
    // the name is not asked before the owner is answered either
    expect(Object.keys(standardOf([text('mobile_owner_name', 'করিম মিয়া')]))).not.toContain(
      'mobile_owner_name',
    );
    const withoutMobile = validate(
      distribution(),
      [
        ...core.filter((a) => a.fieldKey !== 'mobile'),
        select('mobile_owner', 'neighbour'),
        text('mobile_owner_name', 'করিম মিয়া'),
      ],
      { audience: 'official', today: TODAY, optionalIdentity: { mobile: true } },
    );
    expect(withoutMobile.ok).toBe(true);
    if (!withoutMobile.ok) return;
    for (const column of ['mobile', 'mobile_owner_code', 'mobile_owner_name'])
      expect(Object.keys(withoutMobile.standard)).not.toContain(column);
  });

  it('refuses an owner the list does not hold', () => {
    const result = validate(distribution(), [...core, select('mobile_owner', 'landlord')], {
      audience: 'official',
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((e) => [e.path, e.code])).toEqual([
        ['mobile_owner', 'validation.option_unknown'],
      ]);
  });
});

describe('whether the name is the father’s or the husband’s, in the seeded forms', () => {
  const fieldsOf = (definition: FormDefinition) =>
    definition.sections.flatMap((section) => section.fields);

  it('stands right after the father’s or husband’s name in both forms, optional, with the list’s options and no identity mark', () => {
    for (const definition of [distribution(), selfReliance()]) {
      const keys = fieldsOf(definition).map((field) => field.fieldKey);
      const at = keys.indexOf('father_or_husband_name');
      expect(keys.slice(at, at + 2)).toEqual(['father_or_husband_name', 'guardian_relation']);
      const relation = fieldsOf(definition).find((f) => f.fieldKey === 'guardian_relation')!;
      expect(relation).toMatchObject({
        type: 'single_select',
        required: false,
        standardColumn: 'guardian_relation_code',
        label: {
          bn: 'এটি পিতার নাম নাকি স্বামীর নাম?',
          en: "Is this the father's or the husband's name?",
        },
      });
      expect(relation.logic?.show_if).toBeUndefined();
      expect(relation.options?.map((o) => o.code)).toEqual(['father', 'husband']);
      expect(
        checkDefinition(definition, { publishing: true, kind: 'beneficiary_application' }),
      ).toEqual([]);
    }
  });

  it('sends the answer to its profile column, and refuses a code the list does not hold', () => {
    expect(
      computedOf(distribution(), [...core, select('guardian_relation', 'husband')]).standard,
    ).toMatchObject({ guardian_relation_code: 'husband' });
    const result = validate(distribution(), [...core, select('guardian_relation', 'brother')], {
      audience: 'official',
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((e) => [e.path, e.code])).toEqual([
        ['guardian_relation', 'validation.option_unknown'],
      ]);
  });
});
