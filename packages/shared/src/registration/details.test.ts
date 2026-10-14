import { describe, expect, it } from 'vitest';
import {
  dateOfBirthSchema,
  emergencyContactSchema,
  interestAreasSchema,
  parseProfessionDetails,
  PROFESSION_FIELDS,
  PROFESSIONS,
  professionValueSchema,
  skillsValueSchema,
} from './details';

// The personal, profession and skills data (DECISION_LOG O-65, D-092; BR-246).
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe('the details of each profession', () => {
  const OWN: Record<(typeof PROFESSIONS)[number], Record<string, unknown>> = {
    student: {
      educationMedium: 'qawmi',
      institutionName: 'নমুনা মাদ্রাসা',
      currentClass: 'দাওরা',
      subject: 'হাদিস',
      institutionLocation: 'সাভার, ঢাকা',
    },
    teacher: {
      institutionType: 'school',
      institutionNameAddress: 'নমুনা স্কুল, সাভার',
      designation: 'সহকারী শিক্ষক',
      teachingSubject: 'গণিত',
    },
    imam: {
      role: 'imam',
      mosqueName: 'নমুনা জামে মসজিদ',
      mosqueType: 'jame',
      mosqueAddress: 'নমুনা গ্রাম, সাভার',
    },
    businessman: {
      businessName: 'নমুনা স্টোর',
      businessType: 'retail',
      businessAddress: 'সাভার বাজার',
    },
    job_seeker: {
      highestQualification: 'স্নাতক',
      skills: 'কম্পিউটার',
      fullTimeAvailable: true,
    },
    service_holder: {
      sector: 'ব্যাংকার',
      organization: 'নমুনা ব্যাংক',
      designation: 'অফিসার',
      workplaceLocation: 'ঢাকা',
    },
  };

  it('accepts the own fields of every profession and keeps them', () => {
    for (const profession of PROFESSIONS) {
      const parsed = parseProfessionDetails(profession, OWN[profession]);
      expect(parsed, profession).toEqual({ success: true, data: OWN[profession] });
      expect(Object.keys(OWN[profession]).sort(), profession).toEqual(
        [...PROFESSION_FIELDS[profession]].sort(),
      );
    }
  });

  it('refuses a field of another profession, so a stale value after a change of choice is not stored', () => {
    for (const profession of PROFESSIONS)
      for (const other of PROFESSIONS) {
        if (other === profession) continue;
        const foreign = Object.keys(OWN[other]).find(
          (k) => !PROFESSION_FIELDS[profession].includes(k),
        )!;
        expect(
          parseProfessionDetails(profession, { [foreign]: OWN[other][foreign] }).success,
          `${profession} with ${foreign}`,
        ).toBe(false);
      }
  });

  it('allows no details at all, drops blank texts and refuses an option outside its list', () => {
    expect(parseProfessionDetails('student', undefined)).toEqual({ success: true, data: {} });
    expect(parseProfessionDetails('teacher', { designation: '   ' })).toEqual({
      success: true,
      data: {},
    });
    expect(parseProfessionDetails('student', { educationMedium: 'other' }).success).toBe(false);
    expect(parseProfessionDetails('imam', { mosqueType: 'masjid' }).success).toBe(false);
    expect(parseProfessionDetails('job_seeker', { fullTimeAvailable: 'yes' }).success).toBe(false);
  });

  it('refuses a text over its maximum', () => {
    expect(parseProfessionDetails('student', { institutionName: 'ক'.repeat(201) }).success).toBe(
      false,
    );
    expect(
      parseProfessionDetails('teacher', { institutionNameAddress: 'ক'.repeat(401) }).success,
    ).toBe(false);
  });
});

describe('the profession as one edit value', () => {
  it('checks the details against the schema of the chosen profession only', () => {
    expect(
      professionValueSchema.parse({ profession: 'teacher', details: { designation: ' প্রভাষক ' } }),
    ).toEqual({ profession: 'teacher', details: { designation: 'প্রভাষক' } });
    expect(professionValueSchema.parse({ profession: 'student' })).toEqual({
      profession: 'student',
      details: {},
    });
    const wrong = professionValueSchema.safeParse({
      profession: 'student',
      details: { designation: 'প্রভাষক' },
    });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0]?.path.slice(0, 1)).toEqual(['details']);
  });

  it('refuses an unknown profession, also the names every object inherits', () => {
    for (const profession of ['pilot', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])
      expect(ok(professionValueSchema, { profession, details: {} }), profession).toBe(false);
  });

  it('refuses an extra key next to the profession and the details', () => {
    expect(ok(professionValueSchema, { profession: 'imam', details: {}, extra: 1 })).toBe(false);
  });
});

describe('the skills, the emergency contact and the personal values', () => {
  it('skills: the interest areas are unique options, the rest are fixed lists and a yes or no', () => {
    expect(
      ok(skillsValueSchema, {
        interestAreas: ['field_relief', 'media'],
        vehicle: 'motorcycle',
        canSwim: true,
        availability: 'holidays',
      }),
    ).toBe(true);
    expect(ok(skillsValueSchema, {})).toBe(true);
    expect(ok(skillsValueSchema, { interestAreas: ['cooking'] })).toBe(false);
    expect(ok(interestAreasSchema, ['media', 'media'])).toBe(false);
    expect(ok(skillsValueSchema, { vehicle: 'car' })).toBe(false);
    expect(ok(skillsValueSchema, { canSwim: 'yes' })).toBe(false);
    expect(ok(skillsValueSchema, { availability: 'never' })).toBe(false);
    expect(ok(skillsValueSchema, { other: true })).toBe(false);
  });

  it('emergency contact: a name and a Bangladeshi mobile, both optional', () => {
    expect(ok(emergencyContactSchema, { name: 'নমুনা অভিভাবক', mobile: '01712345678' })).toBe(true);
    expect(ok(emergencyContactSchema, {})).toBe(true);
    expect(ok(emergencyContactSchema, { mobile: '0171234' })).toBe(false);
    expect(ok(emergencyContactSchema, { name: 'ক'.repeat(201) })).toBe(false);
    expect(ok(emergencyContactSchema, { name: 'x', phone: '01712345678' })).toBe(false);
  });

  it('date of birth: a real date, not in the future, not before 1900', () => {
    expect(ok(dateOfBirthSchema, '1990-05-17')).toBe(true);
    expect(ok(dateOfBirthSchema, '2999-01-01')).toBe(false);
    expect(ok(dateOfBirthSchema, '1899-12-31')).toBe(false);
    expect(ok(dateOfBirthSchema, '1990-02-30')).toBe(false);
    expect(ok(dateOfBirthSchema, '17-05-1990')).toBe(false);
    expect(dateOfBirthSchema.safeParse('2999-01-01').error?.issues[0]?.message).toBe(
      'validation.date_future',
    );
  });
});
