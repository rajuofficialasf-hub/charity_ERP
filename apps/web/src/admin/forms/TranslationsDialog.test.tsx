import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, field, option, section, T } from '../../../test/forms';
import { resetClientForTests } from '../../api/client';
import { missingTexts, publishEntries } from './publish-entries';
import { TranslationsDialog } from './TranslationsDialog';
import type { Typed } from './use-draft-history';

// The translations of a form: every text in both languages side by side, part by part, with what
// is missing marked and counted as the list beside Publish counts it, written into the draft as
// it is typed.

/** The draft as the dialog last handed it on, and how each change was made. */
let latest: FormDefinition;
let hows: (Typed | undefined)[];
let closed: number;

function Harness({ initial, onlyMissing }: { initial: FormDefinition; onlyMissing: boolean }) {
  const [def, setDef] = useState(initial);
  return (
    <main>
      <TranslationsDialog
        definition={def}
        onlyMissing={onlyMissing}
        onChange={(next, how) => {
          latest = next;
          hows.push(how);
          setDef(next);
        }}
        onClose={() => {
          closed += 1;
        }}
      />
    </main>
  );
}
const open = (initial: FormDefinition, onlyMissing = false) => {
  latest = initial;
  hows = [];
  closed = 0;
  return renderApp(<Harness initial={initial} onlyMissing={onlyMissing} />);
};

/** A form of two parts, built in Bengali with some of its English written. */
const worded = (): FormDefinition => ({
  sections: [
    section(
      'one',
      [
        field('kind', 'radio', {
          label: T('ধরন', 'Kind'),
          settings: { help: T('একটি বেছে নিন', '') },
          options: [option('a', { label: T('ক', 'A') }), option('b', { label: T('খ', '') })],
        }),
        field('herd', 'number_table', {
          label: T('গরু-ছাগল', ''),
          settings: {
            table: {
              rows: [{ key: 'r1', label: T('গরু', 'Cows') }],
              cols: [{ key: 'c1', label: T('নিজের', '') }],
            },
          },
        }),
        field('level', 'calculation', {
          label: T('অবস্থা', 'Level'),
          settings: { results: [{ code: 'poor', label: T('দরিদ্র', '') }] },
        }),
      ],
      { title: T('প্রথম অংশ', 'First part') },
    ),
    section('two', [field('note', 'short_text', { label: T('মন্তব্য', '') })], {
      title: T('দ্বিতীয় অংশ', ''),
    }),
  ],
});
const MISSING = 7;

const dialog = async () => within(await screen.findByRole('dialog', { name: 'অনুবাদ' }));
/** Checks that a part holds exactly these text boxes, by name and value, in this order. */
const expectTexts = (scope: ReturnType<typeof within>, part: string, texts: [string, string][]) => {
  const region = within(scope.getByRole('region', { name: part }));
  const boxes = region.getAllByRole('textbox');
  expect(boxes).toHaveLength(texts.length);
  texts.forEach(([name, value], i) => {
    expect(region.getByRole('textbox', { name }), name).toBe(boxes.at(i));
    expect(boxes.at(i), name).toHaveValue(value);
  });
};
const count = (scope: ReturnType<typeof within>) => scope.getByRole('status').textContent;

beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
});

