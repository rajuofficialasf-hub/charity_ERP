import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  answerValueSchema,
  calculationSchema,
  componentSettingsSchema,
  componentSettingsSchemas,
  conditionSchema,
  distributionItemsSchema,
  fieldLogicSchema,
  fieldSettingsSchema,
  followupAnswersSchema,
  handoverScopeSchema,
  jsonbSchemas,
  mediaScriptSchema,
  referenceListAttributesSchema,
  ratingScoresSchema,
  scoreCriteriaSchema,
  userPreferencesSchema,
  workflowDefinitionSchema,
} from '../src/jsonb/index.js';

// The zod schemas mirror the JSON Schemas in docs/database/json-schemas/ (DATABASE_SCHEMA
// section 20, D-055). Every sample must get the same verdict from both, and the expected one.
const docs = join(__dirname, '../../../docs');
const schemaDir = join(docs, 'database/json-schemas');
const templatesDir = join(docs, 'architecture/workflow-templates');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const templateSchema = read(join(templatesDir, 'schema.json'));
ajv.addSchema({
  ...templateSchema,
  $id: 'https://css-erp.assunnahfoundation.org/architecture/workflow-templates/schema.json',
});
for (const file of readdirSync(schemaDir)) ajv.addSchema(read(join(schemaDir, file)));
const docSchema = (name: string, fragment = '') => {
  const validate = ajv.getSchema(
    `https://css-erp.assunnahfoundation.org/schemas/${name}.json${fragment}`,
  );
  if (!validate) throw new Error(`schema ${name}${fragment} not found`);
  return validate;
};

const U = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';
type Case = [label: string, value: unknown, valid: boolean];

function conform(schemaName: string, fragment: string, zodSchema: z.ZodType, cases: Case[]) {
  describe(`${schemaName}${fragment}`, () => {
    it.each(cases)('%s', (_label, value, valid) => {
      const ajvVerdict = docSchema(schemaName, fragment)(value) as boolean;
      const zodVerdict = zodSchema.safeParse(value).success;
      expect({ ajv: ajvVerdict, zod: zodVerdict }).toEqual({ ajv: valid, zod: valid });
    });
  });
}

conform('application-answer-value', '', answerValueSchema, [
  ['short text', { t: 'short_text', v: 'রহিমা খাতুন' }, true],
  ['number table', { t: 'number_table', v: { cow: { own: 2, shared: 1 } } }, true],
  ['number table with a text cell', { t: 'number_table', v: { cow: { own: 'two' } } }, false],
  ['number', { t: 'number', v: 5 }, true],
  ['money as decimal string', { t: 'money', v: '1500.50' }, true],
  ['money with three decimals', { t: 'money', v: '1.505' }, false],
  ['date', { t: 'date', v: '2026-10-11' }, true],
  ['bad date', { t: 'date', v: '11/10/2026' }, false],
  ['time', { t: 'time', v: '16:40' }, true],
  ['datetime with offset', { t: 'datetime', v: '2026-10-11T16:40:00+06:00' }, true],
  ['single choice with other text', { t: 'radio', v: 'other', other: 'নিজের লেখা' }, true],
  ['multi choice', { t: 'checkbox', v: ['a', 'b'] }, true],
  ['multi choice with duplicates', { t: 'checkbox', v: ['a', 'a'] }, false],
  ['photo ids', { t: 'photo', v: [U] }, true],
  ['photo with a bad id', { t: 'photo', v: ['x'] }, false],
  ['gps', { t: 'gps', lat: 23.8, lng: 90.4, accuracy_m: 12 }, true],
  ['gps out of range', { t: 'gps', lat: 123, lng: 90 }, false],
  [
    'address',
    {
      t: 'bd_address',
      division_id: U,
      district_id: U,
      upazila_id: U,
      union_id: U,
      village: 'গ্রাম',
    },
    true,
  ],
  [
    'address without union',
    { t: 'bd_address', division_id: U, district_id: U, upazila_id: U },
    false,
  ],
  ['calculation', { t: 'calculation', v: true }, true],
  ['unknown type', { t: 'colour', v: 'red' }, false],
  ['extra property', { t: 'number', v: 1, extra: 1 }, false],
]);

