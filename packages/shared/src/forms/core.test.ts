import { describe, expect, it } from 'vitest';
import { definitionWith, field, option } from '../../test/forms-fixture.js';
import {
  checkDefinition,
  CORE_FIELD_KEYS,
  identityRoleOf,
  isStandardColumn,
  listOfField,
  optionalIdentityQuestion,
} from './index.js';

// The columns a form may fill and the reference list a coded one takes its options from.
describe('the two questions on whose number the mobile is', () => {
  const owner = field('q_owner', 'single_select', {
    standardColumn: 'mobile_owner_code',
    logic: { show_if: { field: 'mobile', op: 'not_empty' } },
  });
  const ownerName = field('q_owner_name', 'short_text', {
    standardColumn: 'mobile_owner_name',
    logic: { show_if: { field: 'q_owner', op: 'neq', value: 'own' } },
  });

  it('fill two columns of the profile a form may fill', () => {
    expect(isStandardColumn('mobile_owner_code')).toBe(true);
    expect(isStandardColumn('mobile_owner_name')).toBe(true);
    expect(isStandardColumn('mobile_owner_list')).toBe(false);
  });

  it('take the owner’s options from the list mobile_owner, as the gender question takes its own', () => {
    expect(listOfField(owner)).toBe('mobile_owner');
    expect(listOfField(field('gender', 'single_select', { standardColumn: 'gender_code' }))).toBe(
      'gender',
    );
    // the name is free text, and a row question of a family group is no profile column
    expect(listOfField(ownerName)).toBeNull();
    expect(
      listOfField({ standardColumn: 'mobile_owner_code', settings: { repeat: { group: 'g' } } }),
    ).toBeNull();
  });

  it('are no identity roles: a form publishes without them, and with them optional and conditional', () => {
    expect(identityRoleOf(owner)).toBeNull();
    expect(identityRoleOf(ownerName)).toBeNull();
    expect(CORE_FIELD_KEYS).toHaveLength(7);
    for (const question of [owner, ownerName])
      expect(optionalIdentityQuestion(question, { document: true, mobile: true })).toBeNull();
    const publishing = { publishing: true, kind: 'beneficiary_application' } as const;
    expect(checkDefinition(definitionWith(), publishing)).toEqual([]);
    const withBoth = definitionWith([
      { ...owner, options: [option('own'), option('family')] },
      ownerName,
    ]);
    expect(checkDefinition(withBoth, publishing)).toEqual([]);
  });

  it('are asked once each: a second question for a column is refused', () => {
    const twice = definitionWith([owner, { ...owner, fieldKey: 'q_owner_again' }]);
    expect(
      checkDefinition(twice).map((issue) => [issue.code, issue.params?.fieldKey]),
    ).toContainEqual(['form.standard_column_duplicate', 'q_owner_again']);
  });
});
