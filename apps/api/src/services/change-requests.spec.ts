import { EDIT_FIELDS } from '@css/shared/registration';
import { describe, expect, it } from 'vitest';
import { CLASS_OF } from './change-requests.js';

// The field class of an edit request's value (docs/security/RBAC.md, "Field-level protection").
describe('the field class of the edit request values', () => {
  it('names the identity class for the NID, its photos and the new personal data', () => {
    for (const field of ['nid', 'nid_photo', 'nid_photo_back', 'bloodGroup', 'dateOfBirth'])
      expect(CLASS_OF[field], field).toBe('volunteer.identity');
    expect(CLASS_OF.bank).toBe('volunteer.bank');
  });

  it('names no class for the emergency contact, which is not collected, and none for the education', () => {
    expect(CLASS_OF.emergencyContact).toBeUndefined();
    expect(CLASS_OF.educationDetails).toBeUndefined();
  });

  it('only names fields that can be edited, so a misspelled key can not leave a value open', () => {
    for (const field of Object.keys(CLASS_OF)) expect(EDIT_FIELDS, field).toContain(field);
  });
});
