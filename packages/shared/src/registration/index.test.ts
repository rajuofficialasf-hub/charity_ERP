import { describe, expect, it } from 'vitest';
import {
  draftExpiry,
  lookupsLeft,
  REGISTRATION_RULES,
  registrationStartRequestSchema,
} from './index';

describe('registration draft rules (DECISION_LOG D-082, D-088)', () => {
  it('a draft expires 24 hours after its start or verification', () => {
    const at = new Date('2026-10-12T10:00:00Z');
    expect(draftExpiry(at).toISOString()).toBe('2026-10-13T10:00:00.000Z');
    expect(REGISTRATION_RULES.draftLifeMs).toBe(86_400_000);
  });

  it('counts the reference lookups left and never goes below zero', () => {
    expect(lookupsLeft(0)).toBe(5);
    expect(lookupsLeft(4)).toBe(1);
    expect(lookupsLeft(5)).toBe(0);
    expect(lookupsLeft(9)).toBe(0);
  });

  it('the start request lower-cases the email and defaults to a volunteer', () => {
    expect(
      registrationStartRequestSchema.parse({ mobile: '01712345678', email: 'A@Example.org' }),
    ).toEqual({ mobile: '01712345678', email: 'a@example.org', kind: 'volunteer' });
    expect(
      registrationStartRequestSchema.safeParse({ mobile: '0171234567', email: 'a@example.org' })
        .success,
    ).toBe(false);
  });
});
