import { describe, expect, it } from 'vitest';
import { maskData, sensitiveClassesOf } from '../access/field-mask';
import { registrationDetail } from './registrations';

// The field class of the new personal data in the registration an approver opens (RBAC.md 6;
// DECISION_LOG O-65, D-092; BR-246).
describe('the registration detail and the field mask', () => {
  const volunteer = {
    nid: '1000000000123',
    bloodGroup: 'O+',
    dateOfBirth: '1990-05-17',
    tshirtSize: 'M',
    volunteeringArea: 'own_union',
    profession: 'imam',
    professionDetails: { mosqueName: 'নমুনা' },
    interestAreas: ['media'],
    vehicle: 'none',
    canSwim: true,
    availability: 'anytime',
  };
  const run = (classes: string[]) =>
    (maskData(registrationDetail, { volunteer }, new Set(classes)) as { volunteer: object })
      .volunteer;

  it('marks the blood group and the date of birth with the identity class', () => {
    expect(sensitiveClassesOf(registrationDetail)).toContain('volunteer.identity');
    const seen = run([]);
    for (const key of ['nid', 'bloodGroup', 'dateOfBirth'])
      expect(Object.hasOwn(seen, key), key).toBe(false);
  });

  it('keeps the other new data for every approver and the protected data with the class', () => {
    for (const classes of [[], ['volunteer.identity']])
      expect(run(classes)).toMatchObject({
        tshirtSize: 'M',
        volunteeringArea: 'own_union',
        profession: 'imam',
        professionDetails: { mosqueName: 'নমুনা' },
        interestAreas: ['media'],
        vehicle: 'none',
        canSwim: true,
        availability: 'anytime',
      });
    expect(run(['volunteer.identity'])).toMatchObject({
      nid: '1000000000123',
      bloodGroup: 'O+',
      dateOfBirth: '1990-05-17',
    });
  });
});
