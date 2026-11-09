import { describe, expect, it } from 'vitest';
import { checkStep, EMPTY_VALUES, stepOf, STEPS, submitBody } from './form-state';
import {
  EMPTY_EDUCATION,
  educationValue,
  permanentValue,
  professionDetailsOf,
  professionValue,
  skillsValue,
} from './ProfileInputs';

// The steps and the submit body of the volunteer form.
const ID = '01900000-0000-7000-8000-0000000000aa';
const OTHER = '01900000-0000-7000-8000-0000000000bb';

describe('the volunteer steps', () => {
  it('has eight steps with the contacts first and the photos last', () => {
    expect(STEPS.volunteer).toEqual([
      'contact',
      'identity',
      'address',
      'education',
      'profession',
      'skills',
      'account',
      'photos',
    ]);
    expect(STEPS.staff).toEqual(['contact', 'account', 'photos']);
  });

  it('checks the date of birth and the Facebook link of the identity step', () => {
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
    expect(
      checkStep('identity', 'volunteer', { ...v, facebookId: 'https://www.facebook.com/nomuna' }),
    ).toEqual({});
    for (const bad of ['nomuna', 'http://facebook.com/x', 'https://evil.example/facebook.com'])
      expect(checkStep('identity', 'volunteer', { ...v, facebookId: bad }), bad).toEqual({
        facebookId: 'errors.validation.facebook_link',
      });
  });

  it('needs the present address to the union; the permanent one is optional but a started one is whole', () => {
    expect(Object.keys(checkStep('address', 'volunteer', EMPTY_VALUES)).sort()).toEqual([
      'districtId',
      'divisionId',
      'unionId',
      'upazilaId',
    ]);
    const present = { divisionId: ID, districtId: ID, upazilaId: ID, unionId: ID };
    const v = { ...EMPTY_VALUES, address: present };
    expect(checkStep('address', 'volunteer', v)).toEqual({});
    // a different permanent address with nothing typed is allowed
    expect(checkStep('address', 'volunteer', { ...v, permanentSame: false })).toEqual({});
    // a started one needs all four levels
    expect(
      Object.keys(
        checkStep('address', 'volunteer', {
          ...v,
          permanentSame: false,
          permanent: {
            address: { divisionId: OTHER, districtId: null, upazilaId: null, unionId: null },
            line: '',
          },
        }),
      ).sort(),
    ).toEqual(['permanent-districtId', 'permanent-unionId', 'permanent-upazilaId']);
  });

  it('checks the passing year of the education and needs a profession', () => {
    expect(checkStep('education', 'volunteer', EMPTY_VALUES)).toEqual({});
    expect(
      checkStep('education', 'volunteer', {
        ...EMPTY_VALUES,
        education: { ...EMPTY_EDUCATION, passingYear: '1949' },
      }),
    ).toEqual({ 'educationDetails.passingYear': 'errors.validation.out_of_range' });
    expect(
      checkStep('education', 'volunteer', {
        ...EMPTY_VALUES,
        education: { ...EMPTY_EDUCATION, passingYear: '2016' },
      }),
    ).toEqual({});
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
    expect(at('facebookId')).toBe('identity');
    expect(at('unionId')).toBe('address');
    expect(at('volunteeringArea')).toBe('address');
    expect(at('permanentAddress.districtId')).toBe('address');
    expect(at('educationDetails.passingYear')).toBe('education');
    expect(at('profession')).toBe('profession');
    expect(at('professionDetails.designation')).toBe('profession');
    expect(at('interestAreas')).toBe('skills');
    expect(at('emergencyFullTime')).toBe('skills');
    expect(at('password')).toBe('account');
  });
});

