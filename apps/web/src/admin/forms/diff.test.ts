import { describe, expect, it } from 'vitest';
import { definition, field, option, section, T } from '../../../test/forms';
import { diffDefinitions } from './diff';

const type = () =>
  field('beneficiary_class', 'single_select', {
    label: T('উপকারভোগীর ধরন', 'Beneficiary type'),
    options: [option('elderly'), option('widow')],
  });
const extra = () => section('family_income', [field('members_14_plus', 'number'), type()]);

describe('the change summary', () => {
  it('finds nothing between two equal definitions', () => {
    expect(diffDefinitions(definition(extra()), definition(extra()))).toEqual([]);
  });

  it('names an added and a removed section', () => {
    expect(diffDefinitions(definition(), definition(extra()))).toEqual([
      { kind: 'section_added', section: 'family_income', title: T('family_income') },
    ]);
    expect(diffDefinitions(definition(extra()), definition())).toEqual([
      { kind: 'section_removed', section: 'family_income', title: T('family_income') },
    ]);
  });

  it('names an added, a removed and a moved question', () => {
    const before = definition(extra());
    const added = definition(
      section('family_income', [...extra().fields, field('daily_income', 'money')]),
    );
    expect(diffDefinitions(before, added)).toEqual([
      {
        kind: 'field_added',
        section: 'family_income',
        field: 'daily_income',
        label: T('daily_income'),
      },
    ]);
    const removed = definition(section('family_income', [type()]));
    expect(diffDefinitions(before, removed)).toEqual([
      {
        kind: 'field_removed',
        section: 'family_income',
        field: 'members_14_plus',
        label: T('members_14_plus'),
      },
    ]);
    // the last question goes to the top; the other two keep their order
    const three = definition(
      section('family_income', [...extra().fields, field('daily_income', 'money')]),
    );
    const moved = definition(
      section('family_income', [field('daily_income', 'money'), ...extra().fields]),
    );
    expect(diffDefinitions(three, moved)).toEqual([
      {
        kind: 'field_moved',
        section: 'family_income',
        field: 'daily_income',
        label: T('daily_income'),
      },
    ]);
    const toAnother = definition(
      section('family_income', [type()]),
      section('extra', [field('members_14_plus', 'number')]),
    );
    expect(diffDefinitions(definition(extra(), section('extra', [])), toAnother)).toEqual([
      {
        kind: 'field_moved',
        section: 'extra',
        field: 'members_14_plus',
        label: T('members_14_plus'),
      },
    ]);
  });

  it('names an added and a removed option by its label', () => {
    const more = {
      ...type(),
      options: [
        ...type().options!,
        option('other', { label: T('অন্যান্য', 'Other'), allowsOtherText: true }),
      ],
    };
    expect(
      diffDefinitions(
        definition(extra()),
        definition(section('family_income', [field('members_14_plus', 'number'), more])),
      ),
    ).toEqual([
      {
        kind: 'option_added',
        section: 'family_income',
        field: 'beneficiary_class',
        label: T('উপকারভোগীর ধরন', 'Beneficiary type'),
        option: 'other',
        optionLabel: T('অন্যান্য', 'Other'),
      },
    ]);
    const fewer = { ...type(), options: [option('elderly')] };
    expect(
      diffDefinitions(
        definition(extra()),
        definition(section('family_income', [field('members_14_plus', 'number'), fewer])),
      ),
    ).toEqual([expect.objectContaining({ kind: 'option_removed', option: 'widow' })]);
  });

  it('names what changed on a question: its label, required, its condition, its calculation', () => {
    const changed = field('members_14_plus', 'number', {
      label: T('১৪ বছরের বেশি সদস্য', 'Members over 14'),
      required: true,
      logic: { show_if: { field: 'beneficiary_class', op: 'eq', value: 'widow' } },
    });
    expect(
      diffDefinitions(definition(extra()), definition(section('family_income', [changed, type()]))),
    ).toEqual([
      {
        kind: 'field_changed',
        section: 'family_income',
        field: 'members_14_plus',
        label: T('১৪ বছরের বেশি সদস্য', 'Members over 14'),
        what: ['label', 'required', 'condition'],
      },
    ]);
    const calc = (expr: { op: 'add'; args: { field: string }[] }) =>
      definition(
        section('family_income', [
          field('members_14_plus', 'number'),
          field('total', 'calculation', { calculation: { expr } }),
        ]),
      );
    expect(
      diffDefinitions(
        calc({ op: 'add', args: [{ field: 'members_14_plus' }] }),
        calc({ op: 'add', args: [{ field: 'members_14_plus' }, { field: 'members_14_plus' }] }),
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'field_changed', field: 'total', what: ['calculation'] }),
    ]);
  });

  it('names a section that became official-only or got a condition', () => {
    const official = section('family_income', extra().fields, { visibility: 'official_only' });
    expect(diffDefinitions(definition(extra()), definition(official))).toEqual([
      {
        kind: 'section_changed',
        section: 'family_income',
        title: T('family_income'),
        what: ['visibility'],
      },
    ]);
  });
});
