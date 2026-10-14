import { EDIT_FIELDS } from '@css/shared/registration';
import { describe, expect, it } from 'vitest';
import { CLASS_OF } from './change-requests';

// The field class of an edit request's value (RBAC.md 6; DECISION_LOG O-65, D-092).
describe('the field class of the edit request values', () => {
  it('names the identity class for the NID, its photos and the new personal data', () => {
    for (const field of [
      'nid',
      'nid_photo',
      'nid_photo_back',
      'bloodGroup',
      'dateOfBirth',
      'emergencyContact',
    ])
      expect(CLASS_OF[field], field).toBe('volunteer.identity');
    expect(CLASS_OF.bank).toBe('volunteer.bank');
  });

  it('only names fields that can be edited, so a misspelled key can not leave a value open', () => {
    for (const field of Object.keys(CLASS_OF)) expect(EDIT_FIELDS, field).toContain(field);
  });
});
