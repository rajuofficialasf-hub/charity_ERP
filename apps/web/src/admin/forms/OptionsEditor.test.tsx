import type { FieldOption, FormField } from '@css/shared/forms';
import { expectNoAxeViolations } from '@/ui/testing';
import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { field, option, T } from '../../../test/forms';
import { resetClientForTests } from '../../api/client';
import type { MakeKey } from './draft';
import { OptionsEditor } from './OptionsEditor';
import { TYPED, type Typed } from './use-draft-history';

// The options of a choice question: one row per option with both languages side by side and icon
// buttons named by the option, Enter for the next option, Backspace on an empty one, several
// pasted lines as several options, yes and no in one press, and codes that never come from a text.

/** The options as the editor last handed them on, and how each change was made. */
let latest: FieldOption[];
let hows: (Typed | undefined)[];

function Harness({
  initial,
  mode,
  parent,
  makeCode,
}: {
  initial: FieldOption[];
  mode: 'full' | 'texts';
  parent?: FormField;
  makeCode?: MakeKey;
}) {
  const [options, setOptions] = useState(initial);
  return (
    <main>
      <OptionsEditor
        options={options}
        mode={mode}
        parent={parent ?? null}
        makeCode={makeCode}
        onChange={(next, how) => {
          latest = next;
          hows.push(how);
          setOptions(next);
        }}
      />
    </main>
  );
}

/** Codes handed out in turn, so a test knows the code a new option takes. */
const codesFrom = (...codes: string[]): MakeKey => {
  let next = 0;
  return () => codes[Math.min(next++, codes.length - 1)]!;
};
const open = (
  initial: FieldOption[],
  props: { mode?: 'full' | 'texts'; parent?: FormField; makeCode?: MakeKey } = {},
) => {
  latest = initial;
  hows = [];
  return renderApp(
    <Harness
      initial={initial}
      mode={props.mode ?? 'full'}
      parent={props.parent}
      makeCode={props.makeCode ?? codesFrom('o_new001', 'o_new002', 'o_new003')}
    />,
  );
};
const two = () => [option('a', { label: T('ক', 'A') }), option('b', { label: T('খ', 'B') })];
const bn = (n: number) =>
  screen.getByRole('textbox', { name: new RegExp(`^অপশন ${n} \\(বাংলা\\)`) });
const en = (n: number) =>
  screen.getByRole('textbox', { name: new RegExp(`^অপশন ${n} \\(ইংরেজি\\)`) });
const rows = async () => within(await screen.findByRole('list', { name: 'অপশন' }));
const codes = () => latest.map((o) => o.code);
const texts = () => latest.map((o) => [o.label.bn, o.label.en]);

beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
});

