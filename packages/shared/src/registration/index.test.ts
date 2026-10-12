import { describe, expect, it } from 'vitest';
import { draftExpiry, REGISTRATION_RULES, registrationStartRequestSchema } from './index';

describe('registration draft rules', () => {
  it('a draft expires 24 hours after its start or verification', () => {
    const at = new Date('2026-10-12T10:00:00Z');
    expect(draftExpiry(at).toISOString()).toBe('2026-10-13T10:00:00.000Z');
    expect(REGISTRATION_RULES.draftLifeMs).toBe(86_400_000);
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
