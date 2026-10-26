import type { Condition } from '@css/shared';
import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { definition, field, option, section, T } from '../../../test/forms';
import { resetClientForTests } from '../../lib/api';
import type { Selection } from './selection';
import { SettingsPane } from './SettingsPane';

// The settings pane of the form builder: the options and their branching, the named text checks,
// the limits, the condition rows and the calculation terms, each written back into the draft in
// the engine's shape. The project's own questions are added from the left pane (builder.test).

let latest: FormDefinition;

function Harness({
  initial,
  select,
  identityMarks = false,
}: {
  initial: FormDefinition;
  select: Selection;
  identityMarks?: boolean;
}) {
  const [def, setDef] = useState(initial);
  return (
    <SettingsPane
      definition={def}
      selected={select}
      mode="full"
      identityMarks={identityMarks}
      onChange={(next) => {
        latest = next;
        setDef(next);
      }}
    />
  );
}

const open = (initial: FormDefinition, select: Selection, identityMarks = false) => {
  latest = initial;
  return renderApp(<Harness initial={initial} select={select} identityMarks={identityMarks} />);
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

/** Opens a rule's dialog from its group and scopes to the editor inside. */
const openRules = async (
  user: ReturnType<typeof userEvent.setup>,
  button: RegExp,
  region: string,
) => {
  await user.click(await screen.findByRole('button', { name: button }));
  return within(await screen.findByRole('region', { name: region }));
};

const fieldOf = (def: FormDefinition, key: string) =>
  def.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === key)!;

beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
});

