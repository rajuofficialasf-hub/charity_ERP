import { describe, expect, it } from 'vitest';
import {
  invitationAcceptRequestSchema,
  jobIdSchema,
  looksLikeMobile,
  normalizeJobId,
  staffCreateRequestSchema,
  staffProfileRequestSchema,
} from './staff.js';

const profile = {
  jobId: 'asf-1023',
  displayName: 'আব্দুল করিম',
  designation: 'প্রজেক্ট এক্সিকিউটিভ',
  affiliation: 'department',
  affiliationUnit: null,
  homeProgramId: null,
  supervisorUserId: null,
};

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.message);

describe('job ID', () => {
  it('is stored in capitals with English digits and without surrounding spaces', () => {
    expect(normalizeJobId('  asf-১০২৩ ')).toBe('ASF-1023');
    expect(jobIdSchema.parse('css/hq.07_a')).toBe('CSS/HQ.07_A');
  });

  it('refuses spaces, other signs, a single character and more than 32 characters', () => {
    for (const bad of ['ASF 1023', 'ASF#1', 'A', `A${'1'.repeat(32)}`, '-ASF'])
      expect(issues(jobIdSchema.safeParse(bad)), bad).toContain('validation.job_id_format');
  });

  it('refuses a job ID that reads as a mobile number, so the login id stays unambiguous', () => {
    expect(looksLikeMobile('01712345678')).toBe(true);
    expect(looksLikeMobile('017-1234-5678')).toBe(true);
    expect(looksLikeMobile('8801712345678')).toBe(true);
    expect(looksLikeMobile('০১৭১২৩৪৫৬৭৮')).toBe(true);
    expect(looksLikeMobile('ASF-01712345678')).toBe(false);
    expect(issues(jobIdSchema.safeParse('017-1234-5678'))).toContain('validation.job_id_mobile');
    // a short number is a job ID like any other
    expect(jobIdSchema.parse('1023')).toBe('1023');
  });
});

describe('the official profile and the create request', () => {
  it('names the unit only for another department or an outside partner', () => {
    expect(staffProfileRequestSchema.safeParse(profile).success).toBe(true);
    expect(
      issues(staffProfileRequestSchema.safeParse({ ...profile, affiliationUnit: 'আইটি বিভাগ' })),
    ).toEqual(['validation.affiliation_unit']);
    expect(
      issues(staffProfileRequestSchema.safeParse({ ...profile, affiliation: 'external' })),
    ).toEqual(['validation.affiliation_unit']);
    expect(
      staffProfileRequestSchema.safeParse({
        ...profile,
        affiliation: 'foundation',
        affiliationUnit: 'আইটি বিভাগ',
      }).success,
    ).toBe(true);
  });

  it('takes no area for the account: an area comes from the projects', () => {
    const division = '0190a000-0000-7000-8000-000000000001';
    const create = {
      ...profile,
      email: 'karim@example.org',
      mobile: null,
      roleKey: 'project_executive',
    };
    expect(staffCreateRequestSchema.safeParse(create).success).toBe(true);
    for (const homeDivisionId of [division, null]) {
      expect(staffProfileRequestSchema.safeParse({ ...profile, homeDivisionId }).success).toBe(
        false,
      );
      expect(staffCreateRequestSchema.safeParse({ ...create, homeDivisionId }).success).toBe(false);
    }
  });

  it('needs an email and a role, lower-cases the email and leaves the language to the system default', () => {
    const parsed = staffCreateRequestSchema.parse({
      ...profile,
      email: 'Karim@Example.org',
      mobile: null,
      roleKey: 'project_executive',
    });
    expect(parsed).toMatchObject({ email: 'karim@example.org', jobId: 'ASF-1023' });
    expect(parsed.language).toBeUndefined();
    expect(
      staffCreateRequestSchema.safeParse({ ...profile, mobile: null, roleKey: 'x' }).success,
    ).toBe(false);
  });
});

describe('the set-password request', () => {
  it('takes a 43-character base64url token', () => {
    const token = 'A'.repeat(42) + '_';
    expect(invitationAcceptRequestSchema.safeParse({ token, password: 'Nadi 2026' }).success).toBe(
      true,
    );
    expect(
      issues(invitationAcceptRequestSchema.safeParse({ token: 'short', password: 'Nadi 2026' })),
    ).toEqual(['auth.invitation_invalid']);
  });
});
