import { z } from 'zod';
import {
  identityRequirement,
  type identitySettingsShape,
  repeatRule,
} from '../jsonb/component-settings.js';

/**
 * What a project's application asks about identity and contact, and what a second appearance of
 * the same person or of the same family does at review. The project keeps its choices in the
 * settings of its application form component; this is the shape every reader gets.
 */
export const identityRulesSchema = z.object({
  /** The NID or the birth registration number: required, or asked "if they have one". */
  document: identityRequirement,
  /** The mobile number: required, or left out where the person has none. */
  mobile: identityRequirement,
  /** The same person again: only told at review, or the approval is held for a written reason. */
  repeatPerson: repeatRule,
  /** Someone of the same family again: only told, or held the same way. */
  repeatFamily: repeatRule,
});
export type IdentityRules = z.infer<typeof identityRulesSchema>;

/** A project that says nothing asks both and holds both. */
export const DEFAULT_IDENTITY_RULES: IdentityRules = {
  document: 'required',
  mobile: 'required',
  repeatPerson: 'hold',
  repeatFamily: 'hold',
};

/** The settings key of the application form component behind each rule. */
export const IDENTITY_RULE_SETTINGS = {
  document: 'identity_document',
  mobile: 'mobile',
  repeatPerson: 'repeat_person',
  repeatFamily: 'repeat_family',
} as const satisfies Record<keyof IdentityRules, keyof typeof identitySettingsShape>;

const valueOr = <T extends string>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

/**
 * The rules of a project, read from the stored settings of its application form component. A
 * project without that row, a key never set and a value the settings schema does not know all
 * read as the default, so nothing is asked less than before by accident. The API, the screens
 * and the phone read the rules through this function and never from the raw keys.
 */
export function identityRules(settings: unknown): IdentityRules {
  const stored: Partial<Record<keyof typeof identitySettingsShape, unknown>> =
    typeof settings === 'object' && settings !== null && !Array.isArray(settings) ? settings : {};
  return {
    document: valueOr(
      identityRequirement,
      stored.identity_document,
      DEFAULT_IDENTITY_RULES.document,
    ),
    mobile: valueOr(identityRequirement, stored.mobile, DEFAULT_IDENTITY_RULES.mobile),
    repeatPerson: valueOr(repeatRule, stored.repeat_person, DEFAULT_IDENTITY_RULES.repeatPerson),
    repeatFamily: valueOr(repeatRule, stored.repeat_family, DEFAULT_IDENTITY_RULES.repeatFamily),
  };
}

/**
 * The rules an answer or a stored project carries, as its reader may trust them: the rules when
 * they are whole and well-formed, the defaults otherwise (an answer of a server, or a project
 * kept on a phone, from before the rules existed). Never a mix of given and default values.
 */
export function carriedIdentityRules(value: unknown): IdentityRules {
  const parsed = identityRulesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_IDENTITY_RULES;
}

/** Whether two readings of the rules differ in any of the four. */
export function identityRulesDiffer(a: IdentityRules, b: IdentityRules): boolean {
  return (
    a.document !== b.document ||
    a.mobile !== b.mobile ||
    a.repeatPerson !== b.repeatPerson ||
    a.repeatFamily !== b.repeatFamily
  );
}
