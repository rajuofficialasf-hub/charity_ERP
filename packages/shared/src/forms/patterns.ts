import { BIRTH_REG_PATTERN, NID_PATTERN } from '../beneficiaries/identity.js';
import { MOBILE_PATTERN } from '../registration/index.js';

/**
 * The validation patterns a form may name. A PM picks one of these; no form ever carries a regex
 * of its own, so nothing a form author writes can stall the server. Every expression here is
 * bounded (no nested or open-ended repetition) and is only run on a text that is already under
 * its length cap, so matching is linear in the length of the input.
 */
export const PATTERN_KEYS = [
  'nid',
  'birth_reg',
  'mobile',
  'bangla_text',
  'email',
  'post_code',
  'digits',
] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

/** The longest text any field takes; a field may set a smaller `max_length`, never a larger one. */
export const TEXT_MAX_LENGTH = 4000;

export interface NamedPattern {
  regex: RegExp;
  /** Characters dropped before the match (never counted as a mismatch). */
  strip?: RegExp;
  /** Texts longer than this fail before the expression runs. */
  maxLength: number;
  /** The message key of a text that does not match. */
  messageKey: string;
}

// The Bengali block (letters, signs and digits), English digits (every number uses them), white
// space and the punctuation of an address. The zero-width joiners Bengali spelling needs are
// dropped before the match, so the class itself holds only visible characters.
const BANGLA_TEXT = /^[\u0980-\u09ff0-9\s.,()/-]{1,4000}$/u;
const ZERO_WIDTH_JOINERS = /[\u200c\u200d]/gu;
// Local part, then labels that hold no dot, so no split of the input is tried twice.
// eslint-disable-next-line security/detect-unsafe-regex -- bounded repetitions of a class that excludes the separator: linear
const EMAIL = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,8}$/u;

export const PATTERNS: Readonly<Record<PatternKey, NamedPattern>> = {
  nid: { regex: NID_PATTERN, maxLength: 17, messageKey: 'validation.nid_format' },
  birth_reg: { regex: BIRTH_REG_PATTERN, maxLength: 17, messageKey: 'validation.birth_reg_format' },
  mobile: { regex: MOBILE_PATTERN, maxLength: 11, messageKey: 'validation.mobile_format' },
  bangla_text: {
    regex: BANGLA_TEXT,
    strip: ZERO_WIDTH_JOINERS,
    maxLength: TEXT_MAX_LENGTH,
    messageKey: 'validation.bangla_text',
  },
  email: { regex: EMAIL, maxLength: 254, messageKey: 'validation.email_format' },
  post_code: { regex: /^[0-9]{4}$/u, maxLength: 4, messageKey: 'validation.post_code_format' },
  digits: {
    regex: /^[0-9]{1,4000}$/u,
    maxLength: TEXT_MAX_LENGTH,
    messageKey: 'validation.digits_only',
  },
};

export const isPatternKey = (value: string): value is PatternKey =>
  (PATTERN_KEYS as readonly string[]).includes(value);

/**
 * Whether a text matches a named pattern. The length is checked first against the smaller of the
 * field's cap and the pattern's own, so the expression never sees a long input.
 */
export function matchesPattern(
  key: PatternKey,
  text: string,
  maxLength = TEXT_MAX_LENGTH,
): boolean {
  const pattern = PATTERNS[key];
  if (text.length > Math.min(maxLength, pattern.maxLength)) return false;
  return pattern.regex.test(pattern.strip ? text.replace(pattern.strip, '') : text);
}
