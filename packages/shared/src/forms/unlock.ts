import { z } from 'zod';
import { reasonRequestSchema } from '../auth/schemas.js';
import type { FieldType } from './library.js';

/**
 * The field unlock of an approved application: one answer is opened by an official with a reason,
 * filled by the volunteer who owns the application (or by an official when it has none, or when
 * the answer belongs to the official section), and decided by an official who did not fill it.
 */

/** The answers an unlock may open: text, number, choice, date and address (photos and files wait). */
export const UNLOCKABLE_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'decimal',
  'money',
  'phone',
  'email',
  'date',
  'time',
  'datetime',
  'single_select',
  'multi_select',
  'radio',
  'checkbox',
  'bd_address',
] as const satisfies readonly FieldType[];

/**
 * The identity a profile correction request changes, never an unlock: the identity number, the
 * name and the father's or husband's name.
 */
export const UNLOCK_LOCKED_COLUMNS = [
  'nid_or_birth_reg',
  'name',
  'father_or_husband_name',
] as const;

/** Why an answer cannot be opened, or null when it can. */
export function unlockRefusal(field: {
  type: FieldType;
  standardColumn?: string | null;
}): 'identity' | 'type' | null {
  if (
    field.standardColumn &&
    (UNLOCK_LOCKED_COLUMNS as readonly string[]).includes(field.standardColumn)
  )
    return 'identity';
  return (UNLOCKABLE_FIELD_TYPES as readonly string[]).includes(field.type) ? null : 'type';
}

/** The steps of an unlock: open, the value entered and waiting, and locked again. */
export const UNLOCK_STATES = ['open', 'updated', 'relocked'] as const;
export type UnlockState = (typeof UNLOCK_STATES)[number];
/** How an unlock ended: the value accepted, refused, or the unlock cancelled before a decision. */
export const UNLOCK_DECISIONS = ['accepted', 'refused', 'cancelled'] as const;
export type UnlockDecision = (typeof UNLOCK_DECISIONS)[number];

const reason = reasonRequestSchema.shape.reason;

/** Opens one answer of an approved application, saying why. */
export const unlockOpenSchema = z.strictObject({
  fieldKey: z.string().min(1).max(100),
  /** The row of a repeat group; 0 for every other answer. */
  repeatIndex: z.number().int().min(0).max(199).default(0),
  reason,
});
export type UnlockOpen = z.infer<typeof unlockOpenSchema>;

/**
 * The new value of an open answer, in the shape of an answer value (`{ t, v }`); the engine checks
 * it like any answer of its question and names what it refuses, as the answers of an edit.
 */
export const unlockValueSchema = z.strictObject({ value: z.record(z.string(), z.unknown()) });
export type UnlockValue = z.infer<typeof unlockValueSchema>;

/** The decision on an entered value; a refusal says why. */
export const unlockDecisionSchema = z
  .strictObject({ decision: z.enum(['accept', 'refuse']), reason: reason.optional() })
  .refine((d) => d.decision === 'accept' || d.reason !== undefined, {
    path: ['reason'],
    message: 'validation.required',
  });
export type UnlockDecisionRequest = z.infer<typeof unlockDecisionSchema>;

/** The cancel of an open unlock before a decision, saying why; the old value stays. */
export const unlockCancelSchema = z.strictObject({ reason });
export type UnlockCancel = z.infer<typeof unlockCancelSchema>;