describe('the list of texts', () => {
  it('shows every text of the form in both languages, part by part in the form’s order', async () => {
    open(worded());
    const view = await dialog();
    expect(view.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'প্রথম অংশ',
      'দ্বিতীয় অংশ',
    ]);
    expectTexts(view, 'প্রথম অংশ', [
      ['অংশের নাম (বাংলা)', 'প্রথম অংশ'],
      ['অংশের নাম (ইংরেজি)', 'First part'],
      ['প্রশ্ন 1 (বাংলা)', 'ধরন'],
      ['প্রশ্ন 1 (ইংরেজি)', 'Kind'],
      ['প্রশ্ন 1: সহায়ক লেখা (বাংলা)', 'একটি বেছে নিন'],
      ['প্রশ্ন 1: সহায়ক লেখা (ইংরেজি)', ''],
      ['প্রশ্ন 1: অপশন 1 (বাংলা)', 'ক'],
      ['প্রশ্ন 1: অপশন 1 (ইংরেজি)', 'A'],
      ['প্রশ্ন 1: অপশন 2 (বাংলা)', 'খ'],
      ['প্রশ্ন 1: অপশন 2 (ইংরেজি)', ''],
      ['প্রশ্ন 2 (বাংলা)', 'গরু-ছাগল'],
      ['প্রশ্ন 2 (ইংরেজি)', ''],
      ['প্রশ্ন 2: ছকের সারি 1 (বাংলা)', 'গরু'],
      ['প্রশ্ন 2: ছকের সারি 1 (ইংরেজি)', 'Cows'],
      ['প্রশ্ন 2: ছকের কলাম 1 (বাংলা)', 'নিজের'],
      ['প্রশ্ন 2: ছকের কলাম 1 (ইংরেজি)', ''],
      ['প্রশ্ন 3 (বাংলা)', 'অবস্থা'],
      ['প্রশ্ন 3 (ইংরেজি)', 'Level'],
      ['প্রশ্ন 3: হিসাবের ফল 1 (বাংলা)', 'দরিদ্র'],
      ['প্রশ্ন 3: হিসাবের ফল 1 (ইংরেজি)', ''],
    ]);
    expectTexts(view, 'দ্বিতীয় অংশ', [
      ['অংশের নাম (বাংলা)', 'দ্বিতীয় অংশ'],
      ['অংশের নাম (ইংরেজি)', ''],
      ['প্রশ্ন 1 (বাংলা)', 'মন্তব্য'],
      ['প্রশ্ন 1 (ইংরেজি)', ''],
    ]);
    // an English text says it is English, for a screen reader and the keyboard
    expect(view.getAllByRole('textbox', { name: 'প্রশ্ন 1 (ইংরেজি)' })[0]).toHaveAttribute(
      'lang',
      'en',
    );
  });

  it('counts the missing texts as the list beside Publish does, and marks each by an icon with a name', async () => {
    const def = worded();
    open(def);
    const view = await dialog();
    expect(missingTexts(publishEntries(def, 'other'))).toBe(MISSING);
    expect(count(view)).toBe(`${MISSING}টি লেখা বাকি`);
    expect(view.getAllByRole('img', { name: 'বাকি' })).toHaveLength(MISSING);
    // one mark in a row that lacks one language, two where both are missing, none where neither
    const marksAt = (name: string) =>
      within(view.getByRole('textbox', { name }).closest('li') as HTMLElement).queryAllByRole(
        'img',
        { name: 'বাকি' },
      );
    expect(marksAt('প্রশ্ন 2 (ইংরেজি)')).toHaveLength(1);
    expect(marksAt('প্রশ্ন 3 (ইংরেজি)')).toHaveLength(0);
  });

  it('says so when nothing is missing', async () => {
    const user = userEvent.setup();
    open({ sections: [section('one', [field('q', 'short_text')])] });
    const view = await dialog();
    expect(count(view)).toBe('সব লেখা দুই ভাষাতেই আছে');
    expect(view.queryByRole('img', { name: 'বাকি' })).not.toBeInTheDocument();
    await user.click(view.getByRole('switch', { name: 'শুধু বাকি' }));
    expect(view.getByText('কোনো লেখা বাকি নেই।')).toBeInTheDocument();
    expect(view.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('names the identity role of a marked question, and shows a list’s options to read', async () => {
    const def: FormDefinition = { sections: coreSections() };
    open(def);
    const view = await dialog();
    const part = within(view.getByRole('region', { name: 'basic_info' }));
    expect(part.getByText('পরিচয়: নাম')).toBeInTheDocument();
    expect(part.getByText('পরিচয়: লিঙ্গ')).toBeInTheDocument();
    // the gender question's options are its reference list's
    expect(
      part.getByText('এই অপশনগুলো সিস্টেমের তালিকা থেকে আসে; এখানে বদলানো যায় না।'),
    ).toBeInTheDocument();
    expect(part.queryByText(/^প্রশ্ন: /)).not.toBeInTheDocument();
    for (const name of ['প্রশ্ন 5: অপশন 1 (বাংলা)', 'প্রশ্ন 5: অপশন 2 (ইংরেজি)'])
      expect(part.getByRole('textbox', { name })).toHaveAttribute('readonly');
    expect(part.getByRole('textbox', { name: 'প্রশ্ন 5 (বাংলা)' })).not.toHaveAttribute('readonly');
  });
});

describe('writing a text', () => {
  it('puts it into the draft at once, lowers the count, and keeps each field’s typing apart', async () => {
    const user = userEvent.setup();
    open(worded());
    const view = await dialog();
    await user.type(view.getByRole('textbox', { name: 'প্রশ্ন 2 (ইংরেজি)' }), 'Herd');
    expect(latest.sections[0]!.fields[1]!.label).toEqual(T('গরু-ছাগল', 'Herd'));
    expect(count(view)).toBe(`${MISSING - 1}টি লেখা বাকি`);
    expect(view.getAllByRole('img', { name: 'বাকি' })).toHaveLength(MISSING - 1);
    // an option, a part's name and a table's column, each where it belongs
    await user.type(view.getByRole('textbox', { name: 'প্রশ্ন 1: অপশন 2 (ইংরেজি)' }), 'B');
    await user.type(view.getByRole('textbox', { name: 'প্রশ্ন 2: ছকের কলাম 1 (ইংরেজি)' }), 'Own');
    const second = within(view.getByRole('region', { name: 'দ্বিতীয় অংশ' }));
    await user.type(second.getByRole('textbox', { name: 'অংশের নাম (ইংরেজি)' }), 'Second');
    expect(latest.sections[0]!.fields[0]!.options![1]).toMatchObject({
      code: 'b',
      label: T('খ', 'B'),
    });
    expect(latest.sections[0]!.fields[1]!.settings!.table!.cols[0]!.label).toEqual(
      T('নিজের', 'Own'),
    );
    expect(latest.sections[1]!.title).toEqual(T('দ্বিতীয় অংশ', 'Second'));
    expect(count(view)).toBe(`${MISSING - 4}টি লেখা বাকি`);
    expect(missingTexts(publishEntries(latest, 'other'))).toBe(MISSING - 4);
    // every letter is typing in its own field: the history joins a field's letters and no more
    expect(new Set(hows.map((how) => how?.key))).toEqual(
      new Set(['label|herd|en', 'option|kind|b|en', 'table_col|herd|c1|en', 'title|two|en']),
    );
    expect(hows.every((how) => how?.merge === true)).toBe(true);
    expect(hows.slice(0, 4).map((how) => how?.key)).toEqual(Array(4).fill('label|herd|en'));
  });

  it('keeps the row of a help text that is emptied, to be written again', async () => {
    const user = userEvent.setup();
    open(worded());
    const view = await dialog();
    const bn = () => view.getByRole('textbox', { name: 'প্রশ্ন 1: সহায়ক লেখা (বাংলা)' });
    const en = () => view.getByRole('textbox', { name: 'প্রশ্ন 1: সহায়ক লেখা (ইংরেজি)' });
    await user.clear(bn());
    // the form holds no help text any more, and nothing counts as missing for it
    expect(latest.sections[0]!.fields[0]!.settings?.help).toBeUndefined();
    expect(count(view)).toBe(`${MISSING - 1}টি লেখা বাকি`);
    // the row is still there, under its question and above the options, both fields empty
    expect(bn()).toHaveValue('');
    expect(en()).toHaveValue('');
    const boxes = within(view.getByRole('region', { name: 'প্রথম অংশ' })).getAllByRole('textbox');
    expect(boxes.indexOf(bn())).toBe(4);
    expect(within(bn().closest('li')!).queryByRole('img', { name: 'বাকি' })).toBeNull();
    // written again from the first letter
    await user.type(en(), 'Pick one');
    expect(latest.sections[0]!.fields[0]!.settings!.help).toEqual(T('', 'Pick one'));
    expect(en()).toHaveValue('Pick one');
    expect(count(view)).toBe(`${MISSING}টি লেখা বাকি`);
  });

  it('closes by its button', async () => {
    const user = userEvent.setup();
    open(worded());
    const view = await dialog();
    await user.click(view.getByRole('button', { name: 'ঠিক আছে' }));
    expect(closed).toBe(1);
  });
});

describe('missing only', () => {
  it('hides the complete rows, and keeps a row in view while it is being written', async () => {
    const user = userEvent.setup();
    open(worded());
    const view = await dialog();
    expect(view.getAllByRole('textbox')).toHaveLength(24);
    // every question's own row is in view, so no text has to name its question
    expect(view.queryByText('প্রশ্ন: ধরন')).not.toBeInTheDocument();
    await user.click(view.getByRole('switch', { name: 'শুধু বাকি' }));
    // the seven rows that lack a language, each with both its fields
    expect(view.getAllByRole('textbox')).toHaveLength(MISSING * 2);
    // a text whose question is complete, and so not in view, names its question once
    expect(view.getAllByText('প্রশ্ন: ধরন')).toHaveLength(1);
    expect(view.getAllByText('প্রশ্ন: অবস্থা')).toHaveLength(1);
    expect(view.queryByText('প্রশ্ন: গরু-ছাগল')).not.toBeInTheDocument();
    expect(view.queryByRole('textbox', { name: 'প্রশ্ন 1 (বাংলা)' })).toBeInTheDocument();
    expect(view.queryByRole('textbox', { name: 'প্রশ্ন 3 (বাংলা)' })).not.toBeInTheDocument();
    expect(
      view.queryByRole('textbox', { name: 'প্রশ্ন 1: অপশন 1 (বাংলা)' }),
    ).not.toBeInTheDocument();
    // a row does not leave under the cursor once its text is written
    const herd = view.getByRole('textbox', { name: 'প্রশ্ন 2 (ইংরেজি)' });
    await user.type(herd, 'Herd');
    expect(herd).toHaveValue('Herd');
    expect(herd).toHaveFocus();
    expect(view.getAllByRole('textbox')).toHaveLength(MISSING * 2);
    // switched off and on again, the written row is gone with the other complete ones
    await user.click(view.getByRole('switch', { name: 'শুধু বাকি' }));
    expect(view.getAllByRole('textbox')).toHaveLength(24);
    await user.click(view.getByRole('switch', { name: 'শুধু বাকি' }));
    expect(view.getAllByRole('textbox')).toHaveLength((MISSING - 1) * 2);
    expect(view.queryByRole('textbox', { name: 'প্রশ্ন 2 (ইংরেজি)' })).not.toBeInTheDocument();
  });

  it('is on from the start when the dialog is opened for the missing texts', async () => {
    open(worded(), true);
    const view = await dialog();
    expect(view.getByRole('switch', { name: 'শুধু বাকি' })).toBeChecked();
    expect(view.getAllByRole('textbox')).toHaveLength(MISSING * 2);
  });

  it('leaves out a part with nothing missing', async () => {
    open(
      {
        sections: [
          section('one', [field('q', 'short_text')], { title: T('প্রথম অংশ', 'First part') }),
          section('two', [field('note', 'short_text', { label: T('মন্তব্য', '') })], {
            title: T('দ্বিতীয় অংশ', 'Second part'),
          }),
        ],
      },
      true,
    );
    const view = await dialog();
    expect(view.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'দ্বিতীয় অংশ',
    ]);
    expect(view.getAllByRole('textbox')).toHaveLength(2);
  });
});

describe('a long form', () => {
  it('draws every row in the end, the first ones at once', async () => {
    const questions = Array.from({ length: 150 }, (_, i) =>
      field(`q_${i}`, 'short_text', { label: T(`প্রশ্ন ${i}`, '') }),
    );
    open({ sections: [section('one', questions)] });
    const view = await dialog();
    expect(count(view)).toBe('150টি লেখা বাকি');
    expect(view.getAllByRole('textbox').length).toBeGreaterThanOrEqual(120);
    await waitFor(() => expect(view.getAllByRole('textbox')).toHaveLength(302), {
      timeout: 15_000,
    });
  }, 30_000);
});

it('has no axe violation', async () => {
  open(worded());
  await dialog();
  await expectNoAxeViolations(document.body);
}, 20_000);
