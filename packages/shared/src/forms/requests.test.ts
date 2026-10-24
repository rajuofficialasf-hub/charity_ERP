import { describe, expect, it } from 'vitest';
import { formPlaceSchema, readyFormCreateSchema } from './requests';

const ID = '01900000-0000-7000-8000-000000000001';

describe('a new ready form', () => {
  const valid = {
    key: 'winter_application',
    title: { bn: 'শীতবস্ত্র', en: 'Winter clothing' },
    kind: 'beneficiary_application',
    source: { kind: 'blank' },
  };

  it('takes an empty start or a copy, for an application form or another kind', () => {
    expect(readyFormCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      readyFormCreateSchema.safeParse({
        ...valid,
        kind: 'other',
        source: { kind: 'copy', formId: ID },
      }).success,
    ).toBe(true);
  });

  it('refuses the library kind, a template start and an unknown field', () => {
    expect(readyFormCreateSchema.safeParse({ ...valid, kind: 'library' }).success).toBe(false);
    expect(
      readyFormCreateSchema.safeParse({
        ...valid,
        source: { kind: 'template', templateKey: 'form_distribution' },
      }).success,
    ).toBe(false);
    expect(readyFormCreateSchema.safeParse({ ...valid, projectId: ID }).success).toBe(false);
  });
});

describe('a placement', () => {
  it('takes the ready form with or without a key of its own', () => {
    expect(formPlaceSchema.safeParse({ readyFormId: ID }).success).toBe(true);
    expect(formPlaceSchema.safeParse({ readyFormId: ID, key: 'iftar' }).success).toBe(true);
  });

  it('refuses a key that is not a snake key and a missing ready form', () => {
    expect(formPlaceSchema.safeParse({ readyFormId: ID, key: 'Iftar Form' }).success).toBe(false);
    expect(formPlaceSchema.safeParse({ key: 'iftar' }).success).toBe(false);
  });
});
