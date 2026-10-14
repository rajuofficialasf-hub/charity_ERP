import { describe, expect, it } from 'vitest';
import { checkStep, EMPTY_VALUES, stepOf, STEPS, submitBody } from './form-state';
import { professionDetailsOf, professionValue, skillsValue } from './ProfileInputs';

// The steps and the submit body of the volunteer form (DECISION_LOG O-65, D-092; BR-246).
const ID = '01900000-0000-7000-8000-0000000000aa';

describe('the volunteer steps', () => {
  it('has seven steps with the contacts first and the photos last', () => {
    expect(STEPS.volunteer).toEqual([
      'contact',
      'identity',
      'address',
      'profession',
      'skills',
      'account',
      'photos',
    ]);
    expect(STEPS.staff).toEqual(['contact', 'account', 'photos']);
  });

  it('checks the date of birth and the emergency mobile of their own steps', () => {
    const v = { ...EMPTY_VALUES, motherName: 'Mother', nid: '1000000000555' };
    expect(checkStep('identity', 'volunteer', v)).toEqual({});
    expect(checkStep('identity', 'volunteer', { ...v, dateOfBirth: '1990-05-17' })).toEqual({});
    expect(checkStep('identity', 'volunteer', { ...v, dateOfBirth: '2999-01-01' })).toEqual({
      dateOfBirth: 'errors.validation.date_future',
    });
    expect(checkStep('identity', 'volunteer', { ...v, dateOfBirth: '1990-02-30' })).toEqual({
      dateOfBirth: 'errors.validation.date_format',
    });
    expect(checkStep('identity', 'volunteer', { ...v, dateOfBirth: '1899-01-01' })).toEqual({
      dateOfBirth: 'errors.validation.date_format',
    });
    expect(checkStep('skills', 'volunteer', EMPTY_VALUES)).toEqual({});
    expect(
      checkStep('skills', 'volunteer', {
        ...EMPTY_VALUES,
        emergency: { name: '', mobile: '12345' },
      }),
    ).toEqual({ 'emergencyContact.mobile': 'errors.validation.mobile_format' });
  });

  it('needs the address down to the union and a profession, nothing else of the new data', () => {
    expect(Object.keys(checkStep('address', 'volunteer', EMPTY_VALUES)).sort()).toEqual([
      'districtId',
      'divisionId',
      'unionId',
      'upazilaId',
    ]);
    expect(checkStep('profession', 'volunteer', EMPTY_VALUES)).toEqual({
      profession: 'errors.validation.required',
    });
    expect(
      checkStep('profession', 'volunteer', {
        ...EMPTY_VALUES,
        profession: { profession: 'student', details: {} },
      }),
    ).toEqual({});
  });

  it('shows a refused field on its own step', () => {
    const at = (field: string) => STEPS.volunteer[stepOf('volunteer', field)];
    expect(at('nid')).toBe('identity');
    expect(at('dateOfBirth')).toBe('identity');
    expect(at('unionId')).toBe('address');
    expect(at('volunteeringArea')).toBe('address');
    expect(at('profession')).toBe('profession');
    expect(at('professionDetails.designation')).toBe('profession');
    expect(at('education')).toBe('profession');
    expect(at('interestAreas')).toBe('skills');
    expect(at('emergencyContact.mobile')).toBe('skills');
    expect(at('password')).toBe('account');
  });
});

describe('the profession and skills values', () => {
  it('keeps only the fields of the chosen profession, drops blanks and turns yes or no into a boolean', () => {
    expect(
      professionDetailsOf({
        profession: 'job_seeker',
        details: {
          highestQualification: ' BA ',
          skills: '',
          fullTimeAvailable: 'yes',
          // left over from another profession
          designation: 'Lecturer',
        },
      }),
    ).toEqual({ highestQualification: 'BA', fullTimeAvailable: true });
    expect(professionDetailsOf({ profession: '', details: { designation: 'x' } })).toEqual({});
    expect(
      professionValue({ profession: 'imam', details: { mosqueName: 'M', role: 'khatib' } }),
    ).toEqual({ profession: 'imam', details: { mosqueName: 'M', role: 'khatib' } });
  });

  it('sends the skills that are given and nothing else', () => {
    expect(skillsValue({ interestAreas: [], vehicle: '', canSwim: '', availability: '' })).toEqual(
      {},
    );
    expect(
      skillsValue({
        interestAreas: ['media'],
        vehicle: 'bicycle',
        canSwim: 'no',
        availability: 'anytime',
      }),
    ).toEqual({
      interestAreas: ['media'],
      vehicle: 'bicycle',
      canSwim: false,
      availability: 'anytime',
    });
  });
});

describe('the submit body of a volunteer', () => {
  const filled = {
    ...EMPTY_VALUES,
    name: 'Name',
    fatherName: 'Father',
    motherName: 'Mother',
    nid: '1000000000555',
    address: { divisionId: ID, districtId: ID, upazilaId: ID, unionId: ID },
    profession: { profession: 'student' as const, details: { institutionName: 'School' } },
  };

  it('carries the profession details as one object and leaves out what was not given', () => {
    const body = submitBody('volunteer', ID, filled);
    expect(body).toMatchObject({
      kind: 'volunteer',
      profession: 'student',
      professionDetails: { institutionName: 'School' },
    });
    for (const absent of [
      'dateOfBirth',
      'bloodGroup',
      'tshirtSize',
      'volunteeringArea',
      'emergencyContact',
      'interestAreas',
      'vehicle',
      'canSwim',
      'availability',
      'experience',
      'workDescription',
    ])
      expect(Object.keys(JSON.parse(JSON.stringify(body))), absent).not.toContain(absent);
  });

  it('sends the given personal data, skills and emergency contact', () => {
    const body = submitBody('volunteer', ID, {
      ...filled,
      dateOfBirth: '1990-05-17',
      bloodGroup: 'O+',
      tshirtSize: 'L',
      volunteeringArea: 'anywhere',
      skills: {
        interestAreas: ['survey'],
        vehicle: 'none',
        canSwim: 'yes',
        availability: 'holidays',
      },
      emergency: { name: 'Guardian', mobile: '01812345678' },
    });
    expect(body).toMatchObject({
      dateOfBirth: '1990-05-17',
      bloodGroup: 'O+',
      tshirtSize: 'L',
      volunteeringArea: 'anywhere',
      interestAreas: ['survey'],
      vehicle: 'none',
      canSwim: true,
      availability: 'holidays',
      emergencyContact: { name: 'Guardian', mobile: '01812345678' },
    });
  });
});