describe('a row per option', () => {
  it('holds both texts side by side and icon buttons that carry the option’s name', async () => {
    open(two());
    const items = (await rows()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const second = within(items[1]!);
    expect(second.getAllByRole('textbox').map((box) => (box as HTMLInputElement).value)).toEqual([
      'খ',
      'B',
    ]);
    // icons alone: the name is the accessible name, never a visible word
    for (const name of [
      'অপশন 2 উপরে নিন',
      'অপশন 2 নিচে নিন',
      'অপশন 2 সরান',
      'অপশন 2-এর আরও সেটিং দেখান',
    ]) {
      const button = second.getByRole('button', { name });
      expect(button).toHaveTextContent('');
    }
    // the first cannot go up, the last cannot go down
    expect(screen.getByRole('button', { name: 'অপশন 1 উপরে নিন' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'অপশন 2 নিচে নিন' })).toBeDisabled();
    // the further settings stay folded while nothing uses them
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('moves and removes an option by its buttons, each keeping its code', async () => {
    const user = userEvent.setup();
    open([...two(), option('c', { label: T('গ', 'C') })]);
    await user.click(await screen.findByRole('button', { name: 'অপশন 3 উপরে নিন' }));
    expect(codes()).toEqual(['a', 'c', 'b']);
    await user.click(screen.getByRole('button', { name: 'অপশন 1 নিচে নিন' }));
    expect(codes()).toEqual(['c', 'a', 'b']);
    await user.click(screen.getByRole('button', { name: 'অপশন 2 সরান' }));
    expect(codes()).toEqual(['c', 'b']);
    expect(texts()).toEqual([
      ['গ', 'C'],
      ['খ', 'B'],
    ]);
    // each of them a step of its own for the undo
    expect(hows).toEqual([undefined, undefined, undefined]);
  });

  it('opens an option’s further settings under its row, and by itself where they are in use', async () => {
    const user = userEvent.setup();
    open([...two(), option('other', { label: T('অন্যান্য', 'Other'), allowsOtherText: true })]);
    // the "other" option shows its setting at once
    expect(
      await screen.findByRole('checkbox', { name: 'অপশন 3 বেছে নিলে লেখার ঘর খুলবে' }),
    ).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'অপশন 1 বেছে নিলে লেখার ঘর খুলবে' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'অপশন 1-এর আরও সেটিং দেখান' }));
    await user.click(screen.getByRole('checkbox', { name: 'অপশন 1 বেছে নিলে লেখার ঘর খুলবে' }));
    expect(latest[0]).toMatchObject({ code: 'a', allowsOtherText: true });
    await user.click(screen.getByRole('button', { name: 'অপশন 1-এর আরও সেটিং লুকান' }));
    expect(
      screen.queryByRole('checkbox', { name: 'অপশন 1 বেছে নিলে লেখার ঘর খুলবে' }),
    ).not.toBeInTheDocument();
  });

  it('shows every option the answer it follows while the question branches', async () => {
    const user = userEvent.setup();
    const parent = field('has_cow', 'radio', {
      label: T('গরু আছে?', 'Has a cow?'),
      options: [
        option('yes', { label: T('হ্যাঁ', 'Yes') }),
        option('no', { label: T('না', 'No') }),
      ],
    });
    open(two(), { parent });
    const follows = await screen.findByRole('combobox', {
      name: /^অপশন 2 দেখাবে যখন “গরু আছে\?”-এর উত্তর/,
    });
    await user.click(follows);
    await user.click(await screen.findByRole('option', { name: 'হ্যাঁ' }));
    expect(latest[1]).toMatchObject({ code: 'b', dependsOnOptionCode: 'yes' });
  });
});

describe('the keys', () => {
  it('adds an option right after the one Enter is pressed in, with the cursor in its Bengali text', async () => {
    const user = userEvent.setup();
    open(two());
    await user.click(bn(1));
    await user.keyboard('{Enter}');
    expect(codes()).toEqual(['a', 'o_new001', 'b']);
    expect(bn(2)).toHaveFocus();
    expect(bn(2)).toHaveValue('');
    // from the English text too, and typing goes on in the new option
    await user.click(en(3));
    await user.keyboard('{Enter}গ');
    expect(codes()).toEqual(['a', 'o_new001', 'b', 'o_new002']);
    expect(texts().at(-1)).toEqual(['গ', '']);
    // an added option is a step of its own; the letter typed after it is typing
    expect(hows).toEqual([undefined, undefined, TYPED]);
  });

  it('leaves Enter to a letter that is still being composed', async () => {
    open(two());
    await rows();
    fireEvent.keyDown(bn(1), { key: 'Enter', isComposing: true });
    expect(codes()).toEqual(['a', 'b']);
    fireEvent.keyDown(bn(1), { key: 'Enter', shiftKey: true });
    expect(codes()).toEqual(['a', 'b']);
  });

  it('removes an option with no text when Backspace is pressed in its Bengali text', async () => {
    const user = userEvent.setup();
    open([...two(), option('c', { label: T('', '') })]);
    await user.click(bn(3));
    await user.keyboard('{Backspace}');
    expect(codes()).toEqual(['a', 'b']);
    // the cursor goes to the option before, whose text stays whole
    expect(bn(2)).toHaveFocus();
    expect(texts()).toEqual([
      ['ক', 'A'],
      ['খ', 'B'],
    ]);
    expect(hows).toEqual([undefined]);
  });

  it('keeps an option that has a text in either language, and one a held key has just emptied', async () => {
    const user = userEvent.setup();
    open([option('a', { label: T('ক', '') }), option('b', { label: T('', 'B') })]);
    await user.click(bn(2));
    await user.keyboard('{Backspace}');
    expect(codes()).toEqual(['a', 'b']);
    // the first Backspace empties the text; the option goes only with a press of its own
    await user.click(bn(1));
    await user.keyboard('{Backspace}');
    expect(texts()[0]).toEqual(['', '']);
    expect(codes()).toEqual(['a', 'b']);
    fireEvent.keyDown(bn(1), { key: 'Backspace', repeat: true });
    expect(codes()).toEqual(['a', 'b']);
    await user.keyboard('{Backspace}');
    expect(codes()).toEqual(['b']);
    expect(bn(1)).toHaveFocus();
  });

  it('gives the cursor to the add button when the last option goes', async () => {
    const user = userEvent.setup();
    open([option('a', { label: T('', '') })]);
    await user.click(bn(1));
    await user.keyboard('{Backspace}');
    expect(codes()).toEqual([]);
    expect(screen.getByRole('button', { name: 'অপশন যোগ করুন' })).toHaveFocus();
  });
});

