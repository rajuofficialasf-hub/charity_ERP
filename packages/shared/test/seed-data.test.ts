import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { COMPONENT_KEYS, componentSettingsSchema, mergeWorkflowTemplates } from '../src/index.js';
import { NOTIFICATION_TEMPLATES, templateVariables } from '../src/notifications/templates.js';
import {
  demoName,
  fakeBirthReg,
  fakeEmail,
  fakeMobile,
  fakeNid,
  isDemoName,
  isFakeBirthReg,
  isFakeEmail,
  isFakeMobile,
  isFakeNid,
} from '../src/testing/fake.js';

const templatesDir = join(__dirname, '../../../docs/architecture/workflow-templates');
const templates = readdirSync(templatesDir)
  .filter((f) => f.endsWith('.yaml'))
  .map(
    (f) =>
      yaml.load(readFileSync(join(templatesDir, f), 'utf8')) as {
        template: string;
        extends?: string;
        transitions?: unknown[];
        states?: unknown[];
      },
  );
const byKey = (k: string) => templates.find((t) => t.template === k)!;

describe('mergeWorkflowTemplates', () => {
  it.each(templates.map((t) => t.template))('%s merges into a valid definition', (key) => {
    expect(() => mergeWorkflowTemplates(key, templates)).not.toThrow();
  });

  it('concatenates the parent chain: qurbani gets the common and the distribution parts', () => {
    const common = byKey('_common');
    const distribution = byKey('distribution');
    const qurbani = byKey('qurbani');
    const merged = mergeWorkflowTemplates('qurbani', templates);
    const len = (t: { transitions?: unknown[] }) => t.transitions?.length ?? 0;
    expect(merged.transitions?.length).toBe(len(common) + len(distribution) + len(qurbani));
    expect(merged.template).toBe('qurbani');
    expect(merged.states?.length).toBe(
      (common.states?.length ?? 0) +
        (distribution.states?.length ?? 0) +
        (qurbani.states?.length ?? 0),
    );
  });

  it('refuses a missing parent', () => {
    expect(() => mergeWorkflowTemplates('x', [{ template: 'x', extends: 'nope' }])).toThrow(
      /extends missing/,
    );
  });
});

describe('fake identities', () => {
  it('pass the production formats and are recognisable as fake', () => {
    expect(fakeNid(0)).toBe('1000000000');
    expect(fakeNid(99999)).toBe('1000099999');
    expect(() => fakeNid(100000)).toThrow();
    expect(fakeBirthReg(42)).toMatch(/^[0-9]{17}$/);
    expect(fakeMobile(7)).toMatch(/^01[3-9][0-9]{8}$/);
    expect([
      isFakeNid(fakeNid(5)),
      isFakeBirthReg(fakeBirthReg(5)),
      isFakeMobile(fakeMobile(5)),
      isFakeEmail(fakeEmail('a')),
      isDemoName(demoName('রহিমা')),
    ]).toEqual([true, true, true, true, true]);
    expect(isFakeNid('1987654321')).toBe(false);
    expect(isFakeMobile('01712345678')).toBe(false);
  });
});

describe('notification template seed', () => {
  it('has unique keys', () => {
    const keys = NOTIFICATION_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(NOTIFICATION_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s has both languages for every channel and declares its variables',
    (_key, t) => {
      expect(Object.keys(t.channels).length).toBeGreaterThan(0);
      for (const [channel, texts] of Object.entries(t.channels)) {
        for (const locale of ['bn', 'en'] as const) {
          const text = texts?.[locale];
          expect(text?.body, `${channel}/${locale}`).toBeTruthy();
          if (channel === 'email')
            expect(text?.subject, `${channel}/${locale} subject`).toBeTruthy();
          if (channel === 'in_app') expect(text?.title, `${channel}/${locale} title`).toBeTruthy();
          const used = [text?.subject, text?.title, text?.body]
            .filter(Boolean)
            .flatMap((s) => templateVariables(s!));
          for (const v of used)
            expect(t.variables, `${channel}/${locale} uses {{${v}}}`).toContain(v);
          expect(`${text?.title ?? ''}${text?.body}`).not.toMatch(/[০-৯]/); // English digits only
        }
      }
    },
  );
});

describe('components', () => {
  it('lists the 18 project components and validates distribution settings with the photo rule', () => {
    expect(COMPONENT_KEYS).toHaveLength(18);
    expect(componentSettingsSchema('distribution').safeParse({ rule: 'individual' }).success).toBe(
      true,
    );
    expect(componentSettingsSchema('distribution').safeParse({}).success).toBe(false);
    expect(componentSettingsSchema('dispatch_receive').safeParse({}).success).toBe(true);
  });
});
