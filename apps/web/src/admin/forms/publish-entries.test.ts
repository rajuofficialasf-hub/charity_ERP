import type { FormDefinition } from '@css/shared/forms';
import { describe, expect, it } from 'vitest';
import { coreSections, field, option, section, T } from '../../../test/forms';
import {
  missingTexts,
  problemsByPlace,
  publishEntries,
  type PublishEntry,
  standing,
} from './publish-entries';
import { moveSection, updateField } from './draft';

// What stands between a draft and its publishing, as the list beside the Publish button reads it:
// the engine's own check of the draft, joined with what the server said last.
const form = (...more: FormDefinition['sections']): FormDefinition => ({
  sections: [...coreSections(), ...more],
});
const extra = (...fields: Parameters<typeof section>[1]) =>
  section('extra', fields, { title: T('অতিরিক্ত', 'Extra') });
const groupsOf = (entries: PublishEntry[]) => entries.map((e) => e.group);

describe('the entries of the publish list', () => {
  it('has none for a complete application form', () => {
    expect(publishEntries(form(), 'beneficiary_application')).toEqual([]);
  });

  it('names the identity roles still missing in one entry, in the order of the roles', () => {
    const entries = publishEntries(
      {
        sections: [
          section('section_1', [
            field('q_name', 'short_text', { required: true, standardColumn: 'name' }),
          ]),
        ],
      },
      'beneficiary_application',
    );
    expect(entries).toEqual([
      {
        group: 'identity',
        id: 'identity',
        roles: [
          'nid_or_birth_reg',
          'father_or_husband_name',
          'mobile',
          'gender',
          'address',
          'village',
        ],
      },
    ]);
  });

  it('asks no identity question of a form that is not an application', () => {
    const only = { sections: [section('section_1', [field('q_note', 'short_text')])] };
    expect(publishEntries(only, 'other')).toEqual([]);
    expect(publishEntries(only, 'library')).toEqual([]);
  });

  it('words a missing text by its place and its language, one entry per place of a question', () => {
    const entries = publishEntries(
      form(
        section(
          'extra',
          [
            field('q_kind', 'radio', {
              label: T('ধরন', ''),
              settings: { help: T('একটি বেছে নিন', '') },
              options: [
                option('a', { label: T('ক', '') }),
                option('b', { label: T('খ', '') }),
                option('c', { label: T('', 'C') }),
              ],
            }),
            field('q_table', 'number_table', {
              label: T('ছক', 'Table'),
              settings: {
                table: {
                  rows: [{ key: 'r1', label: T('সারি', '') }],
                  cols: [{ key: 'c1', label: T('', 'Column') }],
                },
              },
            }),
            field('q_level', 'calculation', {
              label: T('স্তর', 'Level'),
              calculation: { expr: { result: 'low' } },
              settings: { results: [{ code: 'low', label: T('কম', '') }] },
            }),
          ],
          { title: T('অতিরিক্ত', '') },
        ),
      ),
      'beneficiary_application',
    );
    expect(groupsOf(entries)).toEqual(Array.from({ length: 8 }, () => 'texts'));
    expect(
      entries.map((e) => (e.group === 'texts' ? [e.place, e.text, e.language, e.count] : null)),
    ).toEqual([
      [{ section: 'extra' }, 'title', 'en', 1],
      [{ section: 'extra', field: 'q_kind' }, 'label', 'en', 1],
      [{ section: 'extra', field: 'q_kind' }, 'help', 'en', 1],
      [{ section: 'extra', field: 'q_kind' }, 'option', 'en', 2],
      [{ section: 'extra', field: 'q_kind' }, 'option', 'bn', 1],
      [{ section: 'extra', field: 'q_table' }, 'table_row', 'en', 1],
      [{ section: 'extra', field: 'q_table' }, 'table_col', 'bn', 1],
      [{ section: 'extra', field: 'q_level' }, 'result', 'en', 1],
    ]);
    // every entry has a key of its own
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    // as many texts as the translations have to fill
    expect(missingTexts(entries)).toBe(9);
  });

  it('tells a part from a question of the same key', () => {
    // the identity part "address" holds the question "address"
    const sections = coreSections().map((s) =>
      s.key === 'address' ? { ...s, title: T('ঠিকানা', '') } : s,
    );
    const [entry] = publishEntries({ sections }, 'beneficiary_application');
    expect(entry).toMatchObject({ group: 'texts', place: { section: 'address' }, text: 'title' });
  });

  it('lists every other problem once per question with its code, after the texts', () => {
    const entries = publishEntries(
      form(
        extra(
          field('q_total', 'calculation', { label: T('মোট', '') }),
          field('q_why', 'long_text', {
            label: T('কারণ', 'Reason'),
            logic: {
              show_if: {
                all: [
                  { field: 'q_gone', op: 'eq', value: 'a' },
                  { field: 'q_gone', op: 'eq', value: 'b' },
                ],
              },
            },
          }),
        ),
      ),
      'beneficiary_application',
    );
    expect(
      entries.map((e) => [e.group, 'place' in e ? e.place : null, 'code' in e ? e.code : null]),
    ).toEqual([
      ['texts', { section: 'extra', field: 'q_total' }, null],
      ['other', { section: 'extra', field: 'q_total' }, 'form.calculation_missing'],
      ['other', { section: 'extra', field: 'q_why' }, 'form.unknown_reference'],
    ]);
  });

  it('leads a problem of the identity questions to its question, and the points of the score to their dialog', () => {
    const sections = coreSections().map((s) => ({
      ...s,
      fields: s.fields.map((f) => (f.fieldKey === 'mobile' ? { ...f, required: false } : f)),
    }));
    const scored = field('q_kind', 'radio', {
      label: T('ধরন', 'Kind'),
      options: [option('a')],
      settings: { score: { options: { a: 60 } } },
    });
    const entries = publishEntries(
      { sections: [...sections, extra(scored)], scoring: { not_previously_assisted: 60 } },
      'beneficiary_application',
    );
    expect(entries).toEqual([
      {
        group: 'other',
        id: 'form.score_over_max|scoring',
        place: 'scoring',
        code: 'form.score_over_max',
      },
      {
        group: 'other',
        id: 'form.core_field_optional|field:mobile',
        place: { section: 'basic_info', field: 'mobile' },
        code: 'form.core_field_optional',
      },
    ]);
  });

  it('drops an entry once its cause is gone', () => {
    const missing = form(extra(field('q_note', 'short_text', { label: T('মন্তব্য', '') })));
    expect(publishEntries(missing, 'beneficiary_application')).toHaveLength(1);
    const fixed = form(extra(field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })));
    expect(publishEntries(fixed, 'beneficiary_application')).toEqual([]);
  });
});

