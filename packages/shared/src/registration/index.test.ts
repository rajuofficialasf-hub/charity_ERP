import { describe, expect, it } from 'vitest';
import {
  draftExpiry,
  REGISTRATION_RULES,
  registrationStartRequestSchema,
  registrationSubmitRequestSchema,
} from './index';

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

describe('the registration submit schemas', () => {
  const uuid = '01890000-0000-7000-8000-000000000001';
  const volunteer = {
    kind: 'volunteer',
    registrationId: uuid,
    password: 'Nadi kul 2026',
    name: 'নমুনা নাম',
    fatherName: 'নমুনা পিতা',
    motherName: 'নমুনা মাতা',
    nid: '1000000000123',
    type: 'general',
    divisionId: uuid,
    districtId: uuid,
    upazilaId: uuid,
    unionId: uuid,
  };
  const staff = {
    kind: 'staff',
    registrationId: uuid,
    password: 'Nadi kul 2026',
    name: 'নমুনা কর্মকর্তা',
    designation: 'Project Officer',
    homeProgramId: uuid,
    homeDivisionId: uuid,
  };
  const issues = (value: unknown) =>
    registrationSubmitRequestSchema
      .safeParse(value)
      .error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];

  it('accepts a complete volunteer form and a complete staff form', () => {
    expect(issues(volunteer)).toEqual([]);
    expect(issues(staff)).toEqual([]);
  });

  it('requires the fields of each kind and refuses the fields of the other kind', () => {
    const { fatherName: _, ...noFather } = volunteer;
    expect(issues(noFather).map(([p]) => p)).toEqual(['fatherName']);
    expect(issues({ ...volunteer, name: '   ' })).toEqual([['name', 'validation.required']]);
    const { designation: __, ...noDesignation } = staff;
    expect(issues(noDesignation).map(([p]) => p)).toEqual(['designation']);
    expect(issues({ ...staff, nid: '1000000000123' }).length).toBe(1);
  });

  it('checks the NID format', () => {
    expect(issues({ ...volunteer, nid: '12345' })).toEqual([['nid', 'validation.nid_format']]);
  });

  it('a team member needs the reference NID of the main volunteer', () => {
    expect(issues({ ...volunteer, type: 'team_member' })).toEqual([
      ['referenceNid', 'validation.required'],
    ]);
    expect(issues({ ...volunteer, type: 'team_member', referenceNid: '1000000000999' })).toEqual(
      [],
    );
  });
});
