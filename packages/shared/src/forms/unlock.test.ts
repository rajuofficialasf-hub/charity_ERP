import { describe, expect, it } from 'vitest';
import { unlockDecisionSchema, unlockOpenSchema, unlockRefusal } from './unlock.js';

describe('the field unlock rules', () => {
  it('opens text, number, choice, date and address answers, never the identity, photos or files', () => {
    for (const type of [
      'short_text',
      'number',
      'radio',
      'multi_select',
      'date',
      'bd_address',
    ] as const)
      expect(unlockRefusal({ type }), type).toBeNull();
    for (const column of ['nid_or_birth_reg', 'name', 'father_or_husband_name'])
      expect(unlockRefusal({ type: 'short_text', standardColumn: column })).toBe('identity');
    expect(unlockRefusal({ type: 'short_text', standardColumn: 'village,name' })).toBe('identity');
    expect(unlockRefusal({ type: 'phone', standardColumn: 'mobile' })).toBeNull();
    for (const type of [
      'photo',
      'file',
      'signature',
      'gps',
      'calculation',
      'repeat_group',
    ] as const)
      expect(unlockRefusal({ type }), type).toBe('type');
    // a read-only answer takes its value only from its default or calculation
    expect(unlockRefusal({ type: 'short_text', settings: { read_only: true } })).toBe('type');
  });

  it('asks a reason to open and to send a value back, none to accept it', () => {
    expect(unlockOpenSchema.safeParse({ fieldKey: 'q_village', reason: 'ভুল' }).success).toBe(true);
    expect(unlockOpenSchema.safeParse({ fieldKey: 'q_village' }).success).toBe(false);
    expect(unlockDecisionSchema.safeParse({ decision: 'accept' }).success).toBe(true);
    expect(unlockDecisionSchema.safeParse({ decision: 'refuse' }).success).toBe(false);
    expect(unlockDecisionSchema.safeParse({ decision: 'refuse', reason: 'মেলেনি' }).success).toBe(
      true,
    );
  });
});
