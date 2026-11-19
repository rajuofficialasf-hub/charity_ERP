import { describe, expect, it } from 'vitest';
import {
  ownerTransferRequestSchema,
  permissionGrantRequestSchema,
  projectGrantRequestSchema,
  roleChangeRequestSchema,
} from './index.js';

// Request schemas of the access operations (docs/api/openapi.yaml, tag access).
describe('access request schemas', () => {
  const userId = '0190f5a0-0000-7000-8000-000000000001';

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
    // a test-only value, never a real password
    const password = 'Nadi kul 2026';
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
