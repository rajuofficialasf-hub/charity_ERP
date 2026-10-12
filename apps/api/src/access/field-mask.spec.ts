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
