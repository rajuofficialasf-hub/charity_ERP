import { describe, expect, it } from 'vitest';
import { permissionGrantRequestSchema, projectGrantRequestSchema } from './index.js';

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
