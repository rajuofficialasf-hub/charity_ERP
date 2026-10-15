import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { COMPONENT_KEYS } from '../src/components.js';
import { componentSettingsSchema } from '../src/jsonb/component-settings.js';
import { type WorkflowDefinition } from '../src/jsonb/workflow-definition.js';
import { mergeWorkflowTemplates } from '../src/workflow/merge.js';
import {
  BUDGET_LIMIT_PAISA,
  componentsCheck,
  editableIn,
  fromPaisa,
  fundSourcesSchema,
  IDENTITY_FIELDS,
  plannedBudgetPaisa,
  PROJECT_TRANSITIONS,
  setupCheck,
  type SetupInput,
  startingComponents,
  sumPaisa,
  syllabusSchema,
  toPaisa,
  transitionFor,
  WORKFLOW_COMPONENTS,
  WORKFLOW_KEYS,
} from '../src/projects/index.js';

// The workflow templates as the seed stores them: each yaml merged with its `extends` chain.
const dir = join(__dirname, '../../../docs/architecture/workflow-templates');
const templates = readdirSync(dir)
  .filter((f) => f.endsWith('.yaml'))
  .map(
    (f) =>
      yaml.load(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown> & {
        template: string;
      },
  );
const definition = (key: string): WorkflowDefinition => mergeWorkflowTemplates(key, templates);

const classes = [{ code: 'widow', label: { bn: 'বিধবা', en: 'Widow' } }];
const kinds = [
  {
    code: 'educational_institution',
    label: { bn: 'শিক্ষাপ্রতিষ্ঠান', en: 'Educational institution' },
  },
  { code: 'personal_garden', label: { bn: 'ব্যক্তিগত বাগান', en: 'Personal garden' } },
];
const start = (key: (typeof WORKFLOW_KEYS)[number]) =>
  startingComponents(key, definition(key), {
    beneficiaryClasses: classes,
    applicationKinds: kinds,
  });
const row = (rows: ReturnType<typeof start>, key: string) =>
  rows.find((r) => r.componentKey === key)!;

describe('the starting components of a workflow', () => {
  it.each(WORKFLOW_KEYS)('%s: one row per component, the table decides which are on', (key) => {
    const rows = start(key);
    expect(rows.map((r) => r.componentKey)).toEqual([...COMPONENT_KEYS]);
    expect(rows.filter((r) => r.enabled).map((r) => r.componentKey)).toEqual(
      COMPONENT_KEYS.filter((k) => WORKFLOW_COMPONENTS[key].includes(k)),
    );
  });

  it.each(WORKFLOW_KEYS)('%s: every enabled component with a rule has valid settings', (key) => {
    for (const r of start(key)) {
      const empty = Object.keys(r.settings).length === 0;
      // a photo rule the PM must choose ("per project") starts without its rule on purpose
      if (r.componentKey === 'distribution' && !('rule' in r.settings)) continue;
      if (!empty || r.enabled)
        expect(
          componentSettingsSchema(r.componentKey).safeParse(r.settings).success,
          r.componentKey,
        ).toBe(true);
    }
  });

  it('leaves the photo rule open when the workflow says the PM chooses it, keeping the source', () => {
    for (const key of ['distribution', 'qurbani'] as const)
      expect(row(start(key), 'distribution').settings, key).toEqual({
        source: {
          distribution_proof: 'camera_only',
          construction_proof: 'camera_only',
          evidence: 'camera_only',
          voucher: 'camera_or_gallery',
          payment_copy: 'camera_or_gallery',
        },
      });
  });

  it('copies a fixed photo rule and spreads the single photo source over the proof photos', () => {
    expect(row(start('construction'), 'distribution').settings).toEqual({
      rule: 'individual',
      source: {
        distribution_proof: 'camera_only',
        construction_proof: 'camera_only',
        evidence: 'camera_only',
        voucher: 'camera_or_gallery',
        payment_copy: 'camera_or_gallery',
      },
    });
    expect(row(start('open_application_visit'), 'distribution').settings).toMatchObject({
      rule: 'per_application_type',
    });
  });

  it('turns the workflow stages into bilingual stage settings', () => {
    const stages = row(start('implementation_evidence'), 'stages').settings as {
      list: { key: string; label: { bn: string; en: string }; photo_required?: boolean }[];
    };
    expect(stages.list[0]).toEqual({
      key: 'training',
      label: { bn: 'দাওয়াহ ক্লাস', en: 'Dawah classes' },
    });
    expect(stages.list.find((s) => s.key === 'purchase')?.photo_required).toBe(true);
    for (const key of WORKFLOW_KEYS) {
      const settings = row(start(key), 'stages').settings;
      if (Object.keys(settings).length)
        expect(componentSettingsSchema('stages').safeParse(settings).success, key).toBe(true);
    }
  });

  it('gives the beneficiary types to every workflow and the application kinds to tree planting', () => {
    expect(row(start('distribution'), 'application_form').settings).toEqual({
      beneficiary_class_options: classes,
    });
    expect(row(start('open_application_visit'), 'application_form').settings).toEqual({
      beneficiary_class_options: classes,
      application_kinds: kinds,
    });
  });

  it('switches dawah on where the workflow enables it', () => {
    expect(row(start('implementation_evidence'), 'dawah').enabled).toBe(true);
    expect(row(start('construction'), 'dawah').enabled).toBe(false);
  });
});

describe('the component settings limits', () => {
  it('refuses an unknown key and a list over its maximum', () => {
    expect(
      componentSettingsSchema('rating_criteria').safeParse({ criteria: [], extra: 1 }).success,
    ).toBe(false);
    const stage = (i: number) => ({ key: `s${i}`, label: { bn: 'ধাপ', en: 'Stage' } });
    const list = (n: number) => Array.from({ length: n }, (_, i) => stage(i));
    expect(componentSettingsSchema('stages').safeParse({ list: list(30) }).success).toBe(true);
    expect(componentSettingsSchema('stages').safeParse({ list: list(31) }).success).toBe(false);
    const long = { code: 'x', label: { bn: 'ক'.repeat(201), en: 'x' } };
    expect(componentSettingsSchema('rating_criteria').safeParse({ criteria: [long] }).success).toBe(
      false,
    );
  });
});

describe('the project lifecycle', () => {
  it('allows exactly the five transitions', () => {
    expect(PROJECT_TRANSITIONS).toEqual({
      activate: { from: ['draft'], to: 'active' },
      cancel: { from: ['draft'], to: 'cancelled' },
      start_closing: { from: ['active'], to: 'closing' },
      close: { from: ['closing'], to: 'closed' },
      reopen: { from: ['closing', 'closed'], to: 'active' },
    });
    expect(transitionFor('close', 'active')).toBeNull();
    expect(transitionFor('reopen', 'closed')).toBe('active');
    expect(transitionFor('reopen', 'draft')).toBeNull();
  });

  it('keeps the identity and the end date fixed once active, and everything once closing', () => {
    expect(IDENTITY_FIELDS).toEqual(['code', 'programId', 'year', 'workflowKey']);
    for (const field of [...IDENTITY_FIELDS, 'applyFrom', 'applyTo', 'name'] as const)
      expect(editableIn('draft', field), field).toBe(true);
    for (const field of IDENTITY_FIELDS) expect(editableIn('active', field), field).toBe(false);
    expect(editableIn('active', 'applyTo')).toBe(false);
    expect(editableIn('active', 'applyFrom')).toBe(true);
    expect(editableIn('active', 'name')).toBe(true);
    expect(editableIn('active', 'components')).toBe(true);
    for (const status of ['closing', 'closed', 'cancelled'] as const)
      expect(editableIn(status, 'name'), status).toBe(false);
  });
});

describe('money in paisa', () => {
  it('reads an amount as whole paisa', () => {
    expect(toPaisa('1000.5')).toBe(100050n);
    expect(toPaisa('0.07')).toBe(7n);
    expect(toPaisa('12')).toBe(1200n);
    expect(() => toPaisa('-1')).toThrow(RangeError);
    expect(() => toPaisa('1.005')).toThrow(RangeError);
    expect(() => toPaisa('1,000')).toThrow(RangeError);
  });

  it('adds amounts without floating point error', () => {
    expect(sumPaisa(['1000.10', '499.90'])).toBe(150000n);
    expect(sumPaisa(['0.10', '0.20'])).toBe(30n);
    expect(fromPaisa(150000n)).toBe('1500.00');
    expect(fromPaisa(7n)).toBe('0.07');
  });

  it('plans the budget as cost per beneficiary times the target, exactly at any size', () => {
    expect(plannedBudgetPaisa('1000.50', 100)).toBe(10005000n);
    expect(plannedBudgetPaisa('999999999999.99', 9_000_000)).toBe(899999999999991000000n);
    expect(plannedBudgetPaisa(null, 100)).toBeNull();
    expect(plannedBudgetPaisa('1000', null)).toBeNull();
  });
});

describe('the activation check', () => {
  const complete: SetupInput = {
    name: { bn: 'শীতবস্ত্র', en: 'Winter' },
    year: 2026,
    workflowKey: 'distribution',
    applyFrom: '2026-11-01',
    applyTo: '2026-12-31',
    perVolunteerLimit: 50,
    limitRequired: true,
    costPerBeneficiary: '1000.00',
    targetBeneficiaries: 100,
    fundSources: [
      { source: 'zakat', amount: '60000.00' },
      { source: 'general', amount: '40000.00' },
    ],
    areaCount: 1,
    components: [
      { componentKey: 'distribution', enabled: true, settings: { rule: 'group' } },
      { componentKey: 'stages', enabled: false, settings: {} },
    ],
  };

  it('finds nothing missing in a complete setup', () => {
    expect(setupCheck(complete)).toEqual([]);
  });

  it('checks the components on their own, as an active project keeps them', () => {
    expect(componentsCheck(complete.components)).toEqual([]);
    expect(
      componentsCheck([
        ...complete.components,
        { componentKey: 'public_link', enabled: true, settings: {} },
      ]),
    ).toEqual(['component:public_link']);
  });

  it('lists each missing item', () => {
    expect(
      setupCheck({
        ...complete,
        name: { bn: 'শীতবস্ত্র', en: ' ' },
        year: null,
        workflowKey: null,
        applyFrom: null,
        perVolunteerLimit: null,
        costPerBeneficiary: null,
        targetBeneficiaries: null,
        fundSources: [],
        areaCount: 0,
        components: [
          { componentKey: 'distribution', enabled: true, settings: {} },
          { componentKey: 'rating_criteria', enabled: true, settings: {} },
        ],
      }),
    ).toEqual([
      'name',
      'year',
      'workflow',
      'window',
      'limit',
      'cost',
      'target',
      'fund_sources',
      'area',
      'photo_rule',
      'component:rating_criteria',
    ]);
  });

  it('checks the values, not only their presence', () => {
    expect(setupCheck({ ...complete, applyFrom: '2027-01-01' })).toEqual(['window']);
    expect(setupCheck({ ...complete, perVolunteerLimit: 0 })).toEqual(['limit']);
    expect(setupCheck({ ...complete, perVolunteerLimit: 2.5 })).toEqual(['limit']);
    expect(
      setupCheck({
        ...complete,
        costPerBeneficiary: '0.00',
        fundSources: [{ source: 'zakat', amount: '0.00' }],
      }),
    ).toEqual(['cost']);
    expect(setupCheck({ ...complete, targetBeneficiaries: 0 })).toEqual(['target']);
  });

  it('lists an unreadable amount instead of failing', () => {
    expect(setupCheck({ ...complete, costPerBeneficiary: 'abc' })).toEqual(['cost']);
    expect(
      setupCheck({ ...complete, fundSources: [{ source: 'zakat', amount: '1,00,000' }] }),
    ).toEqual(['fund_sources_total']);
  });

  it('needs a photo rule even where the distribution component is off', () => {
    expect(
      setupCheck({
        ...complete,
        components: [{ componentKey: 'distribution', enabled: false, settings: { source: {} } }],
      }),
    ).toEqual(['photo_rule']);
    expect(
      setupCheck({
        ...complete,
        components: [
          { componentKey: 'distribution', enabled: false, settings: { rule: 'individual' } },
        ],
      }),
    ).toEqual([]);
    expect(setupCheck({ ...complete, components: [] })).toEqual(['photo_rule']);
  });

  it('needs the fund sources to add up to the planned budget, to the paisa', () => {
    expect(
      setupCheck({ ...complete, fundSources: [{ source: 'zakat', amount: '99999.99' }] }),
    ).toEqual(['fund_sources_total']);
    expect(
      setupCheck({
        ...complete,
        fundSources: [
          { source: 'zakat', amount: '60000.10' },
          { source: 'sadaqah', amount: '39999.90' },
        ],
      }),
    ).toEqual([]);
  });

  it('does not ask for a limit where the workflow has none', () => {
    expect(setupCheck({ ...complete, perVolunteerLimit: null, limitRequired: false })).toEqual([]);
  });

  it('ignores the settings of a component that is off', () => {
    expect(
      setupCheck({
        ...complete,
        components: [
          ...complete.components,
          { componentKey: 'rating_criteria', enabled: false, settings: {} },
        ],
      }),
    ).toEqual([]);
  });
});

describe('the setup request bodies', () => {
  it('takes the budget with the fund sources, and keeps a syllabus topic once', () => {
    const topic = { id: '0190a000-0000-7000-8000-000000000001', title: { bn: 'ক', en: 'A' } };
    expect(syllabusSchema.safeParse({ topics: [topic, topic] }).success).toBe(false);
    expect(syllabusSchema.safeParse({ topics: [topic, { title: topic.title }] }).success).toBe(
      true,
    );
    expect(
      fundSourcesSchema.safeParse({
        costPerBeneficiary: '90.00',
        targetBeneficiaries: 10,
        fundSources: [{ source: 'zakat', amount: '900.00' }],
      }).success,
    ).toBe(true);
    expect(fundSourcesSchema.safeParse({ costPerBeneficiary: null, fundSources: [] }).success).toBe(
      false,
    );
  });

  it('knows the largest budget the column holds', () => {
    expect(plannedBudgetPaisa('999999999999.99', 1)! < BUDGET_LIMIT_PAISA).toBe(true);
    expect(plannedBudgetPaisa('1000000', 1_000_000)! >= BUDGET_LIMIT_PAISA).toBe(true);
  });
});
