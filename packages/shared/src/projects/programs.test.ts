import { describe, expect, it } from 'vitest';
import { programCreateSchema, programUpdateSchema } from './programs.js';
import { projectSeriesFilterSchema, SHORT_DESCRIPTION_MAX } from './requests.js';

const uuid = '0190a4c4-0000-7000-8000-000000000001';
const name = { bn: 'মানবিক প্রোগ্রাম', en: 'Humanitarian program' };
const description = { bn: 'দুর্যোগে মানুষের পাশে', en: 'Beside people in a disaster' };

describe('the requests of a program', () => {
  it('creates a program with or without a short description', () => {
    expect(programCreateSchema.safeParse({ code: 'HUM', name }).success).toBe(true);
    expect(programCreateSchema.safeParse({ code: 'HUM', name, description }).success).toBe(true);
    expect(
      programCreateSchema.safeParse({ code: 'HUM', name, description, pmUserId: uuid }).success,
    ).toBe(true);
    // a description is a pair: one language alone, or a plain text, is refused
    expect(programCreateSchema.safeParse({ code: 'HUM', name, description: 'text' }).success).toBe(
      false,
    );
    expect(
      programCreateSchema.safeParse({ code: 'HUM', name, description: { bn: 'শুধু বাংলা' } })
        .success,
    ).toBe(false);
  });

  it('changes the name, the description or the state, at least one, and removes a description with null', () => {
    expect(programUpdateSchema.safeParse({ name }).success).toBe(true);
    expect(programUpdateSchema.safeParse({ active: false }).success).toBe(true);
    expect(programUpdateSchema.safeParse({ description }).success).toBe(true);
    expect(programUpdateSchema.safeParse({ description: null }).success).toBe(true);
    expect(
      programUpdateSchema.safeParse({ description: { bn: 'শুধু বাংলায়', en: '' } }).success,
    ).toBe(true);
    expect(programUpdateSchema.safeParse({}).success).toBe(false);
    expect(programUpdateSchema.safeParse({ description, code: 'HUM' }).success).toBe(false);
  });

  it('keeps a description to 500 characters per language, counted after trimming', () => {
    const fits = 'ক'.repeat(SHORT_DESCRIPTION_MAX);
    expect(programUpdateSchema.safeParse({ description: { bn: fits, en: '' } }).success).toBe(true);
    expect(
      programUpdateSchema.safeParse({ description: { bn: `  ${fits}  `, en: '' } }).success,
    ).toBe(true);
    const result = programUpdateSchema.safeParse({ description: { bn: '', en: `${fits}ক` } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('validation.too_long');
  });
});

describe('the filter of the project series', () => {
  it('takes a program or nothing, and no other key', () => {
    expect(projectSeriesFilterSchema.safeParse({}).success).toBe(true);
    expect(projectSeriesFilterSchema.safeParse({ programId: uuid }).success).toBe(true);
    expect(projectSeriesFilterSchema.safeParse({ programId: 'HUM' }).success).toBe(false);
    expect(projectSeriesFilterSchema.safeParse({ year: 2026 }).success).toBe(false);
  });
});
