import { describe, expect, it } from 'vitest';
import {
  BEN_NO_MAX,
  contactUpdateSchema,
  correctionRequestSchema,
  dismissalRequestSchema,
  formatBenNo,
  isBirthRegNumber,
  isNidNumber,
  lookupRequestSchema,
  mergeExecuteSchema,
  mergeRequestSchema,
  normalizeIdentityNumber,
  parseBenNo,
  personNameKey,
} from './index.js';

const PROJECT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const A = '0190a1b2-c3d4-7e5f-8a9b-00000000000a';
const B = '0190a1b2-c3d4-7e5f-8a9b-00000000000b';
const codes = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.message);

// The identity rules of the beneficiary master that the API checks and the app applies on input.
describe('identity numbers', () => {
  it('takes an NID of 10, 13 or 17 digits and a birth registration of 17 digits', () => {
    for (const nid of ['1000000001', '1000000000123', '19901234567890123'])
      expect(isNidNumber(nid), nid).toBe(true);
    for (const nid of ['123456789', '12345678901', '100000000012a', ''])
      expect(isNidNumber(nid), nid).toBe(false);
    expect(isBirthRegNumber('20261011000000001')).toBe(true);
    expect(isBirthRegNumber('2026101100000000')).toBe(false);
    expect(isBirthRegNumber('2026101100000000x')).toBe(false);
  });

  it('turns Bengali digits into English ones and drops spaces and hyphens as typed', () => {
    expect(normalizeIdentityNumber('১০০০ ০০০-০০১')).toBe('1000000001');
    expect(isNidNumber(normalizeIdentityNumber(' 1000-000-001 '))).toBe(true);
  });
});

describe('the BEN number', () => {
  it('shows BEN and seven digits, wider only past seven digits', () => {
    expect(formatBenNo(123)).toBe('BEN-0000123');
    expect(formatBenNo(1)).toBe('BEN-0000001');
    expect(formatBenNo(12345678)).toBe('BEN-12345678');
  });

  it('reads the forms an official types, in either case, with Bengali digits too', () => {
    for (const typed of ['BEN-0000123', 'ben-123', 'BEN123', ' Ben 0000123 ', 'BEN-০০০০১২৩'])
      expect(parseBenNo(typed), typed).toBe(123);
  });

  it('reads nothing else as a BEN number', () => {
    for (const typed of ['123', 'BEN-', 'BEN-0', 'BEN-12a', 'XBEN-1', `BEN-${BEN_NO_MAX + 1}`, ''])
      expect(parseBenNo(typed), typed).toBeNull();
  });
});

describe('the comparable name', () => {
  it('makes names that differ only in white space or letter case the same', () => {
    expect(personNameKey('\tমোছাঃ  রহিমা\nখাতুন \n')).toBe('মোছাঃ রহিমা খাতুন');
    expect(personNameKey(' Abdul  KARIM ')).toBe(personNameKey('abdul karim'));
    expect(personNameKey('আব্দুল করিম')).not.toBe(personNameKey('আব্দুর করিম'));
  });
});

describe('the request schemas', () => {
  it('looks up by exactly one of the NID and the birth registration', () => {
    expect(lookupRequestSchema.safeParse({ nid: '1000000001', projectId: PROJECT }).success).toBe(
      true,
    );
    expect(
      lookupRequestSchema.safeParse({ birthReg: '20261011000000001', projectId: PROJECT }).success,
    ).toBe(true);
    expect(codes(lookupRequestSchema.safeParse({ projectId: PROJECT }))).toContain(
      'beneficiary.identity_missing',
    );
    expect(
      lookupRequestSchema.safeParse({
        nid: '1000000001',
        birthReg: '20261011000000001',
        projectId: PROJECT,
      }).success,
    ).toBe(false);
    expect(codes(lookupRequestSchema.safeParse({ nid: '12345', projectId: PROJECT }))).toContain(
      'validation.nid_format',
    );
    expect(lookupRequestSchema.safeParse({ nid: '1000000001' }).success).toBe(false);
  });

  it('corrects a locked field with a valid new value and a reason', () => {
    const ok = { field: 'nid', newValue: '1000000002', reason: 'জাতীয় পরিচয়পত্রে ভুল ছিল' };
    expect(correctionRequestSchema.safeParse(ok).success).toBe(true);
    expect(codes(correctionRequestSchema.safeParse({ ...ok, newValue: '123' }))).toContain(
      'validation.nid_format',
    );
    expect(
      codes(correctionRequestSchema.safeParse({ ...ok, field: 'birth_reg', newValue: '123' })),
    ).toContain('validation.birth_reg_format');
    expect(
      correctionRequestSchema.safeParse({
        field: 'name',
        newValue: 'রহিমা খাতুন',
        reason: 'নামের বানান',
      }).success,
    ).toBe(true);
    expect(correctionRequestSchema.safeParse({ ...ok, field: 'mobile' }).success).toBe(false);
  });

  it('refuses a missing reason, a reason of white space only and a reason over 1,000 characters', () => {
    const base = { field: 'name', newValue: 'রহিমা খাতুন' };
    expect(correctionRequestSchema.safeParse(base).success).toBe(false);
    expect(correctionRequestSchema.safeParse({ ...base, reason: '     ' }).success).toBe(false);
    expect(correctionRequestSchema.safeParse({ ...base, reason: 'ক'.repeat(1001) }).success).toBe(
      false,
    );
    expect(
      dismissalRequestSchema.safeParse({ beneficiaryId: A, otherBeneficiaryId: B }).success,
    ).toBe(false);
  });

  it('edits only the contact data, and names a locked field as locked', () => {
    expect(
      contactUpdateSchema.safeParse({ mobile: '01712345678', village: 'চরপাড়া' }).success,
    ).toBe(true);
    expect(codes(contactUpdateSchema.safeParse({ name: 'অন্য নাম' }))).toContain(
      'beneficiary.locked_field',
    );
    expect(codes(contactUpdateSchema.safeParse({ nid: '1000000002' }))).toContain(
      'beneficiary.locked_field',
    );
    expect(contactUpdateSchema.safeParse({}).success).toBe(false);
    expect(contactUpdateSchema.safeParse({ mobile: '12345' }).success).toBe(false);
    expect(contactUpdateSchema.safeParse({ benNo: 7 }).success).toBe(false);
    // the four places of the address go together
    expect(contactUpdateSchema.safeParse({ unionId: A }).success).toBe(false);
  });

  it('merges two different profiles with a reason, and the kept one only from the pair', () => {
    expect(
      mergeRequestSchema.safeParse({ keptId: A, mergedId: B, reason: 'একই মানুষ' }).success,
    ).toBe(true);
    expect(
      mergeRequestSchema.safeParse({ keptId: A, mergedId: A, reason: 'একই মানুষ' }).success,
    ).toBe(false);
    expect(mergeExecuteSchema.safeParse({}).success).toBe(true);
    expect(mergeExecuteSchema.safeParse({ keptId: A }).success).toBe(true);
    expect(mergeExecuteSchema.safeParse({ keptId: 'x' }).success).toBe(false);
    expect(
      dismissalRequestSchema.safeParse({
        beneficiaryId: A,
        otherBeneficiaryId: A,
        reason: 'আলাদা মানুষ',
      }).success,
    ).toBe(false);
  });
});