describe('pasting', () => {
  it('makes an option of each line pasted into a Bengali text, then fills their English line by line', async () => {
    const user = userEvent.setup();
    open([option('a', { label: T('', '') })]);
    await user.click(bn(1));
    await user.paste('বৃদ্ধ\nবিধবা\n\nএতিম\n');
    expect(codes()).toEqual(['a', 'o_new001', 'o_new002']);
    expect(texts()).toEqual([
      ['বৃদ্ধ', ''],
      ['বিধবা', ''],
      ['এতিম', ''],
    ]);
    await user.click(en(1));
    await user.paste('Elderly\r\nWidow\r\nOrphan');
    expect(codes()).toEqual(['a', 'o_new001', 'o_new002']);
    expect(texts()).toEqual([
      ['বৃদ্ধ', 'Elderly'],
      ['বিধবা', 'Widow'],
      ['এতিম', 'Orphan'],
    ]);
    // each paste is one step of its own
    expect(hows).toEqual([undefined, undefined]);
  });

  it('pastes a single line into the text as any text', async () => {
    const user = userEvent.setup();
    open([option('a', { label: T('', '') })]);
    await user.click(bn(1));
    await user.paste('একটি লাইন');
    expect(codes()).toEqual(['a']);
    expect(texts()).toEqual([['একটি লাইন', '']]);
  });
});

describe('a new option', () => {
  it('starts an empty list with yes and no in both languages in one press', async () => {
    const user = userEvent.setup();
    open([]);
    await user.click(await screen.findByRole('button', { name: 'হ্যাঁ / না বসান' }));
    expect(texts()).toEqual([
      ['হ্যাঁ', 'Yes'],
      ['না', 'No'],
    ]);
    expect(codes()).toEqual(['o_new001', 'o_new002']);
    // the offer is for an empty list only
    expect(screen.queryByRole('button', { name: 'হ্যাঁ / না বসান' })).not.toBeInTheDocument();
    expect(bn(2)).toHaveValue('না');
  });

  it('takes a random code that its text never changes, and the cursor', async () => {
    const user = userEvent.setup();
    latest = [];
    hows = [];
    // the editor's own maker, as the builder uses it
    renderApp(<Harness initial={[]} mode="full" />);
    await user.click(await screen.findByRole('button', { name: 'অপশন যোগ করুন' }));
    const [added] = latest;
    expect(added!.code).toMatch(/^o_[a-z0-9]{6}$/);
    expect(bn(1)).toHaveFocus();
    await user.keyboard('Yes');
    await user.type(en(1), 'Yes');
    expect(latest).toEqual([{ ...added!, label: T('Yes', 'Yes') }]);
    // the typing joins into one step; the addition was its own
    expect(hows).toEqual([undefined, ...Array.from({ length: 6 }, () => TYPED)]);
  });
});

describe('on a phone', () => {
  it('changes the texts alone: no button, and Enter adds nothing', async () => {
    const user = userEvent.setup();
    open(two(), { mode: 'texts' });
    await rows();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await user.click(bn(1));
    await user.keyboard('{Enter}');
    await user.paste('এক\nদুই');
    expect(codes()).toEqual(['a', 'b']);
    await user.type(bn(2), 'গ');
    expect(texts()[1]).toEqual(['খগ', 'B']);
  });
});

it('has no axe violation, with the further settings of an option open', async () => {
  open([...two(), option('other', { label: T('অন্যান্য', 'Other'), allowsOtherText: true })]);
  await rows();
  await expectNoAxeViolations(document.body);
});