conform('application-score-criteria', '', scoreCriteriaSchema, [
  [
    'valid',
    {
      scoring_version: 'v1',
      items: [{ key: 'income', max_points: 40, points: 30, input: 3000 }],
      total: 30,
    },
    true,
  ],
  [
    'points above 100',
    { scoring_version: 'v1', items: [{ key: 'income', max_points: 40, points: 130 }], total: 30 },
    false,
  ],
  ['missing total', { scoring_version: 'v1', items: [] }, false],
]);

conform('distribution-items', '', distributionItemsSchema, [
  [
    'partial package',
    {
      items: [
        { code: 'blanket', quantity: 2, received: true },
        { code: 'shawl', received: false },
      ],
    },
    true,
  ],
  ['quantity zero', { items: [{ code: 'blanket', quantity: 0, received: true }] }, false],
]);

conform('followup-answers', '', followupAnswersSchema, [
  [
    'O-23 answers',
    { business_started: true, current_income: 4500, main_problem: 'পুঁজি কম' },
    true,
  ],
  ['bad key', { 'Bad Key': true }, false],
  ['object value', { profit: { amount: 1 } }, false],
]);

conform('media-work-script', '', mediaScriptSchema, [
  [
    'the parts',
    { summary: 'একজন মায়ের গল্প', questions: 'কীভাবে শুরু করলেন?', voiceOver: '' },
    true,
  ],
  ['empty', {}, true],
  ['unknown part', { title: 'x' }, false],
  ['not text', { scenes: ['one'] }, false],
  // characters, not UTF-16 units: 15,000 emoji are within the limit, 20,001 letters are not
  ['emoji within the limit', { summary: '\u{1F3A5}'.repeat(15000) }, true],
  ['too long', { notes: 'a'.repeat(20001) }, false],
]);

conform('reference-list-attributes', '', referenceListAttributesSchema, [
  ['a platform', { consent_channel: 'facebook' }, true],
  ['none', {}, true],
  ['a bad code', { consent_channel: 'Face Book' }, false],
  ['unknown key', { colour: 'green' }, false],
]);

conform('handover-scope', '', handoverScopeSchema, [
  [
    'valid',
    { items: [{ item_type: 'pending_review', item_id: U, new_owner_user_id: U }], note: 'বদলি' },
    true,
  ],
  ['unknown item type', { items: [{ item_type: 'car', item_id: U, new_owner_user_id: U }] }, false],
]);

conform('rating-scores', '', ratingScoresSchema, [
  ['three criteria', { punctuality: 5, quality: 4, reporting: 3 }, true],
  ['score 6', { punctuality: 6 }, false],
  ['six criteria', { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }, false],
]);

conform('user-preferences', '', userPreferencesSchema, [
  ['defaults', {}, true],
  [
    'digest at 08:00',
    { email_mode: 'digest', digest_time: '08:00', push_opt_in_sessions: [U] },
    true,
  ],
  ['hijri setting removed (O-43)', { hijri_date: true }, false],
  ['bad time', { digest_time: '8 am' }, false],
]);

