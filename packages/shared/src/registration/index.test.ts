import { describe, expect, it } from 'vitest';
import { bn, en } from '../i18n/catalogue.js';
import { createTranslator } from '../i18n/translate.js';
import {
  decisionRequestSchema,
  EDIT_FIELD_VALUES,
  CORRECTION_FIELDS,
  EDIT_FIELDS,
  PHOTO_FIELDS,
  REQUEST_FIELD_LABEL,
  STAFF_EDIT_FIELDS,
  draftExpiry,
  editRequestCreateSchema,
  otpSendRequestSchema,
  otpVerifyRequestSchema,
  REGISTRATION_RULES,
  registrationStartRequestSchema,
  registrationCorrectionCreateSchema,
  registrationSubmitRequestSchema,
  staffDecisionSchema,
} from './index';

describe('registration draft rules', () => {
  it('a draft expires 24 hours after its start or verification', () => {
    const at = new Date('2026-10-12T10:00:00Z');
    expect(draftExpiry(at).toISOString()).toBe('2026-10-13T10:00:00.000Z');
    expect(REGISTRATION_RULES.draftLifeMs).toBe(86_400_000);
  });

  it('the start names only the kind and defaults to a volunteer', () => {
    expect(registrationStartRequestSchema.parse({})).toEqual({ kind: 'volunteer' });
    expect(registrationStartRequestSchema.safeParse({ mobile: '01712345678' }).success).toBe(false);
  });

  it('a send takes the address of its channel; the email is lower-cased', () => {
    const id = '01890000-0000-7000-8000-000000000001';
    expect(
      otpSendRequestSchema.parse({
        registrationId: id,
        channel: 'email',
        address: 'A@Example.org',
      }),
    ).toEqual({ registrationId: id, channel: 'email', address: 'a@example.org' });
    expect(
      otpSendRequestSchema.safeParse({ registrationId: id, channel: 'sms', address: 'a@b.org' })
        .success,
    ).toBe(false);
    expect(
      otpSendRequestSchema.safeParse({ registrationId: id, channel: 'sms', address: '0171234567' })
        .success,
    ).toBe(false);
    expect(
      otpVerifyRequestSchema.parse({ registrationId: id, channel: 'sms', code: '123456' }),
    ).toEqual({ registrationId: id, channel: 'sms', code: '123456' });
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
    divisionId: uuid,
    districtId: uuid,
    upazilaId: uuid,
    unionId: uuid,
    profession: 'student',
  };
  const staff = {
    kind: 'staff',
    registrationId: uuid,
    password: 'Nadi kul 2026',
    name: 'নমুনা কর্মকর্তা',
    designation: 'Project Officer',
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

  it('accepts the full form with the personal, profession and skills details as nested objects', () => {
    expect(
      issues({
        ...volunteer,
        whatsapp: '01712345678',
        dateOfBirth: '1990-05-17',
        bloodGroup: 'O+',
        tshirtSize: 'L',
        volunteeringArea: 'own_upazila',
        profession: 'teacher',
        professionDetails: { institutionType: 'madrasa', designation: 'মুদাররিস' },
        interestAreas: ['field_relief', 'first_aid'],
        vehicle: 'bicycle',
        canSwim: true,
        availability: 'on_call',
        emergencyFullTime: true,
        facebookId: 'https://www.facebook.com/nomuna.name',
        educationDetails: {
          highestQualification: 'masters',
          institutionName: 'নমুনা বিশ্ববিদ্যালয়',
          subject: 'ইতিহাস',
          passingYear: 2018,
          result: 'CGPA 3.80',
          status: 'completed',
        },
        permanentAddress: {
          divisionId: uuid,
          districtId: uuid,
          upazilaId: uuid,
          unionId: uuid,
          addressLine: 'নমুনা গ্রাম',
        },
      }),
    ).toEqual([]);
  });

  it('needs the profession and checks its details against that profession only', () => {
    const { profession: _, ...noProfession } = volunteer;
    expect(issues(noProfession).map(([p]) => p)).toEqual(['profession']);
    expect(issues({ ...volunteer, profession: 'pilot' }).map(([p]) => p)).toEqual(['profession']);
    expect(issues({ ...volunteer, profession: 'student', professionDetails: {} })).toEqual([]);
    expect(
      issues({ ...volunteer, profession: 'student', professionDetails: { designation: 'X' } }).map(
        ([p]) => p,
      ),
    ).toEqual(['professionDetails']);
    for (const profession of ['__proto__', 'constructor'])
      expect(issues({ ...volunteer, profession }).length, profession).toBeGreaterThan(0);
  });

  it('checks the personal values, the Facebook link, the education and the permanent address', () => {
    for (const bad of [
      { bloodGroup: 'C+' },
      { tshirtSize: 'XXXL' },
      { dateOfBirth: '2999-01-01' },
      { volunteeringArea: 'abroad' },
      { facebookId: 'nomuna.name' },
      { facebookId: 'http://www.facebook.com/nomuna' },
      { educationDetails: { highestQualification: 'everything' } },
      { interestAreas: ['cooking'] },
    ])
      expect(issues({ ...volunteer, ...bad }).length, JSON.stringify(bad)).toBe(1);
  });

  it('needs the four levels of the permanent address', () => {
    expect(issues({ ...volunteer, permanentAddress: { divisionId: uuid } }).length).toBeGreaterThan(
      0,
    );
  });

  it('checks the NID format', () => {
    expect(issues({ ...volunteer, nid: '12345' })).toEqual([['nid', 'validation.nid_format']]);
  });

  it('refuses what the owner removed from the registration: type, reference, bank, program, workplace', () => {
    for (const extra of [
      { type: 'general' },
      { type: 'paid' },
      { referenceNid: '1000000000999' },
      { bank: { bankName: 'Test Bank' } },
      // covered by the profession part, then by the education section, or not asked any more
      { experience: 'ব্যাংকে কাজ' },
      { workDescription: 'শিক্ষকতা' },
      { education: 'স্নাতক' },
      { previousProjects: 'আগের প্রজেক্ট' },
      { emergencyContact: { name: 'অভিভাবক' } },
    ])
      expect(issues({ ...volunteer, ...extra }).length, JSON.stringify(extra)).toBe(1);
    for (const extra of [{ homeProgramId: uuid }, { homeDivisionId: uuid }])
      expect(issues({ ...staff, ...extra }).length, JSON.stringify(extra)).toBe(1);
  });
});

describe('the correction and staff decision schemas', () => {
  const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
    schema.safeParse(v).success;

  it('a correction names 1 to 40 known fields with a note of 3 to 1000 characters', () => {
    expect(ok(registrationCorrectionCreateSchema, { fields: ['name'], note: 'ঠিক করুন' })).toBe(
      true,
    );
    expect(ok(registrationCorrectionCreateSchema, { fields: [], note: 'ঠিক করুন' })).toBe(false);
    expect(ok(registrationCorrectionCreateSchema, { fields: ['password'], note: 'ঠিক করুন' })).toBe(
      false,
    );
    expect(
      ok(registrationCorrectionCreateSchema, { fields: Array(41).fill('name'), note: 'ঠিক করুন' }),
    ).toBe(false);
    expect(ok(registrationCorrectionCreateSchema, { fields: ['name'], note: 'ok' })).toBe(false);
  });

  it('a staff approval needs a role and a rejection a reason', () => {
    expect(ok(staffDecisionSchema, { decision: 'approve', roleKey: 'project_executive' })).toBe(
      true,
    );
    expect(ok(staffDecisionSchema, { decision: 'approve' })).toBe(false);
    expect(ok(staffDecisionSchema, { decision: 'reject' })).toBe(false);
    expect(ok(staffDecisionSchema, { decision: 'reject', reason: 'পদ নেই' })).toBe(true);
  });
});

describe('the edit request schemas', () => {
  const ok = (v: unknown) => editRequestCreateSchema.safeParse(v).success;

  it('checks the value of each editable field: text, address object, bank object, file id, contact', () => {
    expect(ok({ field: 'education', newValue: 'স্নাতক' })).toBe(true);
    expect(ok({ field: 'nid', newValue: '1000000000123' })).toBe(true);
    expect(ok({ field: 'mobile', newValue: '01712345678' })).toBe(true);
    expect(ok({ field: 'email', newValue: 'A@example.org' })).toBe(true);
    expect(ok({ field: 'photo' })).toBe(true);
    expect(ok({ field: 'education' })).toBe(false);
    expect(ok({ field: 'category', newValue: 'A' })).toBe(false);
  });

  it('the new profile fields are editable: single values and the grouped profession, skills, education and permanent address', () => {
    for (const field of [
      'bloodGroup',
      'dateOfBirth',
      'tshirtSize',
      'volunteeringArea',
      'profession',
      'skills',
      'educationDetails',
      'permanentAddress',
    ])
      expect(EDIT_FIELDS, field).toContain(field);
    expect(EDIT_FIELDS).not.toContain('emergencyContact');
    const good = (field: keyof typeof EDIT_FIELD_VALUES, value: unknown) =>
      EDIT_FIELD_VALUES[field].safeParse(value).success;
    expect(good('bloodGroup', 'AB-')).toBe(true);
    expect(good('bloodGroup', 'Z+')).toBe(false);
    expect(good('dateOfBirth', '1985-01-31')).toBe(true);
    expect(good('dateOfBirth', 'yesterday')).toBe(false);
    expect(good('tshirtSize', 'M')).toBe(true);
    expect(good('volunteeringArea', 'anywhere')).toBe(true);
    expect(good('profession', { profession: 'imam', details: { role: 'khatib' } })).toBe(true);
    expect(good('profession', { profession: 'imam', details: { sector: 'x' } })).toBe(false);
    expect(good('skills', { interestAreas: ['media'], canSwim: false })).toBe(true);
    expect(good('skills', { canSwim: 'no' })).toBe(false);
    expect(good('skills', { emergencyFullTime: true })).toBe(true);
    expect(good('educationDetails', { highestQualification: 'hsc', passingYear: 2012 })).toBe(true);
    expect(good('educationDetails', { passingYear: 1900 })).toBe(false);
    const place = '01890000-0000-7000-8000-000000000001';
    const chain = { divisionId: place, districtId: place, upazilaId: place, unionId: place };
    expect(good('permanentAddress', { ...chain, addressLine: 'নমুনা গ্রাম' })).toBe(true);
    expect(good('permanentAddress', { divisionId: place })).toBe(false);
    expect(good('facebookId', 'https://fb.me/nomuna')).toBe(true);
    expect(good('facebookId', 'nomuna')).toBe(false);
    // the old work texts stay editable for the volunteers that have them
    expect(good('experience', 'ব্যাংকে কাজ')).toBe(true);
  });

  it('a refusal needs a reason', () => {
    expect(decisionRequestSchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(decisionRequestSchema.safeParse({ decision: 'reject' }).success).toBe(false);
    expect(
      decisionRequestSchema.safeParse({ decision: 'reject', reason: 'প্রমাণ নেই' }).success,
    ).toBe(true);
  });
});

describe('REQUEST_FIELD_LABEL', () => {
  it('names every field a correction or edit request may name, in bn and en', () => {
    const missing: string[] = [];
    const translator = createTranslator({ bn, en }, (key, locale) =>
      missing.push(`${locale}:${key}`),
    );
    for (const field of [
      ...new Set([...CORRECTION_FIELDS, ...EDIT_FIELDS, ...PHOTO_FIELDS, ...STAFF_EDIT_FIELDS]),
    ]) {
      expect(Object.hasOwn(REQUEST_FIELD_LABEL, field), field).toBe(true);
      const key = `registration.${REQUEST_FIELD_LABEL[field as keyof typeof REQUEST_FIELD_LABEL]}`;
      translator('bn', key);
      translator('en', key);
    }
    expect(missing).toEqual([]);
  });
});
