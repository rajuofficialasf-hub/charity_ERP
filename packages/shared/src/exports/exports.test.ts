import { describe, expect, it } from 'vitest';
import { bn, en } from '../i18n/catalogue.js';
import {
  columnsOf,
  EXPORT_LIMITS,
  exportRequestSchema,
  orderColumns,
  questionColumnId,
  unknownColumns,
} from './index.js';

const request = (over: Record<string, unknown> = {}) => ({
  kind: 'beneficiaries',
  format: 'xlsx',
  columns: ['name', 'mobile'],
  filters: { q: 'রহিম' },
  ...over,
});

describe('an export request', () => {
  it('takes a list, a format, the chosen columns and the list’s filters', () => {
    expect(exportRequestSchema.parse(request())).toEqual(request());
  });

  it('is refused without a column, with an unknown kind or format, or with too many columns', () => {
    expect(exportRequestSchema.safeParse(request({ columns: [] })).success).toBe(false);
    expect(exportRequestSchema.safeParse(request({ kind: 'donors' })).success).toBe(false);
    expect(exportRequestSchema.safeParse(request({ format: 'docx' })).success).toBe(false);
    const many = Array.from({ length: EXPORT_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`);
    expect(exportRequestSchema.safeParse(request({ columns: many })).success).toBe(false);
    expect(exportRequestSchema.safeParse(request({ columns: ['name', 'name'] })).success).toBe(
      false,
    );
  });

  it('needs the project of an application list, and no project for the others', () => {
    expect(exportRequestSchema.safeParse(request({ kind: 'applications' })).success).toBe(false);
    expect(
      exportRequestSchema.safeParse(
        request({
          kind: 'applications',
          columns: ['app_no'],
          projectId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01',
        }),
      ).success,
    ).toBe(true);
    expect(
      exportRequestSchema.safeParse(request({ projectId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01' }))
        .success,
    ).toBe(false);
  });
});

describe('the column catalogues', () => {
  it('list the on-screen columns of each list in the order the list shows them', () => {
    const onScreen = (kind: Parameters<typeof columnsOf>[0]) =>
      columnsOf(kind)
        .filter((c) => c.onScreen)
        .map((c) => c.id);
    expect(onScreen('volunteers')).toEqual(['name', 'area', 'projects', 'state', 'category']);
    expect(onScreen('beneficiaries')).toEqual(['name', 'ben_no', 'father', 'area', 'status']);
    expect(onScreen('applications')).toEqual([
      'app_no',
      'person',
      'score',
      'area',
      'status',
      'submitted',
      'waiting',
    ]);
  });

  it('mark every identity, bank, rating and official column with its protected class', () => {
    const classOf = (kind: Parameters<typeof columnsOf>[0], id: string) =>
      columnsOf(kind).find((c) => c.id === id)?.cls;
    expect(classOf('volunteers', 'nid')).toBe('volunteer.identity');
    expect(classOf('volunteers', 'bank_account_number')).toBe('volunteer.bank');
    expect(classOf('volunteers', 'category')).toBe('volunteer.rating');
    expect(classOf('beneficiaries', 'nid')).toBe('beneficiary.nid');
    expect(classOf('beneficiaries', 'birth_reg')).toBe('beneficiary.nid');
    expect(classOf('beneficiaries', 'mobile')).toBe('beneficiary.contact');
    expect(classOf('applications', 'score')).toBe('application.official_section');
    expect(classOf('beneficiaries', 'name')).toBeNull();
  });

  it('give every column a header in both languages', () => {
    for (const kind of ['volunteers', 'beneficiaries', 'applications'] as const)
      for (const column of columnsOf(kind)) {
        const [, , list, id] = column.header.split('.');
        const pick = (messages: typeof bn) =>
          (messages.exports.column as Record<string, Record<string, string>>)[list!]?.[id!];
        expect(pick(bn), `${kind}.${column.id} bn`).toBeTruthy();
        expect(pick(en), `${kind}.${column.id} en`).toBeTruthy();
      }
  });

  it('name a form question by its key, and know which ids they are', () => {
    expect(questionColumnId('family_size')).toBe('q:family_size');
    expect(
      unknownColumns('applications', ['app_no', 'q:family_size', 'nope'], ['family_size']),
    ).toEqual(['nope']);
    expect(unknownColumns('volunteers', ['q:family_size'], [])).toEqual(['q:family_size']);
  });
});

describe('the kind of a column', () => {
  it('writes codes, dates, numbers and yes-or-no as such, and the rest as text', () => {
    const kindOf = (kind: Parameters<typeof columnsOf>[0], id: string) =>
      columnsOf(kind).find((c) => c.id === id)?.kind;
    expect(kindOf('volunteers', 'state')).toBe('coded');
    expect(kindOf('volunteers', 'date_of_birth')).toBe('date');
    expect(kindOf('volunteers', 'blocked')).toBe('flag');
    expect(kindOf('beneficiaries', 'age')).toBe('number');
    expect(kindOf('applications', 'submitted')).toBe('datetime');
    expect(kindOf('applications', 'person')).toBe('text');
  });
});

describe('the column order of a file', () => {
  it('puts the list’s columns first, then the details, then the questions in the form’s order', () => {
    const chosen = ['q:income', 'mobile', 'status', 'q:family_size', 'person', 'stage', 'app_no'];
    expect(orderColumns('applications', chosen, ['family_size', 'income'])).toEqual([
      'app_no',
      'person',
      'status',
      'stage',
      'q:family_size',
      'q:income',
    ]);
  });

  it('keeps a beneficiary list in its catalogue order whatever order the ticks came in', () => {
    expect(orderColumns('beneficiaries', ['nid', 'mobile', 'name', 'status'], [])).toEqual([
      'name',
      'status',
      'mobile',
      'nid',
    ]);
  });
});