describe('the field settings', () => {
  it('offers the seven named checks of a text and nothing else', async () => {
    const user = userEvent.setup();
    open(definition(section('extra', [field('phone_two', 'short_text')])), {
      section: 'extra',
      field: 'phone_two',
    });
    // the rules sit in a closed group
    await user.click(await screen.findByRole('button', { name: /^উত্তরের নিয়ম/ }));
    await user.click(await screen.findByRole('button', { name: /লেখা কেমন হবে/ }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([
      'যেকোনো লেখা',
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
    const show = await openRules(user, /^শর্ত (ঠিক করুন|বদলান)$/, 'কখন দেখাবে');
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
    const again = await openRules(user, /^শর্ত (ঠিক করুন|বদলান)$/, 'কখন দেখাবে');
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
    const show = await openRules(user, /^শর্ত (ঠিক করুন|বদলান)$/, 'কখন দেখাবে');
    expect(show.getByText(/একাধিক স্তর আছে/)).toBeInTheDocument();
    expect(show.queryByRole('button', { name: 'শর্ত যোগ করুন' })).not.toBeInTheDocument();
    await user.click(show.getByRole('button', { name: 'শর্তটি মুছুন' }));
    expect(fieldOf(latest, 'loan_note').logic).toBeUndefined();
  });
});

describe('the calculation', () => {
  const income = () =>
    definition(
      section('income', [
        field('a', 'money', { label: T('কৃষি আয়') }),
        field('b', 'money', { label: T('ব্যবসার আয়') }),
        field('c', 'money', { label: T('অন্য আয়') }),
        field('total', 'calculation', { label: T('মোট আয়') }),
      ]),
    );

  it('builds a total of three answers by clicking and saves it', async () => {
    const user = userEvent.setup();
    open(income(), { section: 'income', field: 'total' });
    const calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await choose(user, /হিসাব: ধরন$/, 'হিসাব (+ − × ÷)', calc);
    await user.click(calc.getByRole('button', { name: 'অংশ যোগ করুন' }));
    await user.click(calc.getByRole('button', { name: 'অংশ যোগ করুন' }));
    for (const [n, label] of [
      ['1', 'কৃষি আয়'],
      ['2', 'ব্যবসার আয়'],
      ['3', 'অন্য আয়'],
    ] as const) {
      await choose(user, new RegExp(`হিসাব › অংশ ${n}: ধরন$`), 'একটি প্রশ্নের উত্তর', calc);
      await choose(user, new RegExp(`হিসাব › অংশ ${n}: প্রশ্ন$`), label, calc);
    }
    expect(fieldOf(latest, 'total').calculation).toEqual({
      expr: { op: 'add', args: [{ field: 'a' }, { field: 'b' }, { field: 'c' }] },
    });
    // a bracket is a part of its own inside the sum
    await user.click(calc.getByRole('button', { name: 'বন্ধনী' }));
    expect(fieldOf(latest, 'total').calculation!.expr).toMatchObject({
      args: [{ field: 'a' }, { field: 'b' }, { field: 'c' }, { op: 'add', args: [0] }],
    });
  }, 30_000);

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
    const calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await choose(user, /হিসাব: ধরন$/, 'তালিকার সব সারির যোগফল', calc);
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
    let calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await user.click(calc.getByRole('button', { name: /হিসাব: ধরন$/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'একটি প্রশ্নের উত্তর',
      'একটি সংখ্যা',
      'হিসাব (+ − × ÷)',
      'যদি … তবে',
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
    calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await choose(user, /হিসাব: ধরন$/, 'জন্মতারিখ থেকে বয়স', calc);
    expect(fieldOf(latest, 'age').calculation).toEqual({
      expr: { op: 'age_from_dob', args: [{ field: 'dob' }] },
    });
    await choose(user, /হিসাব: ধরন$/, 'নিট সম্পদ বনাম নিসাব', calc);
    expect(fieldOf(latest, 'age').calculation).toEqual({
      expr: { op: 'compare_gte', args: [{ field: 'net' }, { setting: 'nisab_value' }] },
    });
  }, 20_000);

  it('builds a value by condition, which reads as a sentence', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('gold', [
          field('gold_karat', 'radio', {
            label: T('সোনার ক্যারেট'),
            options: [option('24'), option('22')],
          }),
          field('price', 'calculation', { label: T('প্রতি আনার দাম') }),
        ]),
      ),
      { section: 'gold', field: 'price' },
    );
    const calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await choose(user, /হিসাব: ধরন$/, 'যদি … তবে', calc);
    await user.clear(calc.getByRole('textbox', { name: 'তবে 1: সংখ্যা' }));
    await user.type(calc.getByRole('textbox', { name: 'তবে 1: সংখ্যা' }), '16236');
    expect(fieldOf(latest, 'price').calculation).toEqual({
      expr: {
        if: [{ when: { field: 'gold_karat', op: 'not_empty' }, then: 16236 }],
        else: 0,
      },
    });
    await user.keyboard('{Escape}');
    expect(
      await screen.findByText(
        'প্রতি আনার দাম = যদি “সোনার ক্যারেট” ফাঁকা নয় হয় তবে 16236, নইলে 0',
      ),
    ).toBeInTheDocument();
  }, 20_000);

  it('takes a typed formula, names a mistake and where it is, and rounds the result', async () => {
    const user = userEvent.setup();
    open(income(), { section: 'income', field: 'total' });
    const calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await user.click(calc.getByRole('radio', { name: 'সূত্র লিখুন' }));
    const formula = calc.getByRole('textbox', { name: /^সূত্র/ });
    await user.type(formula, 'a + bb');
    expect(calc.getByText('অজানা প্রশ্ন: bb (ঘর 5)')).toBeInTheDocument();
    await user.clear(formula);
    await user.type(formula, '(a + b) / 3');
    expect(fieldOf(latest, 'total').calculation).toEqual({
      expr: { op: 'div', args: [{ op: 'add', args: [{ field: 'a' }, { field: 'b' }] }, 3] },
    });
    await choose(user, /দশমিকের পর ঘর$/, '2', calc);
    expect(fieldOf(latest, 'total').calculation).toMatchObject({ round: 2 });
  }, 20_000);

  it('removes the calculation when the formula is emptied, and keeps a mistaken one with a note', async () => {
    const user = userEvent.setup();
    open(income(), { section: 'income', field: 'total' });
    const calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await user.click(calc.getByRole('radio', { name: 'সূত্র লিখুন' }));
    const formula = calc.getByRole('textbox', { name: /^সূত্র/ });
    await user.type(formula, 'a + b');
    expect(fieldOf(latest, 'total').calculation).toBeDefined();
    await user.clear(formula);
    expect(fieldOf(latest, 'total').calculation).toBeUndefined();
    await user.type(formula, 'a + b +');
    await user.click(calc.getByRole('radio', { name: 'ক্লিক করে' }));
    expect(calc.getByText(/সূত্রে ভুল আছে, তাই আগের হিসাবই রাখা আছে/)).toBeInTheDocument();
    await user.click(calc.getByRole('radio', { name: 'সূত্র লিখুন' }));
    expect(calc.getByRole('textbox', { name: /^সূত্র/ })).toHaveValue('a + b +');
  }, 20_000);

  it('keeps the text results of a calculation with the question', async () => {
    const user = userEvent.setup();
    open(income(), { section: 'income', field: 'total' });
    const calc = await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
    await user.click(calc.getByRole('button', { name: 'লেখা-ফল যোগ করুন' }));
    const bn = calc.getByRole('textbox', { name: 'ফল 1: বাংলা' });
    await user.clear(bn);
    await user.type(bn, 'কম');
    expect(fieldOf(latest, 'total').settings?.results).toEqual([
      { code: 'r1', label: { bn: 'কম', en: 'নতুন ফল' } },
    ]);
  });
});

describe('defaults, read-only, counted rows, comparisons and earlier answers', () => {
  it('starts a date with today, and makes it read-only only once it has a default', async () => {
    const user = userEvent.setup();
    open(definition(section('x', [field('visit', 'date', { label: T('পরিদর্শনের তারিখ') })])), {
      section: 'x',
      field: 'visit',
    });
    await user.click(await screen.findByRole('button', { name: /^ডিফল্ট মান/ }));
    const readOnly = screen.getByRole('switch', { name: 'শুধু দেখা যাবে, বদলানো যাবে না' });
    expect(readOnly).toBeDisabled();
    await choose(user, /নেই ডিফল্ট মান$/, 'আজকের তারিখ');
    expect(fieldOf(latest, 'visit').settings).toEqual({ default: { today: true } });
    await user.click(screen.getByRole('switch', { name: 'শুধু দেখা যাবে, বদলানো যাবে না' }));
    expect(fieldOf(latest, 'visit').settings).toEqual({
      default: { today: true },
      read_only: true,
    });
  });

  it('starts a text question with a fixed text', async () => {
    const user = userEvent.setup();
    open(definition(section('x', [field('number_prefix', 'short_text')])), {
      section: 'x',
      field: 'number_prefix',
    });
    await user.click(await screen.findByRole('button', { name: /^ডিফল্ট মান/ }));
    await choose(user, /নেই ডিফল্ট মান$/, 'লেখা');
    await user.type(screen.getByRole('textbox', { name: 'ডিফল্ট লেখা' }), 'ASF-');
    expect(fieldOf(latest, 'number_prefix').settings).toEqual({ default: { text: 'ASF-' } });
  });

  it('lets a group’s rows follow only an earlier whole number, which then takes a range', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('family', [
          field('q_label', 'short_text', { label: T('পরিবারের নাম') }),
          field('q_family', 'number', { label: T('পরিবারের সদস্য সংখ্যা') }),
          field('members', 'repeat_group', { label: T('সদস্য') }),
          field('m_name', 'short_text', { settings: { repeat: { group: 'members' } } }),
          field('q_later', 'number', { label: T('পরের সংখ্যা') }),
        ]),
      ),
      { section: 'family', field: 'members' },
    );
    await user.click(await screen.findByRole('button', { name: /সারির সংখ্যা যে প্রশ্ন থেকে$/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'আবেদনকারী নিজে সারি যোগ করবেন',
      'পরিবারের সদস্য সংখ্যা',
    ]);
    await user.click(screen.getByRole('option', { name: 'পরিবারের সদস্য সংখ্যা' }));
    expect(fieldOf(latest, 'members').settings?.repeat).toEqual({ count_from: 'q_family' });
    expect(fieldOf(latest, 'q_family').settings?.validation).toEqual({ min: 0, max: 50 });
  });

  it('keeps a count range within the rows, and narrows it when the rows shrink', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('family', [
          field('q_family', 'number', {
            label: T('পরিবারের সদস্য সংখ্যা'),
            settings: { validation: { min: 2, max: 80 } },
          }),
          field('members', 'repeat_group', {
            label: T('সদস্য'),
            settings: { repeat: { max_rows: 20 } },
          }),
          field('m_name', 'short_text', { settings: { repeat: { group: 'members' } } }),
        ]),
      ),
      { section: 'family', field: 'members' },
    );
    await choose(user, /সারির সংখ্যা যে প্রশ্ন থেকে$/, 'পরিবারের সদস্য সংখ্যা');
    expect(fieldOf(latest, 'q_family').settings?.validation).toEqual({ min: 2, max: 20 });
    const most = screen.getByRole('textbox', { name: /^সবচেয়ে বেশি সারি/ });
    await user.clear(most);
    await user.type(most, '1');
    expect(fieldOf(latest, 'members').settings?.repeat).toMatchObject({
      count_from: 'q_family',
      max_rows: 1,
    });
    // the least above the most starts again at 0
    expect(fieldOf(latest, 'q_family').settings?.validation).toEqual({ min: 0, max: 1 });
  });

  it('offers an earlier answer of the form or of the question’s own rows, never a later one', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('farm', [
          field('q_farm', 'radio', { label: T('খামারের ধরন'), options: [option('cow')] }),
          field('earners', 'repeat_group', { label: T('উপার্জনকারী') }),
          field('e_name', 'short_text', {
            label: T('উপার্জনকারীর নাম'),
            settings: { repeat: { group: 'earners' } },
          }),
          field('q_count', 'number', { label: T('কতটি পালন করতে চান?') }),
          field('q_later', 'short_text', { label: T('পরের প্রশ্ন') }),
        ]),
      ),
      { section: 'farm', field: 'q_count' },
    );
    await user.click(await screen.findByRole('button', { name: /উত্তর বসান$/ }));
    const offered = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(offered).toContain('খামারের ধরন');
    // another group's row answer and a later question are not offered
    expect(offered).not.toContain('উপার্জনকারীর নাম');
    expect(offered).not.toContain('পরের প্রশ্ন');
    expect(offered).not.toContain('কতটি পালন করতে চান?');
  });

  it('starts a default number within the question’s limits', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('x', [
          field('q_rooms', 'number', { settings: { validation: { min: 1, max: 9 } } }),
        ]),
      ),
      { section: 'x', field: 'q_rooms' },
    );
    await user.click(await screen.findByRole('button', { name: /^ডিফল্ট মান/ }));
    await choose(user, /নেই ডিফল্ট মান$/, 'সংখ্যা');
    expect(fieldOf(latest, 'q_rooms').settings?.default).toEqual({ number: 1 });
  });

  it('compares a condition with another answer, read as a sentence', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('money', [
          field('income', 'money', { label: T('মোট আয়') }),
          field('expense', 'money', { label: T('মাসিক ব্যয়') }),
          field('why', 'long_text', { label: T('কারণ') }),
        ]),
      ),
      { section: 'money', field: 'why' },
    );
    const show = await openRules(user, /^শর্ত (ঠিক করুন|বদলান)$/, 'কখন দেখাবে');
    await user.click(show.getByRole('button', { name: 'শর্ত যোগ করুন' }));
    await choose(user, /শর্ত 1: প্রশ্ন/, 'মাসিক ব্যয়', show);
    await choose(user, /শর্ত 1: তুলনা/, 'বেশি', show);
    await user.click(show.getByRole('radio', { name: 'অন্য প্রশ্নের উত্তর' }));
    await choose(user, /শর্ত 1: কোন প্রশ্নের উত্তর/, 'মোট আয়', show);
    expect(fieldOf(latest, 'why').logic).toEqual({
      show_if: { field: 'expense', op: 'gt', value: { field: 'income' } },
    });
    await user.keyboard('{Escape}');
    expect(await screen.findByText(/“মাসিক ব্যয়” “মোট আয়”-এর বেশি/)).toBeInTheDocument();
  }, 20_000);

  it('puts an earlier answer into the question’s text', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('farm', [
          field('q_farm', 'radio', { label: T('খামারের ধরন'), options: [option('cow')] }),
          field('q_count', 'number', { label: T('কতটি পালন করতে চান?') }),
        ]),
      ),
      { section: 'farm', field: 'q_count' },
    );
    await choose(user, /উত্তর বসান$/, 'খামারের ধরন');
    expect(fieldOf(latest, 'q_count').label).toEqual({
      bn: 'কতটি পালন করতে চান? {{q_farm}}',
      en: 'কতটি পালন করতে চান? {{q_farm}}',
    });
  });

  it('keeps one row and one column, and stops adding at 200 boxes', async () => {
    const user = userEvent.setup();
    const line = (prefix: string, n: number) => ({
      key: `${prefix}${n}`,
      label: T(`${prefix}${n}`),
    });
    open(
      definition(
        section('farm', [
          field('livestock', 'number_table', {
            label: T('গবাদি পশু'),
            settings: {
              table: {
                rows: Array.from({ length: 20 }, (_, i) => line('r', i + 1)),
                cols: [line('c', 1)],
              },
            },
          }),
        ]),
      ),
      { section: 'farm', field: 'livestock' },
    );
    // one column: it has no remove button
    expect(await screen.findByRole('textbox', { name: 'কলাম 1: বাংলা' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'কলাম 1 সরান' })).not.toBeInTheDocument();
    for (let i = 0; i < 9; i += 1)
      await user.click(screen.getByRole('button', { name: 'কলাম যোগ করুন' }));
    expect(fieldOf(latest, 'livestock').settings?.table?.cols).toHaveLength(10);
    // 20 × 10 is the most a table holds
    expect(screen.getByRole('button', { name: 'কলাম যোগ করুন' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'সারি যোগ করুন' })).toBeDisabled();
    expect(screen.getAllByText('একটি ছকে সবচেয়ে বেশি 200টি ঘর রাখা যায়।')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'কলাম 10 সরান' }));
    expect(fieldOf(latest, 'livestock').settings?.table?.cols).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'কলাম যোগ করুন' })).toBeEnabled();
  }, 30_000);

  it('edits the rows and columns of a number table', async () => {
    const user = userEvent.setup();
    open(
      definition(
        section('farm', [
          field('livestock', 'number_table', {
            label: T('গবাদি পশু'),
            settings: {
              table: {
                rows: [{ key: 'r1', label: T('সারি 1') }],
                cols: [{ key: 'c1', label: T('কলাম 1') }],
              },
            },
          }),
        ]),
      ),
      { section: 'farm', field: 'livestock' },
    );
    const bn = await screen.findByRole('textbox', { name: 'সারি 1: বাংলা' });
    await user.clear(bn);
    await user.type(bn, 'গরু');
    await user.click(screen.getByRole('button', { name: 'সারি যোগ করুন' }));
    await user.click(screen.getByRole('button', { name: 'কলাম যোগ করুন' }));
    expect(fieldOf(latest, 'livestock').settings?.table).toEqual({
      rows: [
        { key: 'r1', label: { bn: 'গরু', en: 'সারি 1' } },
        { key: 'r2', label: { bn: 'সারি 2', en: 'সারি 2' } },
      ],
      cols: [
        { key: 'c1', label: { bn: 'কলাম 1', en: 'কলাম 1' } },
        { key: 'c2', label: { bn: 'কলাম 2', en: 'কলাম 2' } },
      ],
    });
  });
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
  // the groups with their sentences, and the show-if dialog open over them
  await screen.findByText('সব সময় দেখাবে।');
  await expectNoAxeViolations(container);
  await openRules(userEvent.setup(), /^শর্ত ঠিক করুন$/, 'কখন দেখাবে');
  await expectNoAxeViolations(document.body);
});

