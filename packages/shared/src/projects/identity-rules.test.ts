import { describe, expect, it } from 'vitest';
import { componentSettingsSchema } from '../jsonb/component-settings.js';
import {
  DEFAULT_IDENTITY_RULES,
  identityRules,
  identityRulesDiffer,
  identityRulesSchema,
} from './identity-rules.js';

const STRICT = {
  document: 'required',
  mobile: 'required',
  repeatPerson: 'hold',
  repeatFamily: 'hold',
};

describe('the identity rules of a project', () => {
  it('asks both and holds both for empty settings and for a project without the row', () => {
    expect(DEFAULT_IDENTITY_RULES).toEqual(STRICT);
    expect(identityRules({})).toEqual(STRICT);
    expect(identityRules(null)).toEqual(STRICT);
    expect(identityRules(undefined)).toEqual(STRICT);
    // settings that hold other keys of the component only
    expect(identityRules({ form_ids: [], beneficiary_class_options: [] })).toEqual(STRICT);
  });

  it('gives the stored values, each on its own', () => {
    expect(
      identityRules({
        identity_document: 'optional',
        mobile: 'optional',
        repeat_person: 'tell',
        repeat_family: 'tell',
      }),
    ).toEqual({
      document: 'optional',
      mobile: 'optional',
      repeatPerson: 'tell',
      repeatFamily: 'tell',
    });
    expect(identityRules({ mobile: 'optional' })).toEqual({ ...STRICT, mobile: 'optional' });
    expect(identityRules({ repeat_family: 'tell' })).toEqual({ ...STRICT, repeatFamily: 'tell' });
    expect(identityRules({ identity_document: 'required', repeat_person: 'hold' })).toEqual(STRICT);
  });

  it('reads a value outside the lists, and settings that are no object, as the default', () => {
    expect(identityRules({ identity_document: 'sometimes', mobile: 'optional' })).toEqual({
      ...STRICT,
      mobile: 'optional',
    });
    expect(identityRules({ repeat_person: true, repeat_family: null })).toEqual(STRICT);
    expect(identityRules('optional')).toEqual(STRICT);
    expect(identityRules(['optional'])).toEqual(STRICT);
  });

  it('answers the shape the reads promise', () => {
    expect(identityRulesSchema.safeParse(identityRules({ mobile: 'optional' })).success).toBe(true);
    expect(identityRulesSchema.safeParse({ ...STRICT, document: 'sometimes' }).success).toBe(false);
  });

  it('says whether two readings differ', () => {
    expect(identityRulesDiffer(identityRules({}), identityRules(null))).toBe(false);
    expect(identityRulesDiffer(identityRules({}), identityRules({ mobile: 'required' }))).toBe(
      false,
    );
    for (const settings of [
      { identity_document: 'optional' },
      { mobile: 'optional' },
      { repeat_person: 'tell' },
      { repeat_family: 'tell' },
    ])
      expect(
        identityRulesDiffer(identityRules({}), identityRules(settings)),
        JSON.stringify(settings),
      ).toBe(true);
  });
});

describe('the settings of the application form component', () => {
  const schema = componentSettingsSchema('application_form');

  it('take the four choices, each optional', () => {
    expect(schema.safeParse({}).success).toBe(true);
    expect(
      schema.safeParse({
        identity_document: 'optional',
        mobile: 'required',
        repeat_person: 'tell',
        repeat_family: 'hold',
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ repeat_family: 'tell' }).success).toBe(true);
  });

  it('refuse a value outside the two of each choice', () => {
    expect(schema.safeParse({ identity_document: 'sometimes' }).success).toBe(false);
    expect(schema.safeParse({ mobile: 'volunteer' }).success).toBe(false);
    expect(schema.safeParse({ repeat_person: 'reject' }).success).toBe(false);
    expect(schema.safeParse({ repeat_family: true }).success).toBe(false);
  });

  it('keep the choices away from every other component', () => {
    expect(componentSettingsSchema('dawah').safeParse({ mobile: 'optional' }).success).toBe(false);
    expect(
      componentSettingsSchema('dispatch_receive').safeParse({ mobile: 'optional' }).success,
    ).toBe(false);
  });
});