describe('the profession, skills and education values', () => {
  it('keeps only the fields of the chosen profession and drops blanks', () => {
    expect(
      professionDetailsOf({
        profession: 'job_seeker',
        details: { skills: ' computer ', designation: 'Lecturer', other: '' },
      }),
    ).toEqual({ skills: 'computer' });
    expect(professionDetailsOf({ profession: '', details: { designation: 'x' } })).toEqual({});
    expect(
      professionValue({ profession: 'imam', details: { mosqueName: 'M', role: 'khatib' } }),
    ).toEqual({ profession: 'imam', details: { mosqueName: 'M', role: 'khatib' } });
  });

  it('sends the skills that are given, with the full-time answer as a boolean', () => {
    expect(
      skillsValue({
        interestAreas: [],
        vehicle: '',
        canSwim: '',
        availability: '',
        emergencyFullTime: '',
      }),
    ).toEqual({});
    expect(
      skillsValue({
        interestAreas: ['media'],
        vehicle: 'bicycle',
        canSwim: 'no',
        availability: 'anytime',
        emergencyFullTime: 'yes',
      }),
    ).toEqual({
      interestAreas: ['media'],
      vehicle: 'bicycle',
      canSwim: false,
      availability: 'anytime',
      emergencyFullTime: true,
    });
  });

  it('turns the education into the API value: the year a number, blanks left out', () => {
    expect(educationValue(EMPTY_EDUCATION)).toEqual({});
    expect(
      educationValue({
        highestQualification: 'bachelor',
        institutionName: ' College ',
        subject: '',
        passingYear: '2016',
        result: 'GPA 4.5',
        status: 'completed',
      }),
    ).toEqual({
      highestQualification: 'bachelor',
      institutionName: 'College',
      passingYear: 2016,
      result: 'GPA 4.5',
      status: 'completed',
    });
  });

  it('makes a permanent address only from all four levels', () => {
    const all = { divisionId: ID, districtId: ID, upazilaId: ID, unionId: ID };
    expect(permanentValue({ address: all, line: ' Village ' })).toEqual({
      ...all,
      addressLine: 'Village',
    });
    expect(permanentValue({ address: { ...all, unionId: null }, line: '' })).toBeNull();
  });
});

describe('the submit body of a volunteer', () => {
  const present = { divisionId: ID, districtId: ID, upazilaId: ID, unionId: ID };
  const filled = {
    ...EMPTY_VALUES,
    name: 'Name',
    fatherName: 'Father',
    motherName: 'Mother',
    nid: '1000000000555',
    address: present,
    profession: { profession: 'student' as const, details: { institutionName: 'School' } },
  };

  it('copies the present address when it is the permanent one, and leaves out what was not given', () => {
    const body = submitBody('volunteer', ID, { ...filled, addressLine: 'House 5' });
    expect(body).toMatchObject({
      kind: 'volunteer',
      profession: 'student',
      professionDetails: { institutionName: 'School' },
      permanentAddress: { ...present, addressLine: 'House 5' },
    });
    for (const absent of [
      'dateOfBirth',
      'bloodGroup',
      'tshirtSize',
      'volunteeringArea',
      'facebookId',
      'educationDetails',
      'interestAreas',
      'vehicle',
      'canSwim',
      'availability',
      'emergencyFullTime',
      'education',
      'previousProjects',
      'experience',
      'workDescription',
      'emergencyContact',
    ])
      expect(Object.keys(JSON.parse(JSON.stringify(body))), absent).not.toContain(absent);
  });

  it('sends the typed permanent address, or none when nothing was typed', () => {
    const typed = { divisionId: OTHER, districtId: OTHER, upazilaId: OTHER, unionId: OTHER };
    expect(
      submitBody('volunteer', ID, {
        ...filled,
        permanentSame: false,
        permanent: { address: typed, line: 'Old village' },
      }),
    ).toMatchObject({ permanentAddress: { ...typed, addressLine: 'Old village' } });
    expect(
      JSON.parse(JSON.stringify(submitBody('volunteer', ID, { ...filled, permanentSame: false }))),
    ).not.toHaveProperty('permanentAddress');
  });

  it('sends the given personal data, the Facebook link, the education and the skills', () => {
    const body = submitBody('volunteer', ID, {
      ...filled,
      dateOfBirth: '1990-05-17',
      bloodGroup: 'O+',
      tshirtSize: 'L',
      volunteeringArea: 'anywhere',
      facebookId: ' https://www.facebook.com/nomuna ',
      education: { ...EMPTY_EDUCATION, highestQualification: 'hsc', passingYear: '2012' },
      skills: {
        interestAreas: ['survey'],
        vehicle: 'none',
        canSwim: 'yes',
        availability: 'holidays',
        emergencyFullTime: 'no',
      },
    });
    expect(body).toMatchObject({
      dateOfBirth: '1990-05-17',
      bloodGroup: 'O+',
      tshirtSize: 'L',
      volunteeringArea: 'anywhere',
      facebookId: 'https://www.facebook.com/nomuna',
      educationDetails: { highestQualification: 'hsc', passingYear: 2012 },
      interestAreas: ['survey'],
      vehicle: 'none',
      canSwim: true,
      availability: 'holidays',
      emergencyFullTime: false,
    });
  });
});
