import { describe, expect, it } from 'vitest';
import { isUniqueViolation, isVolunteerMobileRefusal } from './db-errors';

describe('the database refusals recognised in a Prisma error', () => {
  it('sees a unique violation by the client code, the SQLSTATE, or a nested cause', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ meta: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ message: 'commit failed', cause: { originalCode: '23505' } })).toBe(
      true,
    );
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('sees the own-mobile refusal of the deferred trigger wherever its name lands', () => {
    expect(isVolunteerMobileRefusal({ message: 'beneficiary_mobile_is_volunteer_mobile' })).toBe(
      true,
    );
    expect(
      isVolunteerMobileRefusal({
        cause: {
          driverAdapterError: { originalMessage: 'x beneficiary_mobile_is_volunteer_mobile' },
        },
      }),
    ).toBe(true);
    expect(
      isVolunteerMobileRefusal({ meta: { detail: 'beneficiary_mobile_is_volunteer_mobile' } }),
    ).toBe(true);
    expect(isVolunteerMobileRefusal({ message: 'another trigger' })).toBe(false);
  });

  it('stops on an error whose causes form a cycle', () => {
    const error: Record<string, unknown> = { message: 'loop' };
    error.cause = error;
    expect(isUniqueViolation(error)).toBe(false);
  });
});
