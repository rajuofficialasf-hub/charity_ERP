import { describe, expect, it } from 'vitest';
import {
  projectSeriesCreateSchema,
  projectSeriesUpdateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  sessionCreateSchema,
  SHORT_DESCRIPTION_MAX,
} from './requests.js';
import {
  MAX_SESSION_MONTHS,
  sessionDates,
  sessionLabel,
  sessionMonths,
  sessionPeriod,
  sessionYear,
} from './session.js';

const uuid = '0190a4c4-0000-7000-8000-000000000001';
const name = { bn: 'স্বাবলম্বী প্রকল্প', en: 'Self-reliance project' };
const issuesOf = (result: { success: boolean; error?: { issues: unknown[] } }) =>
  (result.error?.issues ?? []) as { path: PropertyKey[]; message: string }[];

describe('the label of a session', () => {
  it('is the start year alone when the session ends in the year it starts', () => {
    expect(sessionLabel('2026-01', '2026-12')).toBe('2026');
    expect(sessionLabel('2026-03', '2026-03')).toBe('2026');
  });

  it('adds the last two digits of the end year when the session ends in a later year', () => {
    expect(sessionLabel('2026-06', '2027-07')).toBe('2026-27');
    // the longest period may end two years after it starts
    expect(sessionLabel('2026-06', '2028-05')).toBe('2026-28');
  });

  it('writes the whole end year when the century turns inside the session', () => {
    expect(sessionLabel('2099-06', '2100-05')).toBe('2099-2100');
    expect(sessionLabel('2099-01', '2100-12')).toBe('2099-2100');
    expect(sessionLabel('2098-06', '2099-05')).toBe('2098-99');
    expect(sessionLabel('2100-06', '2101-05')).toBe('2100-01');
  });

  it('reads the stored dates as it reads the months of a form', () => {
    expect(sessionLabel('2026-06-01', '2027-07-31')).toBe('2026-27');
    expect(sessionLabel('2026-01-01', '2026-12-31')).toBe('2026');
  });
});