conform('form-field-logic', '', fieldLogicSchema, [
  ['show if', { show_if: { field: 'marital_status', op: 'eq', value: 'widowed' } }, true],
  [
    'nested all/any/not',
    {
      required_if: {
        all: [
          { field: 'age', op: 'gte', value: 60 },
          { not: { any: [{ field: 'income', op: 'is_empty' }] } },
        ],
      },
    },
    true,
  ],
  ['empty all', { show_if: { all: [] } }, false],
  ['unknown operator', { show_if: { field: 'age', op: 'between' } }, false],
  ['bad field key', { show_if: { field: 'Age', op: 'eq' } }, false],
]);
conform('form-field-logic', '#/$defs/condition', conditionSchema, [
  ['condition', { field: 'gender', op: 'in', value: ['female'] }, true],
  [
    'compared with another answer',
    { field: 'expense', op: 'gt', value: { field: 'income' } },
    true,
  ],
  ['two shapes at once', { field: 'gender', op: 'eq', all: [] }, false],
]);
conform('form-field-logic', '#/$defs/calculation', calculationSchema, [
  [
    'zakat net assets',
    { expr: { op: 'sub', args: [{ field: 'assets' }, { field: 'debts' }] }, round: 2 },
    true,
  ],
  [
    'nisab setting',
    { expr: { op: 'compare_gte', args: [{ field: 'net' }, { setting: 'nisab_value' }] } },
    true,
  ],
  ['sum of a repeat group', { expr: { sum_repeat: { group: 'earners', field: 'income' } } }, true],
  [
    'a value by condition with a text result',
    {
      expr: {
        if: [{ when: { field: 'ratio', op: 'gte', value: 1 }, then: { result: 'above' } }],
        else: { result: 'severe' },
      },
    },
    true,
  ],
  [
    'rows counted by a condition',
    { expr: { count_rows: { group: 'members', where: { field: 'income', op: 'gt', value: 0 } } } },
    true,
  ],
  ['a branch list that is empty', { expr: { if: [], else: 0 } }, false],
  ['a result code with a capital', { expr: { result: 'Above' } }, false],
  ['unknown function', { expr: { op: 'pow', args: [2, 3] } }, false],
  ['round 5', { expr: 1, round: 5 }, false],
]);
conform('form-field-logic', '#/$defs/settings', fieldSettingsSchema, [
  [
    'settings',
    {
      placeholder: { bn: 'নাম', en: 'Name' },
      validation: { max_length: 200, pattern: 'bangla_text' },
      repeat: { min_rows: 0, max_rows: 10 },
    },
    true,
  ],
  [
    'text results',
    { results: [{ code: 'severe', label: { bn: 'চরম দারিদ্র্য', en: 'Severe Poverty' } }] },
    true,
  ],
  ['a result without a code', { results: [{ label: { bn: 'ক', en: 'a' } }] }, false],
  ['max_length 0', { validation: { max_length: 0 } }, false],
]);

const componentCases: Record<string, Case[]> = {
  application_form: [
    [
      'class options',
      { beneficiary_class_options: [{ code: 'widow', label: { bn: 'বিধবা', en: 'Widow' } }] },
      true,
    ],
    [
      'label without en',
      { beneficiary_class_options: [{ code: 'widow', label: { bn: 'বিধবা' } }] },
      false,
    ],
    [
      'application kinds',
      {
        application_kinds: [
          { code: 'personal_garden', label: { bn: 'ব্যক্তিগত বাগান', en: 'Personal garden' } },
        ],
      },
      true,
    ],
    [
      'twenty-one application kinds',
      {
        application_kinds: Array.from({ length: 21 }, (_, i) => ({
          code: `k${i}`,
          label: { bn: 'ক', en: 'K' },
        })),
      },
      false,
    ],
  ],
  public_link: [
    ['enabled with token', { enabled: true, token: 'abcdefghijklmnop' }, true],
    ['short token', { enabled: true, token: 'abc' }, false],
  ],
  photo_rule: [
    [
      'group photo, camera only',
      { rule: 'group', source: { distribution_proof: 'camera_only' } },
      true,
    ],
    ['unknown rule', { rule: 'none' }, false],
  ],
  stages: [
    [
      'stages',
      {
        list: [
          { key: 'foundation', label: { bn: 'ভিত্তি', en: 'Foundation' }, photo_required: true },
        ],
      },
      true,
    ],
    ['empty list', { list: [] }, false],
    [
      'thirty-one stages',
      {
        list: Array.from({ length: 31 }, (_, i) => ({
          key: `s${i}`,
          label: { bn: 'ধাপ', en: 'Stage' },
        })),
      },
      false,
    ],
    [
      'a label over 200 characters',
      { list: [{ key: 'long', label: { bn: 'ক'.repeat(201), en: 'Long' } }] },
      false,
    ],
  ],
  rating_criteria: [
    [
      'five criteria',
      {
        criteria: Array.from({ length: 5 }, (_, i) => ({
          code: `c${i}`,
          label: { bn: 'ক', en: 'C' },
        })),
      },
      true,
    ],
    [
      'six criteria',
      {
        criteria: Array.from({ length: 6 }, (_, i) => ({
          code: `c${i}`,
          label: { bn: 'ক', en: 'C' },
        })),
      },
      false,
    ],
  ],
  scoring: [
    [
      'criterion',
      {
        criteria: [
          {
            key: 'income',
            label: { bn: 'আয়', en: 'Income' },
            max_points: 40,
            rule: { bands: [] },
          },
        ],
      },
      true,
    ],
    [
      'rule not an object',
      {
        criteria: [{ key: 'income', label: { bn: 'আয়', en: 'Income' }, max_points: 40, rule: 5 }],
      },
      false,
    ],
  ],
  dawah: [
    ['family attendance', { family_attendance: true, gender_split: true }, true],
    ['unknown key', { teachers: 2 }, false],
  ],
};
for (const [key, cases] of Object.entries(componentCases)) {
  conform(
    'project-component-settings',
    `#/$defs/${key}`,
    componentSettingsSchemas[key as keyof typeof componentSettingsSchemas],
    cases,
  );
}

