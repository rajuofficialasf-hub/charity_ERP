import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  maskData,
  officialRows,
  sensitive,
  sensitiveClassesOf,
  visibleFieldClasses,
} from './field-mask';
import { loadAccessRegistry } from './registry';

// Field-level protection (RBAC.md 6, BR-183; plan
// docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U4).
const registry = loadAccessRegistry();

describe('field mask per sensitive class', () => {
  for (const cls of registry.sensitiveFields) {
    it(`keeps ${cls.key} only for its roles and the global roles`, () => {
      const schema = z.object({ id: z.string(), secret: sensitive(z.string(), cls.key) });
      const record = { id: 'r1', secret: 'protected value' };
      for (const role of registry.roles.values()) {
        const masked = maskData(schema, record, visibleFieldClasses(registry, [role.key]));
        const visible = role.globalScope || cls.visibleTo.includes(role.key);
        if (visible) expect(masked, role.key).toEqual(record);
        else {
          expect(masked, role.key).toEqual({ id: 'r1' });
          expect(Object.hasOwn(masked as object, 'secret'), role.key).toBe(false);
        }
      }
    });
  }

  it('never shows a protected class to a volunteer role', () => {
    for (const role of registry.roles.values())
      if (role.kind === 'volunteer')
        expect(visibleFieldClasses(registry, [role.key]).size, role.key).toBe(0);
  });

  it('shows nothing to a caller without roles (public routes)', () => {
    expect(visibleFieldClasses(registry, []).size).toBe(0);
  });
});

describe('masking nested data', () => {
  const answers = officialRows(
    z.array(z.object({ fieldKey: z.string(), visibility: z.string(), value: z.unknown() })),
  );
  const application = z.object({
    id: z.string(),
    beneficiary: z.object({
      name: z.string(),
      nid: sensitive(z.string(), 'beneficiary.nid').optional(),
    }),
    answers,
    scores: sensitive(z.array(z.number()), 'application.official_section').nullable(),
  });
  const record = {
    id: 'a1',
    beneficiary: { name: 'Name', nid: '1234567890' },
    answers: [
      { fieldKey: 'income', visibility: 'volunteer', value: 100 },
      { fieldKey: 'zakat_note', visibility: 'official_only', value: 'note' },
    ],
    scores: [3, 4],
  };

  it('removes official-only answers, scores and the NID for a volunteer', () => {
    const masked = maskData(
      z.array(application),
      [record],
      visibleFieldClasses(registry, ['volunteer_general']),
    );
    expect(masked).toEqual([
      {
        id: 'a1',
        beneficiary: { name: 'Name' },
        answers: [{ fieldKey: 'income', visibility: 'volunteer', value: 100 }],
      },
    ]);
  });

  it('removes official-only answers, scores and the NID for every Media Team role', () => {
    for (const role of ['media_team', 'media_director', 'media_assistant_director']) {
      expect(
        maskData(application, record, visibleFieldClasses(registry, [role])),
        role,
      ).toEqual({
        id: 'a1',
        beneficiary: { name: 'Name' },
        answers: [{ fieldKey: 'income', visibility: 'volunteer', value: 100 }],
      });
    }
  });

  it('keeps everything for a Project Executive', () => {
    const masked = maskData(
      application,
      record,
      visibleFieldClasses(registry, ['project_executive']),
    );
    expect(masked).toEqual(record);
  });

  it('does not change the input and passes a record without protected keys unchanged', () => {
    const copy = structuredClone(record);
    maskData(application, record, new Set());
    expect(record).toEqual(copy);
    const plain = { id: 'a2', beneficiary: { name: 'Other' }, answers: [], scores: null };
    expect(maskData(application, plain, new Set())).toEqual({
      id: 'a2',
      beneficiary: { name: 'Other' },
      answers: [],
    });
  });

  it('lists the classes a schema marks, through wrappers', () => {
    expect([...sensitiveClassesOf(z.object({ data: z.array(application) }))].sort()).toEqual([
      'application.official_section',
      'beneficiary.nid',
    ]);
  });
});

describe('a value under z.unknown() stays whole', () => {
  // the answer of an edit request is an object or a text; the mask must not empty it
  const schema = z.object({
    newValue: z.unknown().optional(),
    secret: sensitive(z.string(), 'volunteer.bank'),
  });

  it('keeps an object and an array that a leaf schema holds', () => {
    const visible = visibleFieldClasses(registry, ['regional_program_manager']);
    expect(
      maskData(schema, { newValue: { bankName: 'B', branchName: 'C' }, secret: 's' }, visible),
    ).toEqual({
      newValue: { bankName: 'B', branchName: 'C' },
      secret: 's',
    });
    expect(maskData(schema, { newValue: [1, { a: 2 }], secret: 's' }, visible)).toEqual({
      newValue: [1, { a: 2 }],
      secret: 's',
    });
  });

  it('still removes the marked sibling for a role without the class', () => {
    const visible = visibleFieldClasses(registry, ['media_team']);
    expect(maskData(schema, { newValue: { a: 1 }, secret: 's' }, visible)).toEqual({
      newValue: { a: 1 },
    });
  });
});

describe('masking in every position (fail closed)', () => {
  const none = new Set<string>();
  const donor = sensitive(z.object({ name: z.string() }), 'donor.data');

  it('drops marked array items, a marked record value and a marked top-level value', () => {
    expect(maskData(z.array(donor), [{ name: 'A' }], none)).toEqual([]);
    expect(maskData(z.record(z.string(), donor), { a: { name: 'A' } }, none)).toEqual({});
    expect(maskData(donor, { name: 'A' }, none)).toBeNull();
  });

  it('masks inside the matching union option, also for arrays', () => {
    const row = z.object({ id: z.string(), nid: sensitive(z.string(), 'beneficiary.nid') });
    const field = z.union([z.array(row), z.null()]);
    expect(maskData(field, [{ id: 'b1', nid: '1000000001' }], none)).toEqual([{ id: 'b1' }]);
    expect(maskData(field, null, none)).toBeNull();
  });

  it('honours a mark before .transform() and inside .or()', () => {
    const schema = z.object({
      a: sensitive(z.string(), 'volunteer.identity').transform((v) => v),
      b: sensitive(z.string(), 'volunteer.bank').or(z.number()),
    });
    expect(maskData(schema, { a: 'x', b: 'y' }, none)).toEqual({});
  });

  it('drops keys a loose object does not declare', () => {
    expect(maskData(z.looseObject({ id: z.string() }), { id: 'x', extra: 1 }, none)).toEqual({
      id: 'x',
    });
  });

  it('keeps only rows marked volunteer; an unknown visibility is protected', () => {
    const rows = officialRows(z.array(z.object({ visibility: z.string() })));
    expect(maskData(rows, [{ visibility: 'volunteer' }, { visibility: 'Official' }], none)).toEqual(
      [{ visibility: 'volunteer' }],
    );
  });

  it('refuses answer rows without visibility and schema kinds it cannot walk', () => {
    expect(() => officialRows(z.array(z.object({ value: z.string() })))).toThrow(/visibility/);
    expect(() =>
      sensitiveClassesOf(z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() }))),
    ).toThrow(/cannot walk a intersection/);
  });
});