describe('what the server said last', () => {
  const draft = form(extra(field('q_note', 'short_text', { label: T('মন্তব্য', '') })));

  it('adds a problem the check of the draft does not know, once, with the server’s words', () => {
    const detail = {
      path: 'gender',
      code: 'form.list_empty',
      message: 'এই প্রশ্নের তালিকায় কোনো অপশন নেই।',
    };
    const entries = publishEntries(draft, 'beneficiary_application', [detail, { ...detail }]);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({
      group: 'server',
      id: 'server|form.list_empty|gender',
      place: { section: 'basic_info', field: 'gender' },
      path: 'gender',
      message: 'এই প্রশ্নের তালিকায় কোনো অপশন নেই।',
    });
  });

  it('leaves out what the check of the draft already lists', () => {
    const entries = publishEntries(draft, 'beneficiary_application', [
      {
        path: 'q_note',
        code: 'form.label_language',
        message: 'প্রতিটি লেখা বাংলা ও ইংরেজি দুই ভাষাতেই লিখুন।',
        params: { fieldKey: 'q_note', text: 'label', language: 'en' },
      },
    ]);
    expect(groupsOf(entries)).toEqual(['texts']);
    // an identity role the server names is the identity entry's
    const bare = { sections: [section('section_1', [field('q_note', 'short_text')])] };
    expect(
      groupsOf(
        publishEntries(bare, 'beneficiary_application', [
          { path: 'mobile', code: 'form.core_field_missing', message: 'x' },
        ]),
      ),
    ).toEqual(['identity']);
  });

  it('keeps a missing text the server names at another place of the same question', () => {
    const entries = publishEntries(draft, 'beneficiary_application', [
      {
        path: 'q_note',
        code: 'form.label_language',
        message: 'প্রতিটি লেখা বাংলা ও ইংরেজি দুই ভাষাতেই লিখুন।',
        params: { fieldKey: 'q_note', text: 'option', language: 'en', option: 'a' },
      },
    ]);
    expect(groupsOf(entries)).toEqual(['texts', 'server']);
  });

  it('stays while the draft changes elsewhere, and leads nowhere when it names no question or part', () => {
    const detail = { path: 'sections', code: 'form.too_many', message: 'ফর্মটি অনেক বড়।' };
    const changed = form(extra(field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })));
    for (const definition of [draft, changed]) {
      expect(publishEntries(definition, 'beneficiary_application', [detail]).at(-1)).toEqual({
        group: 'server',
        id: 'server|form.too_many|sections',
        place: null,
        path: 'sections',
        message: 'ফর্মটি অনেক বড়।',
      });
    }
  });

  it('names a part when no question has the key', () => {
    const [entry] = publishEntries(form(), 'beneficiary_application', [
      { path: 'basic_info', code: 'form.too_long', message: 'x' },
    ]);
    expect(entry).toMatchObject({ group: 'server', place: { section: 'basic_info' } });
  });
});