describe('project-component-settings as a whole', () => {
  it('accepts {} for components without settings (anyOf, T1.2)', () => {
    expect(docSchema('project-component-settings')({})).toBe(true);
    expect(componentSettingsSchema('dispatch_receive').safeParse({}).success).toBe(true);
    expect(componentSettingsSchema('dispatch_receive').safeParse({ x: 1 }).success).toBe(false);
  });
  it('has a zod mirror for every component definition of the JSON Schema', () => {
    const defs = Object.keys(
      read(join(schemaDir, 'project-component-settings.schema.json')).$defs,
      // the helpers, and the pending photo rule: the state a draft's distribution row is seeded
      // in before the PM chooses the rule, never a shape the API accepts in a write
    ).filter(
      (d) =>
        !['bilingual', 'codeLabel', 'photoSource', 'photoSources', 'photo_rule_pending'].includes(
          d,
        ),
    );
    expect(Object.keys(componentSettingsSchemas).sort()).toEqual(defs.sort());
  });
});

describe('workflow definitions', () => {
  const templates = readdirSync(templatesDir).filter((f) => f.endsWith('.yaml'));
  it.each(templates)('%s is valid for the JSON Schema and the zod mirror', (file) => {
    const template = yaml.load(readFileSync(join(templatesDir, file), 'utf8'));
    expect(docSchema('workflow-definition')(template)).toBe(true);
    const result = workflowDefinitionSchema.safeParse(template);
    expect(result.error?.issues ?? []).toEqual([]);
  });
  it('rejects a transition with both a permission and an automatic trigger', () => {
    const bad = {
      template: 'x',
      version: 1,
      title_en: 'X',
      title_bn: 'X',
      transitions: [{ from: 'a', to: 'b', permission: 'a.b', auto: true, trigger: 't' }],
    };
    expect(docSchema('workflow-definition')(bad)).toBe(false);
    expect(workflowDefinitionSchema.safeParse(bad).success).toBe(false);
  });
});

it('jsonbSchemas covers every JSONB column of DATABASE_SCHEMA section 20 that has a schema file', () => {
  expect(Object.keys(jsonbSchemas)).toEqual(
    expect.arrayContaining([
      'application_answers.value',
      'application_scores.criteria',
      'distributions.items',
      'followup_evaluations.answers',
      'handovers.scope',
      'users.preferences',
      'form_fields.logic',
      'form_fields.calculation',
      'form_fields.settings',
      'form_sections.condition',
      'workflow_definitions.definition',
      'projects.workflow_snapshot',
      'volunteer_ratings.proposed_scores',
      'volunteer_ratings.final_scores',
      'media_works.script',
      'reference_lists.attributes',
    ]),
  );
});
