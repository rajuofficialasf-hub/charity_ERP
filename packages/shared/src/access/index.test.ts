import { describe, expect, it } from 'vitest';
import {
  extraAreaRequestSchema,
  ownerTransferRequestSchema,
  permissionGrantRequestSchema,
  projectGrantRequestSchema,
  roleChangeRequestSchema,
} from './index.js';

// Request schemas of the access operations (docs/api/openapi.yaml, tag access).
describe('access request schemas', () => {
  const userId = '0190f5a0-0000-7000-8000-000000000001';

  it('takes an extra area as a location or the whole country, with a reason of three letters', () => {
    const locationId = '0190f5a0-0000-7000-8000-000000000002';
    // the whole country is off unless it is asked for
    expect(extraAreaRequestSchema.parse({ locationId, reason: '  ত্রাণের প্রস্তুতি  ' })).toEqual({
      locationId,
      wholeCountry: false,
      reason: 'ত্রাণের প্রস্তুতি',
    });
    expect(
      extraAreaRequestSchema.parse({ wholeCountry: true, reason: 'জাতীয় সমন্বয়' }).wholeCountry,
    ).toBe(true);
    for (const bad of [
      { locationId, reason: 'না' },
      { locationId: 'dhaka', reason: 'ত্রাণের প্রস্তুতি' },
      { locationId, reason: 'ত্রাণের প্রস্তুতি', userId },
      { locationId },
    ])
      expect(extraAreaRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it('accepts a panel grant and trims the reason', () => {
    const parsed = permissionGrantRequestSchema.parse({
      userId,
      permission: 'permission.view',
      effect: 'grant',
      scopeType: 'GLOBAL',
      reason: '  Monitoring help  ',
      expiresAt: '2027-01-01T00:00:00Z',
    });
    expect(parsed.reason).toBe('Monitoring help');
  });

  it('refuses an unknown scope, a short reason and a malformed expiry', () => {
    const base = { userId, permission: 'permission.view', effect: 'grant', reason: 'Long enough' };
    expect(permissionGrantRequestSchema.safeParse({ ...base, scopeType: 'COUNTRY' }).success).toBe(
      false,
    );
    expect(
      permissionGrantRequestSchema.safeParse({ ...base, scopeType: 'GLOBAL', reason: ' ab ' })
        .success,
    ).toBe(false);
    expect(
      permissionGrantRequestSchema.safeParse({
        ...base,
        scopeType: 'GLOBAL',
        expiresAt: 'tomorrow',
      }).success,
    ).toBe(false);
  });

  it('takes a role change with its reason trimmed, and nothing beside the two fields', () => {
    expect(
      roleChangeRequestSchema.parse({ roleKey: 'program_manager', reason: '  New post  ' }),
    ).toEqual({ roleKey: 'program_manager', reason: 'New post' });
    for (const body of [
      { roleKey: 'program_manager', reason: ' ab ' },
      { roleKey: '', reason: 'New post' },
      { reason: 'New post' },
      { roleKey: 'program_manager', reason: 'New post', userId },
    ])
      expect(roleChangeRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
  });

  it('takes a Main Admin transfer to a user id with a password, and nothing else', () => {
    // twelve letters stand in for what the person types; no real value is written here
    const password = 'a'.repeat(12);
    expect(ownerTransferRequestSchema.safeParse({ toUserId: userId, password }).success).toBe(true);
    for (const body of [
      { toUserId: 'someone', password },
      { toUserId: userId, password: '' },
      { toUserId: userId },
      { toUserId: userId, password, reason: 'Hand-over' },
    ])
      expect(ownerTransferRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
  });

  it('needs a list of permissions for a project grant', () => {
    expect(
      projectGrantRequestSchema.safeParse({
        userId,
        permissions: 'application.approve',
        reason: 'Help',
      }).success,
    ).toBe(false);
  });
});