describe('what the server said about a draft that has changed since', () => {
  const refusedDraft = form(
    extra(
      field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') }),
      field('q_more', 'short_text', { label: T('আরও', 'More') }),
    ),
    section('last', [field('q_last', 'number', { label: T('শেষ', 'Last') })]),
  );
  const about = (path: string) => ({ path, code: 'form.too_long', message: 'x' });
  const details = [
    about('q_note'),
    about('q_more'),
    about('extra'),
    about('last'),
    about('sections'),
  ];
  const pathsOf = (now: FormDefinition) => standing(details, refusedDraft, now).map((d) => d.path);

  it('keeps everything while the draft is as the server saw it, as the same list', () => {
    expect(standing(details, refusedDraft, refusedDraft)).toBe(details);
    // without the draft it was said about, nothing can be told apart
    expect(standing(details, null, form())).toBe(details);
  });

  it('drops what names a question once that question is edited, and its part with it', () => {
    const edited = updateField(refusedDraft, 'q_note', { label: T('মন্তব্য লিখুন', 'Note') });
    // the other question of the part, the other part and the whole form stay
    expect(pathsOf(edited)).toEqual(['q_more', 'last', 'sections']);
    // undone, the question is as the server saw it again
    expect(pathsOf(refusedDraft)).toEqual(['q_note', 'q_more', 'extra', 'last', 'sections']);
  });

  it('drops what names a question or a part that is gone', () => {
    const without = {
      ...refusedDraft,
      sections: refusedDraft.sections.filter((s) => s.key !== 'last'),
    };
    expect(pathsOf(without)).toEqual(['q_note', 'q_more', 'extra', 'sections']);
  });

  it('keeps everything through a move of a part and through the copy of the draft a save hands back', () => {
    const moved = moveSection(refusedDraft, 'last', -1);
    expect(pathsOf(moved)).toEqual(['q_note', 'q_more', 'extra', 'last', 'sections']);
    // the same draft as new objects, as the server's answer to a save is read
    const echoed = JSON.parse(JSON.stringify(moved)) as FormDefinition;
    expect(pathsOf(echoed)).toEqual(['q_note', 'q_more', 'extra', 'last', 'sections']);
  });
});

describe('the marks of the canvas', () => {
  it('gathers the worded entries by question and by part, and marks what only the server said without a line', () => {
    const sections = [
      ...coreSections(),
      section('extra', [field('q_note', 'short_text', { label: T('', '') })], {
        title: T('অতিরিক্ত', ''),
      }),
    ];
    const entries = publishEntries(
      { sections: sections.filter((s) => s.key !== 'address') },
      'beneficiary_application',
      [
        { path: 'gender', code: 'form.list_empty', message: 'x' },
        { path: 'sections', code: 'form.too_many', message: 'y' },
      ],
    );
    const { fields, sections: parts } = problemsByPlace(entries, (e) =>
      e.group === 'texts' ? `${e.text}.${e.language}` : e.group,
    );
    // the identity line and a problem of the whole form lead to no place
    expect([...fields]).toEqual([
      ['q_note', ['label.bn', 'label.en']],
      ['gender', []],
    ]);
    expect([...parts]).toEqual([['extra', ['title.en']]]);
  });
});
