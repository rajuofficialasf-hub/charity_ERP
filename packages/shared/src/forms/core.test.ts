import { describe, expect, it } from 'vitest';
import { coreAnswers, definitionWith, field, option, TODAY } from '../../test/forms-fixture.js';
import {
  type Answer,
  checkDefinition,
  CORE_FIELD_KEYS,
  evaluate,
  identityRoleOf,
  isStandardColumn,
  listOfField,
  optionalIdentityQuestion,
  validate,
} from './index.js';

// The columns a form may fill and the reference list a coded one takes its options from.
describe('the question whether the name is the father’s or the husband’s', () => {
  const relation = field('q_relation', 'single_select', {
    standardColumn: 'guardian_relation_code',
  });

  it('fills a column of the profile a form may fill, never its list column', () => {
    expect(isStandardColumn('guardian_relation_code')).toBe(true);
    expect(isStandardColumn('guardian_relation_list')).toBe(false);
  });

  it('takes its options from the list guardian_relation, and a family row’s question does not', () => {
    expect(listOfField(relation)).toBe('guardian_relation');
    expect(
      listOfField({
        standardColumn: 'guardian_relation_code',
        settings: { repeat: { group: 'g' } },
      }),
    ).toBeNull();
  });

  it('is no identity role: a form publishes without it, and with it optional', () => {
    expect(identityRoleOf(relation)).toBeNull();
    const publishing = { publishing: true, kind: 'beneficiary_application' } as const;
    expect(checkDefinition(definitionWith(), publishing)).toEqual([]);
    expect(
      checkDefinition(
        definitionWith([{ ...relation, options: [option('father'), option('husband')] }]),
        publishing,
      ),
    ).toEqual([]);
  });
});

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

  describe('the condition of the owner’s name', () => {
    const definition = definitionWith([
      { ...owner, options: [option('own'), option('family')] },
      { ...ownerName, required: true },
    ]);
    const chosen = (code: string): Answer => ({
      fieldKey: 'q_owner',
      value: { t: 'single_select', v: code },
    });
    const named: Answer = { fieldKey: 'q_owner_name', value: { t: 'short_text', v: 'Karim' } };
    const withoutMobile = coreAnswers().filter((a) => a.fieldKey !== 'mobile');
    const nameOf = (answers: Answer[]) =>
      evaluate(definition, answers, { today: TODAY }).fields.q_owner_name!;

    it('shows the name only beside an owner who is answered and is someone else', () => {
      // an inequality holds for no empty answer, so an owner left empty shows no name
      expect(nameOf(coreAnswers())).toMatchObject({ visible: false, required: false });
      expect(nameOf([...coreAnswers(), chosen('own')])).toMatchObject({ visible: false });
      expect(nameOf([...coreAnswers(), chosen('family')])).toMatchObject({
        visible: true,
        required: true,
      });
      // without a mobile the owner is hidden, and a hidden answer counts as empty
      expect(nameOf([...withoutMobile, chosen('family')])).toMatchObject({ visible: false });
    });

    it('neither asks for a hidden name nor keeps one that was sent', () => {
      const options = {
        audience: 'official',
        today: TODAY,
        optionalIdentity: { mobile: true },
      } as const;
      for (const answers of [
        [...coreAnswers(), named],
        [...coreAnswers(), chosen('own'), named],
        [...withoutMobile, chosen('family'), named],
      ]) {
        const result = validate(definition, answers, options);
        expect(result.ok && result.answers.map((a) => a.fieldKey)).not.toContain('q_owner_name');
      }
      const asked = validate(definition, [...coreAnswers(), chosen('family')], options);
      expect(!asked.ok && asked.errors.map((e) => [e.path, e.code])).toEqual([
        ['q_owner_name', 'validation.required'],
      ]);
    });
  });

  it('are asked once each: a second question for a column is refused', () => {
    const twice = definitionWith([owner, { ...owner, fieldKey: 'q_owner_again' }]);
    expect(
      checkDefinition(twice).map((issue) => [issue.code, issue.params?.fieldKey]),
    ).toContainEqual(['form.standard_column_duplicate', 'q_owner_again']);
  });
});
