import { describe, expect, it } from 'vitest';
import {
  isForeignKeyViolation,
  isUniqueViolation,
  isUniqueViolationOf,
  isVolunteerMobileRefusal,
} from './db-errors';

describe('the database refusals recognised in a Prisma error', () => {
  it('sees a foreign-key refusal by the client code, the SQLSTATE, or a nested cause', () => {
    expect(isForeignKeyViolation({ code: 'P2003' })).toBe(true);
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
    expect(isForeignKeyViolation({ meta: { code: '23503' } })).toBe(true);
    expect(isForeignKeyViolation({ message: 'commit', cause: { originalCode: '23503' } })).toBe(
      true,
    );
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
  });

  it('tells which unique index refused the row', () => {
    const error = {
      code: 'P2002',
      message: 'Unique constraint failed on applications_project_id_beneficiary_id_key',
    };
    expect(isUniqueViolationOf(error, 'applications_project_id_beneficiary_id_key')).toBe(true);
    expect(isUniqueViolationOf(error, 'applications_app_no_key')).toBe(false);
    expect(
      isUniqueViolationOf(
        { code: 'P2002', meta: { target: ['applications_app_no_key'] } },
        'applications_app_no_key',
      ),
    ).toBe(true);
  });

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