it('has no axe violation in the calculation dialog with a step and a bracket', async () => {
  const user = userEvent.setup();
  open(
    definition(
      section('gold', [
        field('gold_karat', 'radio', { label: T('সোনার ক্যারেট'), options: [option('24')] }),
        field('price', 'calculation', {
          label: T('দাম'),
          calculation: {
            expr: {
              op: 'add',
              args: [
                {
                  if: [{ when: { field: 'gold_karat', op: 'eq', value: '24' }, then: 1 }],
                  else: 0,
                },
                { op: 'mul', args: [2, 3] },
              ],
            },
          },
        }),
      ]),
    ),
    { section: 'gold', field: 'price' },
  );
  await openRules(user, /^হিসাব (ঠিক করুন|বদলান)$/, 'হিসাবের নিয়ম');
  await expectNoAxeViolations(document.body);
}, 20_000);

describe('the identity mark', () => {
  const own = () =>
    definition(
      section('mine', [field('q_who', 'long_text', { label: T('কে', 'Who') })]),
      section('office', [field('remark', 'short_text')], { visibility: 'official_only' }),
    );

  it('offers the seven roles and sets the role, its column and its type', async () => {
    const user = userEvent.setup();
    open(own(), { section: 'mine', field: 'q_who' }, true);
    await user.click(await screen.findByRole('button', { name: /পরিচয়-চিহ্ন/ }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([
      'চিহ্ন নেই',
      'এনআইডি বা জন্মনিবন্ধন নম্বর',
      'নাম',
      'পিতা বা স্বামীর নাম',
      'মোবাইল নম্বর',
      'লিঙ্গ',
      'ঠিকানা (বিভাগ থেকে ইউনিয়ন)',
      'গ্রাম',
    ]);
    await user.click(screen.getByRole('option', { name: 'নাম' }));
    expect(fieldOf(latest, 'q_who')).toMatchObject({
      type: 'short_text',
      standardColumn: 'name',
      required: true,
    });
    // the core section's name question held the role before and lost it
    expect(fieldOf(latest, 'name').standardColumn).toBeNull();
  });

  it('keeps a marked question required', async () => {
    open(definition(), { section: 'basic_info', field: 'name' }, true);
    expect(await screen.findByRole('switch', { name: 'উত্তর দেওয়া আবশ্যক' })).toBeDisabled();
  });

  it('is not offered in an official-only section, nor on a form of another kind', async () => {
    const office = open(own(), { section: 'office', field: 'remark' }, true);
    await screen.findByRole('button', { name: 'মূল তথ্য' });
    expect(screen.queryByRole('button', { name: /পরিচয়-চিহ্ন/ })).not.toBeInTheDocument();
    office.unmount();
    // a form of the kind other takes no identity marks at all
    open(own(), { section: 'mine', field: 'q_who' }, false);
    await screen.findByRole('button', { name: 'মূল তথ্য' });
    expect(screen.queryByRole('button', { name: /পরিচয়-চিহ্ন/ })).not.toBeInTheDocument();
  });
});

describe('a stale identity mark', () => {
  it('on a form of another kind still shows, so it can be cleared', async () => {
    const user = userEvent.setup();
    open(definition(), { section: 'basic_info', field: 'name' }, false);
    await user.click(await screen.findByRole('button', { name: /পরিচয়-চিহ্ন/ }));
    await user.click(await screen.findByRole('option', { name: 'চিহ্ন নেই' }));
    expect(fieldOf(latest, 'name').standardColumn).toBeNull();
  });
});

describe('the points of the priority score', () => {
  const kind = field('kind', 'radio', {
    label: T('ধরন', 'Kind'),
    options: [
      option('widow', { label: T('বিধবা', 'Widow') }),
      option('elderly', { label: T('বৃদ্ধ', 'Elderly') }),
    ],
  });

  it('gives each option of a choice its points, and an emptied box takes them away', async () => {
    const user = userEvent.setup();
    const view = open(definition(section('more', [kind])), { section: 'more', field: 'kind' });
    await user.click(await screen.findByRole('button', { name: /নম্বর/ }));
    const widow = await screen.findByRole('textbox', { name: 'বিধবা: নম্বর' });
    await user.type(widow, '20');
    await user.type(screen.getByRole('textbox', { name: 'বৃদ্ধ: নম্বর' }), '15');
    expect(fieldOf(latest, 'kind').settings?.score).toEqual({
      options: { widow: 20, elderly: 15 },
    });
    await user.clear(widow);
    expect(fieldOf(latest, 'kind').settings?.score).toEqual({ options: { elderly: 15 } });
    await user.clear(screen.getByRole('textbox', { name: 'বৃদ্ধ: নম্বর' }));
    expect(fieldOf(latest, 'kind').settings?.score).toBeUndefined();
    await expectNoAxeViolations(view.container);
  });

  it('gives a number its points by ranges, added and removed', async () => {
    const user = userEvent.setup();
    open(
      definition(section('more', [field('members', 'number', { label: T('সদস্য', 'Members') })])),
      {
        section: 'more',
        field: 'members',
      },
    );
    await user.click(await screen.findByRole('button', { name: /নম্বর/ }));
    await user.click(await screen.findByRole('button', { name: 'সীমা যোগ করুন' }));
    const rows = screen.getByRole('list', { name: 'নম্বরের সীমা' });
    await user.type(within(rows).getByRole('textbox', { name: /থেকে/ }), '6');
    await user.type(within(rows).getByRole('textbox', { name: /^নম্বর/ }), '20');
    expect(fieldOf(latest, 'members').settings?.score).toEqual({
      ranges: [{ min: 6, points: 20 }],
    });
    await user.click(within(rows).getByRole('button', { name: 'সীমাটি সরান' }));
    expect(fieldOf(latest, 'members').settings?.score).toBeUndefined();
  });

  it('offers no points on a text question', async () => {
    open(definition(section('more', [field('note', 'short_text', { label: T('নোট', 'Note') })])), {
      section: 'more',
      field: 'note',
    });
    await screen.findByRole('button', { name: /মূল তথ্য/ });
    expect(screen.queryByRole('button', { name: /নম্বর/ })).not.toBeInTheDocument();
  });
});
