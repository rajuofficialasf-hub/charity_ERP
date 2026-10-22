import type { Condition } from '@css/shared';
import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { definition, field, option, section, T } from '../../../test/forms';
import { resetClientForTests } from '../../lib/api';
import type { Selection } from './selection';
import { SettingsPane } from './SettingsPane';

// The settings pane of the form builder: the project's own questions, the options and their
// branching, the named text checks, the limits, the condition rows and the calculation terms,
// each written back into the draft in the engine's shape.

let latest: FormDefinition;

function Harness({ initial, select }: { initial: FormDefinition; select: Selection }) {
  const [def, setDef] = useState(initial);
  const [selected, setSelected] = useState<Selection | null>(select);
  return (
    <SettingsPane
      definition={def}
      selected={selected}
      mode="full"
      onChange={(next) => {
        latest = next;
        setDef(next);
      }}
      onSelect={setSelected}
    />
  );
}

const open = (initial: FormDefinition, select: Selection) => {
  latest = initial;
  return renderApp(<Harness initial={initial} select={select} />);
};

/** Picks an option of a select of the set, found by its label. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  optionName: string | RegExp,
  scope: ReturnType<typeof within> | typeof screen = screen,
) {
  await user.click(scope.getByRole('button', { name: label }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

const fieldOf = (def: FormDefinition, key: string) =>
  def.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === key)!;

beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['program_manager'] });
});

describe('the own question', () => {
  it('needs both labels and, for a choice, an option in both languages', async () => {
    const user = userEvent.setup();
    open(definition(section('project', [], { title: T('প্রকল্পের প্রশ্ন', 'Project') })), {
      section: 'project',
    });
    await user.click(await screen.findByRole('button', { name: 'নিজের প্রশ্ন যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন প্রশ্ন' });
    await user.click(within(dialog).getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('দুই ভাষাতেই লেবেল লিখুন।');
    await choose(user, /প্রশ্নের ধরন/, 'একটি বেছে নিন', within(dialog));
    await user.type(
      within(dialog).getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }),
      'নিজের ঘর আছে?',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }),
      'Own house?',
    );
    await user.click(within(dialog).getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('অন্তত একটি অপশন রাখুন');
    await user.type(within(dialog).getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }), 'হ্যাঁ');
    await user.type(within(dialog).getByRole('textbox', { name: /^অপশন 1 \(ইংরেজি\)/ }), 'Yes');
    await user.click(within(dialog).getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'নতুন প্রশ্ন' })).not.toBeInTheDocument(),
    );
    const added = fieldOf(latest, 'q_own_house');
    expect(added).toMatchObject({
      type: 'radio',
      label: { bn: 'নিজের ঘর আছে?', en: 'Own house?' },
      libraryFieldKey: null,
      options: [{ code: 'opt_1', label: { bn: 'হ্যাঁ', en: 'Yes' } }],
    });
    // the new question opens in the settings
    expect(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ })).toHaveValue('নিজের ঘর আছে?');
  }, 20_000);

  it('names the earlier answer a branching option follows', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section(
          'work',
          [
            field('occupation', 'radio', {
              label: T('পেশা', 'Occupation'),
              options: [
                option('business', { label: T('ব্যবসা', 'Business') }),
                option('farming', { label: T('কৃষি', 'Farming') }),
              ],
            }),
          ],
          { title: T('কাজ', 'Work') },
        ),
      ),
      { section: 'work' },
    );
    await user.click(await screen.findByRole('button', { name: 'নিজের প্রশ্ন যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন প্রশ্ন' });
    const scope = within(dialog);
    await choose(user, /প্রশ্নের ধরন/, 'তালিকা থেকে একটি', scope);
    await user.type(scope.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), 'ব্যবসার ধরন');
    await user.type(scope.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }), 'Kind of business');
    await choose(user, /কোন প্রশ্নের উত্তর অনুযায়ী/, 'পেশা', scope);
    await user.type(scope.getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }), 'দোকান');
    await user.type(scope.getByRole('textbox', { name: /^অপশন 1 \(ইংরেজি\)/ }), 'Shop');
    await choose(user, /অপশন 1 দেখাবে যখন “পেশা”-এর উত্তর/, 'ব্যবসা', scope);
    await user.click(scope.getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    await waitFor(() => expect(fieldOf(latest, 'q_kind_of_business')).toBeDefined());
    expect(fieldOf(latest, 'q_kind_of_business')).toMatchObject({
      logic: { options_depend_on: 'occupation' },
      options: [{ code: 'opt_1', dependsOnOptionCode: 'business' }],
    });
  }, 20_000);
});

describe('the field settings', () => {
  it('offers the seven named checks of a text and nothing else', async () => {
    const user = userEvent.setup();
    open(definition(section('extra', [field('phone_two', 'short_text')])), {
      section: 'extra',
      field: 'phone_two',
    });
    await user.click(await screen.findByRole('button', { name: /লেখা যাচাইয়ের নিয়ম/ }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([
      'যাচাই নেই',
      'জাতীয় পরিচয়পত্র নম্বর',
      'জন্মনিবন্ধন নম্বর',
      'মোবাইল নম্বর',
      'শুধু বাংলা লেখা',
      'ইমেইল',
      'পোস্ট কোড',
      'শুধু অঙ্ক',
    ]);
    await user.click(screen.getByRole('option', { name: 'মোবাইল নম্বর' }));
    expect(fieldOf(latest, 'phone_two').settings?.validation).toEqual({ pattern: 'mobile' });
  });

  it('gives a new option a code no removed option had', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('extra', [
          field('kind', 'radio', {
            label: T('ধরন', 'Kind'),
            options: [option('opt_1', { label: T('ক', 'A') })],
          }),
        ]),
      ),
      { section: 'extra', field: 'kind' },
    );
    await user.click(await screen.findByRole('button', { name: 'অপশন 1 সরান' }));
    await user.click(screen.getByRole('button', { name: 'অপশন যোগ করুন' }));
    const [added] = fieldOf(latest, 'kind').options!;
    expect(added!.code).toMatch(/^opt_[0-9a-f]{12}$/);
  });

  it('keeps a repeat group from having fewer rows at most than at least', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('family', [
          field('earners', 'repeat_group', {
            label: T('উপার্জনকারী', 'Earners'),
            settings: { repeat: { min_rows: 0, max_rows: 5 } },
          }),
          field('earner_name', 'short_text', {
            label: T('নাম', 'Name'),
            settings: { repeat: { group: 'earners' } },
          }),
        ]),
      ),
      { section: 'family', field: 'earners' },
    );
    expect(await screen.findByRole('list', { name: 'প্রতিটি সারির প্রশ্ন' })).toHaveTextContent(
      'নাম',
    );
    const min = screen.getByRole('textbox', { name: 'সবচেয়ে কম সারি' });
    await user.clear(min);
    await user.type(min, '6');
    expect(
      screen.getByText('সবচেয়ে কম সারি সবচেয়ে বেশি সারির চেয়ে বড় হতে পারবে না।'),
    ).toBeInTheDocument();
    // the emptied smallest was kept as no limit, the crossing 6 was not
    expect(fieldOf(latest, 'earners').settings?.repeat).toEqual({ max_rows: 5 });
    const max = screen.getByRole('textbox', { name: /সবচেয়ে বেশি সারি/ });
    await user.clear(max);
    await user.type(max, '8');
    expect(fieldOf(latest, 'earners').settings?.repeat).toEqual({ min_rows: 6, max_rows: 8 });
  });
});

describe('the condition rows', () => {
  const form = (showIf?: FormDefinition['sections'][number]['fields'][number]['logic']) =>
    definition(
      section('money', [
        field('has_loan', 'radio', {
          label: T('ঋণ আছে?', 'Has a loan?'),
          options: [
            option('yes', { label: T('হ্যাঁ', 'Yes') }),
            option('no', { label: T('না', 'No') }),
          ],
        }),
        field('income', 'number', { label: T('আয়', 'Income') }),
        field('loan_note', 'short_text', {
          label: T('ঋণের বিবরণ', 'Loan note'),
          ...(showIf ? { logic: showIf } : {}),
        }),
      ]),
    );

  it('saves two rows joined by "any" as the engine condition and shows them again', async () => {
    const user = userEvent.setup();
    const view = open(form(), { section: 'money', field: 'loan_note' });
    const show = within(await screen.findByRole('region', { name: 'কখন দেখাবে' }));
    await user.click(show.getByRole('button', { name: 'শর্ত যোগ করুন' }));
    await choose(user, /শর্ত 1: প্রশ্ন/, 'ঋণ আছে?', show);
    await choose(user, /শর্ত 1: মান/, 'হ্যাঁ', show);
    await user.click(show.getByRole('button', { name: 'শর্ত যোগ করুন' }));
    await choose(user, /শর্ত 2: প্রশ্ন/, 'আয়', show);
    await choose(user, /শর্ত 2: তুলনা/, 'বেশি', show);
    await user.type(show.getByRole('textbox', { name: 'শর্ত 2: মান' }), '5000');
    await user.click(show.getByRole('radio', { name: 'যেকোনো একটি মিললে' }));
    const condition: Condition = {
      any: [
        { field: 'has_loan', op: 'eq', value: 'yes' },
        { field: 'income', op: 'gt', value: 5000 },
      ],
    };
    expect(fieldOf(latest, 'loan_note').logic).toEqual({ show_if: condition });
    // opened again from the saved draft, the rows read the same
    view.unmount();
    open(form({ show_if: condition }), { section: 'money', field: 'loan_note' });
    const again = within(await screen.findByRole('region', { name: 'কখন দেখাবে' }));
    expect(again.getByRole('button', { name: /শর্ত 1: মান/ })).toHaveTextContent('হ্যাঁ');
    expect(again.getByRole('button', { name: /শর্ত 2: তুলনা/ })).toHaveTextContent('বেশি');
    expect(again.getByRole('textbox', { name: 'শর্ত 2: মান' })).toHaveValue('5000');
    expect(again.getByRole('radio', { name: 'যেকোনো একটি মিললে' })).toBeChecked();
  }, 20_000);

  it('shows a deeper condition read-only with its note, and removes it whole', async () => {
    const user = userEvent.setup();
    open(
      form({
        show_if: {
          any: [
            { all: [{ field: 'has_loan', op: 'eq', value: 'yes' }] },
            { field: 'income', op: 'lt', value: 100 },
          ],
        },
      }),
      { section: 'money', field: 'loan_note' },
    );
    const show = within(await screen.findByRole('region', { name: 'কখন দেখাবে' }));
    expect(show.getByText(/একাধিক স্তর আছে/)).toBeInTheDocument();
    expect(show.queryByRole('button', { name: 'শর্ত যোগ করুন' })).not.toBeInTheDocument();
    await user.click(show.getByRole('button', { name: 'শর্তটি মুছুন' }));
    expect(fieldOf(latest, 'loan_note').logic).toBeUndefined();
  });
});

describe('the calculation terms', () => {
  it('builds a total of three numbers and saves it', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('income', [
          field('a', 'money', { label: T('কৃষি আয়') }),
          field('b', 'money', { label: T('ব্যবসার আয়') }),
          field('c', 'money', { label: T('অন্য আয়') }),
          field('total', 'calculation', { label: T('মোট আয়') }),
        ]),
      ),
      { section: 'income', field: 'total' },
    );
    const calc = within(await screen.findByRole('region', { name: 'হিসাবের নিয়ম' }));
    for (let i = 0; i < 3; i += 1)
      await user.click(calc.getByRole('button', { name: 'পদ যোগ করুন' }));
    await choose(user, /(^|\s)পদ 2$/, 'ব্যবসার আয়', calc);
    await choose(user, /(^|\s)পদ 3$/, 'অন্য আয়', calc);
    expect(fieldOf(latest, 'total').calculation).toEqual({
      expr: { op: 'add', args: [{ field: 'a' }, { field: 'b' }, { field: 'c' }] },
    });
  }, 20_000);

  it('adds up a group question over its rows', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('family', [
          field('earners', 'repeat_group', { label: T('উপার্জনকারী') }),
          field('earner_income', 'money', {
            label: T('মাসিক আয়'),
            settings: { repeat: { group: 'earners' } },
          }),
          field('family_income', 'calculation', { label: T('পরিবারের আয়') }),
        ]),
      ),
      { section: 'family', field: 'family_income' },
    );
    const calc = within(await screen.findByRole('region', { name: 'হিসাবের নিয়ম' }));
    await user.click(calc.getByRole('button', { name: 'পদ যোগ করুন' }));
    await choose(user, /(^|\s)পদ 1$/, '“উপার্জনকারী”-এর সব সারির “মাসিক আয়”-এর যোগফল', calc);
    expect(fieldOf(latest, 'family_income').calculation).toEqual({
      expr: { sum_repeat: { group: 'earners', field: 'earner_income' } },
    });
  });

  it('offers the age and nisab rules only when the form has a question they read', async () => {
    const user = userEvent.setup();
    const view = open(
      definition(section('x', [field('n', 'number'), field('calc', 'calculation')])),
      { section: 'x', field: 'calc' },
    );
    let calc = within(await screen.findByRole('region', { name: 'হিসাবের নিয়ম' }));
    await user.click(calc.getByRole('button', { name: /হিসাবের ধরন/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'যোগ-বিয়োগ',
      'গুণ',
      'ভাগ',
    ]);
    await user.keyboard('{Escape}');
    view.unmount();
    open(
      definition(
        section('x', [
          field('dob', 'date', { label: T('জন্মতারিখ') }),
          field('net', 'money', { label: T('নিট সম্পদ') }),
          field('age', 'calculation'),
        ]),
      ),
      { section: 'x', field: 'age' },
    );
    calc = within(await screen.findByRole('region', { name: 'হিসাবের নিয়ম' }));
    await choose(user, /হিসাবের ধরন/, 'জন্মতারিখ থেকে বয়স', calc);
    expect(fieldOf(latest, 'age').calculation).toEqual({
      expr: { op: 'age_from_dob', args: [{ field: 'dob' }] },
    });
    await choose(user, /হিসাবের ধরন/, 'নিট সম্পদ বনাম নিসাব', calc);
    expect(fieldOf(latest, 'age').calculation).toEqual({
      expr: { op: 'compare_gte', args: [{ field: 'net' }, { setting: 'nisab_value' }] },
    });
  }, 20_000);
});

it('has no axe violation', async () => {
  const { container } = open(
    definition(
      section('extra', [
        field('kind', 'radio', {
          label: T('ধরন', 'Kind'),
          options: [option('a', { label: T('ক', 'A') })],
        }),
      ]),
    ),
    { section: 'extra', field: 'kind' },
  );
  await screen.findByRole('region', { name: 'কখন দেখাবে' });
  await expectNoAxeViolations(container);
});