describe('the period of a session', () => {
  it('counts the months it covers, the first and the last included', () => {
    expect(sessionMonths('2026-01', '2026-12')).toBe(12);
    expect(sessionMonths('2026-06', '2027-07')).toBe(14);
    expect(sessionMonths('2026-03', '2026-03')).toBe(1);
    expect(sessionMonths('2026-03', '2026-02')).toBe(0);
    expect(sessionMonths('2026-06-01', '2027-07-31')).toBe(14);
  });

  it('starts in the year of its first month', () => {
    expect(sessionYear('2026-06')).toBe(2026);
    expect(sessionYear('2026-06-01')).toBe(2026);
  });

  it('is stored from the first day of the start month to the last day of the end month', () => {
    expect(sessionDates({ periodFrom: '2026-01', periodTo: '2026-12' })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(sessionDates({ periodFrom: '2026-06', periodTo: '2027-06' })).toEqual({
      from: '2026-06-01',
      to: '2027-06-30',
    });
    // February of a leap year and of a common year
    expect(sessionDates({ periodFrom: '2027-03', periodTo: '2028-02' }).to).toBe('2028-02-29');
    expect(sessionDates({ periodFrom: '2026-03', periodTo: '2027-02' }).to).toBe('2027-02-28');
  });

  it('accepts one month, a calendar year, a year that ends in the next, and the longest period', () => {
    for (const [periodFrom, periodTo] of [
      ['2026-03', '2026-03'],
      ['2026-01', '2026-12'],
      ['2026-06', '2027-07'],
      ['2026-01', '2027-12'],
    ])
      expect(sessionPeriod.safeParse({ periodFrom, periodTo }).success, periodFrom).toBe(true);
    expect(sessionMonths('2026-01', '2027-12')).toBe(MAX_SESSION_MONTHS);
  });

  it('refuses an end before its start', () => {
    const result = sessionPeriod.safeParse({ periodFrom: '2026-06', periodTo: '2026-05' });
    expect(result.success).toBe(false);
    expect(issuesOf(result)).toEqual([
      expect.objectContaining({ path: ['periodTo'], message: 'validation.out_of_range' }),
    ]);
  });

  it('refuses more than 24 months', () => {
    const result = sessionPeriod.safeParse({ periodFrom: '2026-01', periodTo: '2028-01' });
    expect(result.success).toBe(false);
    expect(issuesOf(result)).toEqual([
      expect.objectContaining({ path: ['periodTo'], message: 'validation.out_of_range' }),
    ]);
  });

  it('refuses a month that is not yyyy-mm', () => {
    for (const month of ['2026-13', '2026-00', '2026-6', '2026', '2026-06-01', 'June 2026', '']) {
      const result = sessionPeriod.safeParse({ periodFrom: month, periodTo: '2026-12' });
      expect(result.success, month).toBe(false);
      expect(issuesOf(result), month).toEqual([
        expect.objectContaining({ path: ['periodFrom'], message: 'validation.date_format' }),
      ]);
    }
    expect(sessionPeriod.safeParse({ periodFrom: '2026-01', periodTo: 202612 }).success).toBe(
      false,
    );
  });

  it('refuses a start year no project may hold', () => {
    expect(sessionPeriod.safeParse({ periodFrom: '2019-12', periodTo: '2020-11' }).success).toBe(
      false,
    );
    expect(sessionPeriod.safeParse({ periodFrom: '2101-01', periodTo: '2101-12' }).success).toBe(
      false,
    );
    expect(sessionPeriod.safeParse({ periodFrom: '2100-06', periodTo: '2101-05' }).success).toBe(
      true,
    );
  });

  it('takes nothing but the two months', () => {
    expect(
      sessionPeriod.safeParse({ periodFrom: '2026-01', periodTo: '2026-12', year: 2026 }).success,
    ).toBe(false);
    expect(sessionPeriod.safeParse({ periodFrom: '2026-01' }).success).toBe(false);
  });
});

describe('the requests of a project series and its sessions', () => {
  it('creates a series with a program, a code and names, with or without a description', () => {
    const base = { programId: uuid, code: 'SWB', name };
    expect(projectSeriesCreateSchema.safeParse(base).success).toBe(true);
    expect(
      projectSeriesCreateSchema.safeParse({
        ...base,
        description: { bn: 'পরিবারকে স্বাবলম্বী করার প্রকল্প', en: '' },
      }).success,
    ).toBe(true);
    expect(projectSeriesCreateSchema.safeParse({ ...base, year: 2026 }).success).toBe(false);
    expect(projectSeriesCreateSchema.safeParse({ code: 'SWB', name }).success).toBe(false);
  });

  it('keeps the code of a series to 2 to 8 capital letters', () => {
    const base = { programId: uuid, name };
    for (const code of ['SW', 'SWB', 'ABCDEFGH'])
      expect(projectSeriesCreateSchema.safeParse({ ...base, code }).success, code).toBe(true);
    for (const code of ['S', 'ABCDEFGHI', 'swb', 'SW1', 'SW-B', ' SWB', ''])
      expect(projectSeriesCreateSchema.safeParse({ ...base, code }).success, code).toBe(false);
  });

  it('refuses a description over 500 characters in either language', () => {
    const long = 'ক'.repeat(SHORT_DESCRIPTION_MAX + 1);
    const fits = 'ক'.repeat(SHORT_DESCRIPTION_MAX);
    const base = { programId: uuid, code: 'SWB', name };
    expect(
      projectSeriesCreateSchema.safeParse({ ...base, description: { bn: fits, en: fits } }).success,
    ).toBe(true);
    for (const description of [
      { bn: long, en: '' },
      { bn: '', en: long },
    ]) {
      const result = projectSeriesCreateSchema.safeParse({ ...base, description });
      expect(result.success).toBe(false);
      expect(issuesOf(result)[0]?.message).toBe('validation.too_long');
    }
    expect(projectSeriesUpdateSchema.safeParse({ description: { bn: long, en: '' } }).success).toBe(
      false,
    );
    // one language alone is no pair
    expect(
      projectSeriesCreateSchema.safeParse({ ...base, description: { bn: fits } }).success,
    ).toBe(false);
  });

  it('changes the names or the description of a series, at least one, and never its program or code', () => {
    expect(projectSeriesUpdateSchema.safeParse({ name }).success).toBe(true);
    expect(projectSeriesUpdateSchema.safeParse({ description: null }).success).toBe(true);
    expect(
      projectSeriesUpdateSchema.safeParse({ name, description: { bn: 'ক', en: 'a' } }).success,
    ).toBe(true);
    expect(projectSeriesUpdateSchema.safeParse({}).success).toBe(false);
    expect(projectSeriesUpdateSchema.safeParse({ name, programId: uuid }).success).toBe(false);
    expect(projectSeriesUpdateSchema.safeParse({ name, code: 'SWC' }).success).toBe(false);
  });

  it('starts a new session from a period, with or without the session it copies', () => {
    const period = { periodFrom: '2027-06', periodTo: '2028-07' };
    expect(sessionCreateSchema.safeParse(period).success).toBe(true);
    expect(sessionCreateSchema.safeParse({ ...period, sourceProjectId: uuid }).success).toBe(true);
    expect(sessionCreateSchema.safeParse({ ...period, sourceProjectId: 'x' }).success).toBe(false);
    // the code, the program and the names come from the series
    expect(sessionCreateSchema.safeParse({ ...period, code: 'SWB' }).success).toBe(false);
    // the period rules hold here too
    expect(
      sessionCreateSchema.safeParse({ periodFrom: '2027-06', periodTo: '2027-05' }).success,
    ).toBe(false);
    expect(
      sessionCreateSchema.safeParse({ periodFrom: '2027-06', periodTo: '2029-06' }).success,
    ).toBe(false);
  });

  it('changes the period of a session by its two months together, and never its program, code or year', () => {
    expect(
      projectUpdateSchema.safeParse({ periodFrom: '2027-06', periodTo: '2028-07' }).success,
    ).toBe(true);
    // one month alone says no period
    for (const body of [{ periodFrom: '2027-06' }, { periodTo: '2028-07' }]) {
      const result = projectUpdateSchema.safeParse(body);
      expect(result.success).toBe(false);
      expect(issuesOf(result)[0]?.message).toBe('validation.required');
    }
    // the rules of a period hold
    expect(
      projectUpdateSchema.safeParse({ periodFrom: '2027-06', periodTo: '2027-05' }).success,
    ).toBe(false);
    expect(
      projectUpdateSchema.safeParse({ periodFrom: '2027-06', periodTo: '2029-06' }).success,
    ).toBe(false);
    // what the series holds, and the year the period gives, have no place in the body
    for (const body of [{ programId: uuid }, { code: 'SWB' }, { year: 2027 }])
      expect(projectUpdateSchema.safeParse(body).success, Object.keys(body)[0]).toBe(false);
    expect(projectUpdateSchema.safeParse({ name }).success).toBe(true);
  });

  it('creates a session in the setup from its series, a period and a starting point', () => {
    const base = { seriesId: uuid, periodFrom: '2027-01', periodTo: '2027-12' };
    for (const source of [
      { kind: 'workflow', workflowKey: 'distribution' },
      { kind: 'template', templateId: uuid },
      { kind: 'copy', projectId: uuid },
    ])
      expect(projectCreateSchema.safeParse({ ...base, source }).success, source.kind).toBe(true);
    const source = { kind: 'workflow', workflowKey: 'distribution' };
    expect(projectCreateSchema.safeParse(base).success).toBe(false);
    expect(projectCreateSchema.safeParse({ ...base, periodTo: '2026-12', source }).success).toBe(
      false,
    );
    // what the series holds is not taken from the body
    for (const extra of [{ code: 'SWB' }, { programId: uuid }, { year: 2027 }, { name }])
      expect(
        projectCreateSchema.safeParse({ ...base, source, ...extra }).success,
        Object.keys(extra)[0],
      ).toBe(false);
  });
});
