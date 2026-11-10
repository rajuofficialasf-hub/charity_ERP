import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test/auth';
import { definition, field, option, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { FormRenderer, type RendererProps, type Submission } from './FormRenderer';

// The form renderer of every screen that fills a form: one section per screen on a phone, live
// conditions and calculations through the shared engine, the address cascade, repeat rows, the
// position, upload fields through the screen's adapter, and the answers kept only in the open tab.
const TODAY = '2026-10-22';
const DIVISION = '01900000-0000-7000-8000-0000000000a1';
const DISTRICT = '01900000-0000-7000-8000-0000000000a2';
const UPAZILA = '01900000-0000-7000-8000-0000000000a3';
const UNION = '01900000-0000-7000-8000-0000000000a4';
const UNION_2 = '01900000-0000-7000-8000-0000000000a5';
const place = (id: string, bn: string, postCode: string | null = null) => ({
  id,
  name: { bn, en: bn },
  postCode,
});

beforeEach(() => {
  sessionStorage.clear();
  server.use(
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const rows: Record<string, ReturnType<typeof place>[]> = {
        root: [place(DIVISION, 'ঢাকা বিভাগ')],
        [DIVISION]: [place(DISTRICT, 'ঢাকা জেলা')],
        [DISTRICT]: [place(UPAZILA, 'সাভার')],
        [UPAZILA]: [place(UNION, 'আশুলিয়া', '1341'), place(UNION_2, 'সাভার', '1340')],
      };
      return HttpResponse.json({ data: rows[parent ?? 'root'] ?? [], meta: { requestId: 'r' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const bilingual = (
  key: string,
  bn: string,
  en: string,
  type: Parameters<typeof field>[1],
  extra = {},
) => field(key, type, { label: T(bn, en), ...extra });

/** A form with one extra section of questions, laid out on one page unless a test says otherwise. */
function open(
  extra: FormDefinition['sections'],
  props: Partial<RendererProps> = {},
  locale: 'bn' | 'en' = 'bn',
) {
  const submitted: Submission[] = [];
  const onSubmit = vi.fn(async (s: Submission) => {
    submitted.push(s);
  });
  const view = renderApp(
    <FormRenderer
      definition={definition(...extra)}
      audience="volunteer"
      today={TODAY}
      layout="page"
      submitLabel={locale === 'bn' ? 'পাঠান' : 'Send'}
      onSubmit={onSubmit}
      {...props}
    />,
    locale,
  );
  return { ...view, submitted, onSubmit };
}

/** An address level's select: its name holds the shown value and then the label. */
const level = (l: string) => new RegExp(`(^|\\s)${l}(\\(|\\s|$)`);

/** Fills the mandatory core on one page. */
async function fillCore(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /^nid_or_birth_reg/ }), '1234567890');
  await user.type(screen.getByRole('textbox', { name: /^mobile/ }), '01712345678');
  await user.type(screen.getByRole('textbox', { name: /^name/ }), 'নমুনা');
  await user.type(screen.getByRole('textbox', { name: /^father_or_husband_name/ }), 'নমুনা পিতা');
  await user.click(screen.getByRole('combobox', { name: /gender/ }));
  await user.click(await screen.findByRole('option', { name: 'female' }));
  for (const [label, name] of [
    ['বিভাগ', 'ঢাকা বিভাগ'],
    ['জেলা', 'ঢাকা জেলা'],
    ['উপজেলা', 'সাভার'],
    ['ইউনিয়ন', 'আশুলিয়া'],
  ] as const) {
    const box = screen.getByRole('combobox', { name: level(label) });
    await waitFor(() => expect(box).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(box);
    await user.click(await screen.findByRole('option', { name }));
  }
  await user.type(screen.getByRole('textbox', { name: /^village/ }), 'নমুনা গ্রাম');
}

describe('the fields', () => {
  it('draws each kind of question with its label and sends answers in the engine shape', async () => {
    const user = userEvent.setup();
    const { submitted } = open([
      section('questions', [
        bilingual(
          'note_text',
          'নিচের প্রশ্নগুলো পরিবারের প্রধানকে জিজ্ঞেস করুন',
          'Ask the head of the family',
          'note',
        ),
        bilingual('members', 'সদস্য সংখ্যা', 'Members', 'number'),
        bilingual('income', 'মাসিক আয়', 'Monthly income', 'money'),
        bilingual('owns_house', 'নিজের ঘর আছে?', 'Own house?', 'radio', {
          options: [
            option('yes', { label: T('হ্যাঁ', 'Yes') }),
            option('no', { label: T('না', 'No') }),
          ],
        }),
        bilingual('needs', 'প্রয়োজন', 'Needs', 'checkbox', {
          options: [
            option('food', { label: T('খাবার', 'Food') }),
            option('cloth', { label: T('কাপড়', 'Clothes') }),
          ],
        }),
        bilingual('remark', 'মন্তব্য', 'Remark', 'long_text'),
      ]),
    ]);
    expect(screen.getByText('নিচের প্রশ্নগুলো পরিবারের প্রধানকে জিজ্ঞেস করুন')).toBeInTheDocument();
    await fillCore(user);
    await user.type(screen.getByRole('textbox', { name: /^সদস্য সংখ্যা/ }), '5');
    await user.type(screen.getByRole('textbox', { name: /^মাসিক আয়/ }), '3500');
    await user.click(screen.getByRole('radio', { name: 'হ্যাঁ' }));
    await user.click(screen.getByRole('checkbox', { name: 'কাপড়' }));
    await user.type(screen.getByRole('textbox', { name: /^মন্তব্য/ }), 'ভালো');
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    const byKey = Object.fromEntries(submitted[0]!.answers.map((a) => [a.fieldKey, a.value]));
    expect(byKey).toMatchObject({
      members: { t: 'number', v: 5 },
      income: { t: 'money', v: '3500' },
      owns_house: { t: 'radio', v: 'yes' },
      needs: { t: 'checkbox', v: ['cloth'] },
      remark: { t: 'long_text', v: 'ভালো' },
      gender: { t: 'single_select', v: 'female' },
      address: {
        t: 'bd_address',
        division_id: DIVISION,
        district_id: DISTRICT,
        upazila_id: UPAZILA,
        union_id: UNION,
      },
    });
    expect(byKey).not.toHaveProperty('note_text');
    expect(submitted[0]!.clientUuid).toMatch(/^[0-9a-f-]{36}$/);
  }, 20_000);

  it('shows the labels in English on an English device', () => {
    open(
      [section('questions', [bilingual('members', 'সদস্য সংখ্যা', 'Members', 'number')])],
      {},
      'en',
    );
    expect(screen.getByRole('textbox', { name: /^Members/ })).toBeInTheDocument();
  });
});

describe('the logic', () => {
  const loans = () =>
    section('loans', [
      bilingual('has_loan', 'ঋণ আছে?', 'Has a loan?', 'radio', {
        options: [
          option('yes', { label: T('হ্যাঁ', 'Yes') }),
          option('no', { label: T('না', 'No') }),
        ],
      }),
      bilingual('loan_total', 'ঋণের পরিমাণ', 'Loan amount', 'money', {
        logic: { show_if: { field: 'has_loan', op: 'eq', value: 'yes' } },
      }),
      bilingual('loan_purpose', 'ঋণের কারণ', 'Loan purpose', 'short_text', {
        logic: { required_if: { field: 'has_loan', op: 'eq', value: 'yes' } },
      }),
    ]);

  it('hides a question until its condition holds, and a hidden answer is not sent', async () => {
    const user = userEvent.setup();
    const { submitted } = open([loans()]);
    expect(screen.queryByRole('textbox', { name: /^ঋণের পরিমাণ/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'হ্যাঁ' }));
    await user.type(await screen.findByRole('textbox', { name: /^ঋণের পরিমাণ/ }), '5000');
    await user.click(screen.getByRole('radio', { name: 'না' }));
    expect(screen.queryByRole('textbox', { name: /^ঋণের পরিমাণ/ })).not.toBeInTheDocument();
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.answers.map((a) => a.fieldKey)).not.toContain('loan_total');
  }, 20_000);

  it('marks a question required only while its required-if holds', async () => {
    const user = userEvent.setup();
    open([loans()]);
    const purpose = () => screen.getByRole('textbox', { name: /^ঋণের কারণ/ });
    expect(purpose()).not.toBeRequired();
    await user.click(screen.getByRole('radio', { name: 'হ্যাঁ' }));
    expect(purpose()).toBeRequired();
  });

  it('works out a total as the numbers are typed', async () => {
    const user = userEvent.setup();
    open([
      section('family', [
        bilingual('adults', 'প্রাপ্তবয়স্ক', 'Adults', 'number'),
        bilingual('children', 'শিশু', 'Children', 'number'),
        bilingual('total', 'মোট সদস্য', 'Total members', 'calculation', {
          calculation: { expr: { op: 'add', args: [{ field: 'adults' }, { field: 'children' }] } },
        }),
      ]),
    ]);
    const total = () => screen.getByRole('textbox', { name: /^মোট সদস্য/ });
    await user.type(screen.getByRole('textbox', { name: /^প্রাপ্তবয়স্ক/ }), '3');
    await waitFor(() => expect(total()).toHaveValue('3'));
    await user.type(screen.getByRole('textbox', { name: /^শিশু/ }), '2');
    await waitFor(() => expect(total()).toHaveValue('5'));
    expect(total()).toHaveAttribute('readonly');
  });

  it('shows amounts in taka and a number with the decimals its calculation rounds to', async () => {
    const user = userEvent.setup();
    open([
      section('money', [
        bilingual('cash', 'নগদ', 'Cash', 'money'),
        bilingual('bank', 'ব্যাংকে', 'In the bank', 'money'),
        bilingual('assets', 'মোট সম্পদ', 'Total assets', 'calculation', {
          calculation: { expr: { op: 'add', args: [{ field: 'cash' }, { field: 'bank' }] } },
        }),
        bilingual('people', 'সদস্য', 'Members', 'number'),
        bilingual('share', 'জনপ্রতি', 'Per person', 'calculation', {
          calculation: { expr: { op: 'div', args: [{ field: 'cash' }, { field: 'people' }] } },
        }),
        bilingual('pairs', 'জোড়া', 'Pairs', 'calculation', {
          calculation: { expr: { op: 'div', args: [{ field: 'people' }, 2] } },
        }),
        bilingual('thirds', 'তিন ভাগের এক', 'A third', 'calculation', {
          calculation: { expr: { op: 'div', args: [{ field: 'people' }, 3] } },
        }),
        bilingual('fine', 'সূক্ষ্ম ভাগ', 'Fine share', 'calculation', {
          calculation: { expr: { op: 'div', args: [{ field: 'people' }, 3] }, round: 4 },
        }),
      ]),
    ]);
    await user.type(screen.getByRole('textbox', { name: /^নগদ/ }), '15000');
    await user.type(screen.getByRole('textbox', { name: /^ব্যাংকে/ }), '250.50');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^মোট সম্পদ/ })).toHaveValue('৳ 15,250.50'),
    );
    await user.type(screen.getByRole('textbox', { name: /^সদস্য/ }), '4');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^জনপ্রতি/ })).toHaveValue('৳ 3,750'),
    );
    await user.clear(screen.getByRole('textbox', { name: /^সদস্য/ }));
    await user.type(screen.getByRole('textbox', { name: /^সদস্য/ }), '8');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^জনপ্রতি/ })).toHaveValue('৳ 1,875'),
    );
    await user.clear(screen.getByRole('textbox', { name: /^সদস্য/ }));
    await user.type(screen.getByRole('textbox', { name: /^সদস্য/ }), '7');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^জনপ্রতি/ })).toHaveValue('৳ 2,142.86'),
    );
    expect(screen.getByRole('textbox', { name: /^জোড়া/ })).toHaveValue('3.5');
    expect(screen.getByRole('textbox', { name: /^তিন ভাগের এক/ })).toHaveValue('2.33');
    expect(screen.getByRole('textbox', { name: /^সূক্ষ্ম ভাগ/ })).toHaveValue('2.3333');
  });

  it('offers the options that follow the earlier answer, and "other" opens its text box', async () => {
    const user = userEvent.setup();
    open([
      section('work', [
        bilingual('occupation', 'পেশা', 'Occupation', 'radio', {
          options: [
            option('farmer', { label: T('কৃষক', 'Farmer') }),
            option('business', { label: T('ব্যবসা', 'Business') }),
          ],
        }),
        bilingual('detail', 'বিস্তারিত', 'Detail', 'radio', {
          logic: { options_depend_on: 'occupation' },
          options: [
            option('rice', { label: T('ধান', 'Rice'), dependsOnOptionCode: 'farmer' }),
            option('shop', { label: T('দোকান', 'Shop'), dependsOnOptionCode: 'business' }),
            option('other', { label: T('অন্যান্য', 'Other'), allowsOtherText: true }),
          ],
        }),
      ]),
    ]);
    await user.click(screen.getByRole('radio', { name: 'কৃষক' }));
    const detail = screen.getByRole('radiogroup', { name: /^বিস্তারিত/ });
    expect(within(detail).getByRole('radio', { name: 'ধান' })).toBeInTheDocument();
    expect(within(detail).queryByRole('radio', { name: 'দোকান' })).not.toBeInTheDocument();
    await user.click(within(detail).getByRole('radio', { name: 'অন্যান্য' }));
    expect(screen.getByRole('textbox', { name: /অন্যান্য/ })).toBeInTheDocument();
  });

  it('fills the post code question from the union, and leaves a code the person typed', async () => {
    const user = userEvent.setup();
    const { submitted } = open([
      section('s_post', [
        bilingual('q_post', 'পোস্ট কোড', 'Post code', 'short_text', {
          standardColumn: 'post_code',
        }),
      ]),
    ]);
    await fillCore(user);
    const post = screen.getByRole('textbox', { name: /পোস্ট কোড/ });
    expect(post).toHaveValue('1341');
    // another union replaces the code it gave
    const unionBox = screen.getByRole('combobox', { name: level('ইউনিয়ন') });
    await user.click(unionBox);
    await user.click(await screen.findByRole('option', { name: 'সাভার' }));
    expect(post).toHaveValue('1340');
    // a code the person typed stays
    await user.clear(post);
    await user.type(post, '1207');
    await user.click(unionBox);
    await user.click(await screen.findByRole('option', { name: 'আশুলিয়া' }));
    expect(post).toHaveValue('1207');
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.answers).toContainEqual({
      fieldKey: 'q_post',
      repeatIndex: 0,
      value: { t: 'short_text', v: '1207' },
    });
  }, 30_000);

  it('waits for each level of the address before the next', async () => {
    open([]);
    expect(screen.getByRole('combobox', { name: level('জেলা') })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('combobox', { name: level('ইউনিয়ন') })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('repeat rows', () => {
  const earners = () =>
    section('earners_part', [
      bilingual('earners', 'আয়কারী', 'Earners', 'repeat_group', {
        settings: { repeat: { min_rows: 1, max_rows: 2 } },
      }),
      bilingual('earner_name', 'আয়কারীর নাম', "Earner's name", 'short_text', {
        settings: { repeat: { group: 'earners' } },
      }),
    ]);

  it('adds rows up to the maximum and keeps the minimum', async () => {
    const user = userEvent.setup();
    open([earners()]);
    expect(screen.getAllByRole('textbox', { name: /^আয়কারীর নাম/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'আয়কারী 1 মুছুন' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'আরেকটি যোগ করুন' }));
    expect(screen.getAllByRole('textbox', { name: /^আয়কারীর নাম/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'আরেকটি যোগ করুন' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'আয়কারী 2 মুছুন' }));
    expect(screen.getAllByRole('textbox', { name: /^আয়কারীর নাম/ })).toHaveLength(1);
  });

  it('sends each row with its row number', async () => {
    const user = userEvent.setup();
    const { submitted } = open([earners()]);
    await user.click(screen.getByRole('button', { name: 'আরেকটি যোগ করুন' }));
    const names = screen.getAllByRole('textbox', { name: /^আয়কারীর নাম/ });
    await user.type(names[0]!, 'করিম');
    await user.type(names[1]!, 'রহিম');
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.answers.filter((a) => a.fieldKey === 'earner_name')).toEqual([
      { fieldKey: 'earner_name', repeatIndex: 0, value: { t: 'short_text', v: 'করিম' } },
      { fieldKey: 'earner_name', repeatIndex: 1, value: { t: 'short_text', v: 'রহিম' } },
    ]);
  }, 20_000);
});

describe('the checks', () => {
  it('shows the engine message under the question in the device language and sends nothing', async () => {
    const user = userEvent.setup();
    const { onSubmit } = open([], {}, 'en');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Fix \d+ problems before sending/)).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: /^name/ });
    expect(name).toHaveAccessibleDescription(/./);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never draws an official-only section for a volunteer or the public, and does for an official', () => {
    const official = section(
      'office',
      [bilingual('remark', 'অফিসের মন্তব্য', 'Office remark', 'short_text')],
      {
        visibility: 'official_only',
      },
    );
    for (const audience of ['volunteer', 'public'] as const) {
      const view = open([official], { audience });
      expect(screen.queryByRole('textbox', { name: /^অফিসের মন্তব্য/ })).not.toBeInTheDocument();
      view.unmount();
    }
    open([official], { audience: 'official' });
    expect(screen.getByRole('textbox', { name: /^অফিসের মন্তব্য/ })).toBeInTheDocument();
  });
});

describe('one part per screen on a phone', () => {
  it('steps through the sections and checks each before the next', async () => {
    const user = userEvent.setup();
    open([], { layout: 'steps' });
    // the two parts and the check before the send
    expect(screen.getByText('অংশ 1 / 3')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'ফর্মের অংশ' }))
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual(['basic_info', 'address', 'যাচাই']);
    expect(screen.queryByRole('button', { name: level('বিভাগ') })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    expect(
      await screen.findByText(/পরের অংশে যাওয়ার আগে \d+টি সমস্যা ঠিক করুন/),
    ).toBeInTheDocument();
    expect(screen.getByText('অংশ 1 / 3')).toBeInTheDocument();
  });
});

describe('a phone', () => {
  it('takes short choices as buttons, reads the answers through before the send, and goes back to a part to change it', async () => {
    const user = userEvent.setup();
    const { submitted } = open(
      [
        section('needs', [
          field('kinds', 'multi_select', {
            label: T('ধরন'),
            options: [option('old', { label: T('বৃদ্ধ') }), option('widow', { label: T('বিধবা') })],
          }),
        ]),
      ],
      { layout: 'steps' },
    );
    await user.type(screen.getByRole('textbox', { name: /^nid_or_birth_reg/ }), '1234567890');
    await user.type(screen.getByRole('textbox', { name: /^mobile/ }), '01712345678');
    await user.type(screen.getByRole('textbox', { name: /^name/ }), 'নমুনা');
    await user.type(screen.getByRole('textbox', { name: /^father_or_husband_name/ }), 'নমুনা পিতা');
    // one tap chooses, a second tap on the chosen one clears it
    const female = screen.getByRole('radio', { name: 'female' });
    await user.click(female);
    expect(female).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'male' }));
    expect(female).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    for (const [label, name] of [
      ['বিভাগ', 'ঢাকা বিভাগ'],
      ['জেলা', 'ঢাকা জেলা'],
      ['উপজেলা', 'সাভার'],
      ['ইউনিয়ন', 'আশুলিয়া'],
    ] as const) {
      const box = await screen.findByRole('combobox', { name: level(label) });
      await waitFor(() => expect(box).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(box);
      await user.click(await screen.findByRole('option', { name }));
    }
    await user.type(screen.getByRole('textbox', { name: /^village/ }), 'নমুনা গ্রাম');
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    // a multiple choice: each chip a toggle
    const widow = await screen.findByRole('button', { name: 'বিধবা' });
    await user.click(widow);
    expect(widow).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    expect(await screen.findByText('পাঠানোর আগে দেখে নিন')).toBeInTheDocument();
    expect(screen.getByText('অংশ 4 / 4')).toBeInTheDocument();
    expect(screen.getByText('male')).toBeInTheDocument();
    expect(screen.getByText('বিধবা')).toBeInTheDocument();
    expect(submitted).toEqual([]);
    // back to a part to change it, then on through the parts to the send
    await user.click(screen.getByRole('button', { name: 'needs বদলান' }));
    await user.click(await screen.findByRole('button', { name: 'বৃদ্ধ' }));
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    await user.click(await screen.findByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.answers.find((x) => x.fieldKey === 'kinds')?.value).toEqual({
      t: 'multi_select',
      v: ['widow', 'old'],
    });
  }, 30_000);
});

describe('the answers', () => {
  it('stay in memory: nothing personal is written to the browser’s storage', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('apply:earlier:copy', JSON.stringify({ answers: [] }));
    const { submitted } = open([]);
    await user.type(screen.getByRole('textbox', { name: /^name/ }), 'নমুনা');
    // the earlier version's plain copy is gone, and no storage holds what was typed
    expect(sessionStorage.getItem('apply:earlier:copy')).toBeNull();
    const stored = [sessionStorage, localStorage].flatMap((s) =>
      Object.keys(s).map((k) => `${k}=${s.getItem(k) ?? ''}`),
    );
    expect(stored.join(' ')).not.toContain('নমুনা');
    await user.clear(screen.getByRole('textbox', { name: /^name/ }));
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
  }, 20_000);
});

describe('the position, uploads and notes', () => {
  const where = () =>
    section('place', [bilingual('home_gps', 'বাড়ির অবস্থান', 'Home location', 'gps')]);

  it('shows the position and its accuracy after a tap', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 23.8103, longitude: 90.4125, accuracy: 12 },
          } as GeolocationPosition),
      },
    });
    open([where()]);
    await user.click(screen.getByRole('button', { name: 'আমার অবস্থান নিন' }));
    expect(await screen.findByText(/23\.8103.*90\.4125.*12/)).toBeInTheDocument();
  });

  it('says what to do when the location permission is refused', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    });
    open([where()]);
    await user.click(screen.getByRole('button', { name: 'আমার অবস্থান নিন' }));
    expect(await screen.findByText(/অনুমতি দেওয়া হয়নি/)).toBeInTheDocument();
  });

  it('shows a photo or signature question without an adapter as taking nothing', () => {
    open([
      section('files', [
        bilingual('house_photo', 'ঘরের ছবি', 'House photo', 'photo'),
        bilingual('signature', 'স্বাক্ষর', 'Signature', 'signature'),
      ]),
    ]);
    expect(screen.getAllByText('এখানে ফাইল নেওয়া হয় না।')).toHaveLength(2);
  });

  it('uploads a photo through the adapter and sends its file id', async () => {
    const user = userEvent.setup();
    const upload = vi.fn(async () => ({ fileId: '01900000-0000-7000-8000-0000000000f1' }));
    const { submitted } = open(
      [section('files', [bilingual('house_photo', 'ঘরের ছবি', 'House photo', 'photo')])],
      {
        upload: { upload, accept: ['image/jpeg'], maxSize: 5 * 1024 * 1024 },
      },
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['jpeg'], 'house.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.answers.find((a) => a.fieldKey === 'house_photo')).toEqual({
      fieldKey: 'house_photo',
      repeatIndex: 0,
      value: { t: 'photo', v: ['01900000-0000-7000-8000-0000000000f1'] },
    });
  }, 20_000);
});

describe('what goes wrong', () => {
  it('keeps the answers and the client id when the send fails, and shows the message', async () => {
    const user = userEvent.setup();
    const sent: Submission[] = [];
    let fail = true;
    const onSubmit = vi.fn(async (s: Submission) => {
      sent.push(s);
      if (fail) throw new Error('এখন পাঠানো যাচ্ছে না।');
    });
    open([], { onSubmit });
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    expect(await screen.findByText('এখন পাঠানো যাচ্ছে না।')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^name/ })).toHaveValue('নমুনা');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.clientUuid).toBe(sent[0]!.clientUuid);
  }, 20_000);

  it('shows the address empty again once the form was sent', async () => {
    const user = userEvent.setup();
    open([]);
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^name/ })).toHaveValue(''));
    expect(screen.getByRole('combobox', { name: level('জেলা') })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  }, 20_000);

  it('waits for a photo still going up before it sends, and names a refused photo', async () => {
    const user = userEvent.setup();
    let finish: (v: { fileId: string }) => void = () => undefined;
    const upload = vi
      .fn()
      .mockImplementationOnce(() => new Promise<{ fileId: string }>((ok) => (finish = ok)))
      .mockImplementationOnce(() => Promise.reject(new Error('refused')));
    const { onSubmit } = open(
      [section('files', [bilingual('house_photo', 'ঘরের ছবি', 'House photo', 'photo')])],
      {
        upload: {
          upload,
          accept: ['image/jpeg'],
          maxSize: 5 * 1024 * 1024,
          maxFiles: 5,
          reasonOf: () => 'ছবিটি নেওয়া হয়নি।',
        },
      },
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['jpeg'], 'one.jpg', { type: 'image/jpeg' }));
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    expect(await screen.findByText('ছবি ওঠা শেষ হওয়া পর্যন্ত অপেক্ষা করুন।')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    finish({ fileId: '01900000-0000-7000-8000-0000000000f2' });
    await user.upload(input, new File(['jpeg'], 'two.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('ছবিটি নেওয়া হয়নি।')).toBeInTheDocument();
  }, 20_000);

  it('says the location cannot be found when the device gives none', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    });
    open([section('place', [bilingual('home_gps', 'বাড়ির অবস্থান', 'Home location', 'gps')])]);
    await user.click(screen.getByRole('button', { name: 'আমার অবস্থান নিন' }));
    expect(await screen.findByText(/এখন অবস্থান পাওয়া যাচ্ছে না/)).toBeInTheDocument();
  });

  it('shows the server message under its question until the person changes the answer', async () => {
    const user = userEvent.setup();
    open([], { serverErrors: { mobile: 'এই নম্বরটি দেওয়া যাবে না।' } });
    expect(screen.getByText('এই নম্বরটি দেওয়া যাবে না।')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^mobile/ }), '0');
    expect(screen.queryByText('এই নম্বরটি দেওয়া যাবে না।')).not.toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has no axe violation in Bengali and English, on one page and by part', async () => {
    for (const [locale, layout] of [
      ['bn', 'page'],
      ['en', 'steps'],
    ] as const) {
      const { container, unmount } = open(
        [section('family', [bilingual('members', 'সদস্য সংখ্যা', 'Members', 'number')])],
        { layout },
        locale,
      );
      await expectNoAxeViolations(container);
      unmount();
    }
  });
});

describe('the form logic on the page', () => {
  const table = {
    table: {
      rows: [
        { key: 'cow', label: T('গরু', 'Cow') },
        { key: 'goat', label: T('ছাগল', 'Goat') },
      ],
      cols: [
        { key: 'own', label: T('নিজের', 'Own') },
        { key: 'shared', label: T('বর্গা', 'Sharecropped') },
      ],
    },
  };
  const logic = () =>
    section('logic_part', [
      bilingual('q_visit', 'পরিদর্শনের তারিখ', 'Visit date', 'date', {
        settings: { default: { today: true } },
      }),
      bilingual('q_prefix', 'নম্বর', 'Number', 'short_text', {
        settings: { default: { text: 'ASF-CBSRP-' }, read_only: true },
      }),
      bilingual('q_farm', 'খামারের ধরন', 'Kind of farm', 'radio', {
        options: [
          option('cow', { label: T('গরু', 'Cow') }),
          option('goat', { label: T('ছাগল', 'Goat') }),
        ],
      }),
      field('q_animals', 'number', {
        label: T('কতটি {{q_farm|পশু}} পালন করতে চান?', 'How many {{q_farm|animals}}?'),
      }),
      bilingual('q_income', 'মাসিক আয়', 'Monthly income', 'money'),
      bilingual('q_expense', 'মাসিক ব্যয়', 'Monthly spending', 'money'),
      bilingual(
        'q_why',
        'আয়ের চেয়ে ব্যয় বেশি হওয়ার কারণ',
        'Why spending is above income',
        'long_text',
        {
          logic: { show_if: { field: 'q_expense', op: 'gt', value: { field: 'q_income' } } },
        },
      ),
      bilingual('q_band', 'আয়ের ধরন', 'Income band', 'calculation', {
        calculation: {
          expr: {
            if: [{ when: { field: 'q_income', op: 'lt', value: 5000 }, then: { result: 'low' } }],
            else: { result: 'high' },
          },
        },
        settings: {
          results: [
            { code: 'low', label: T('কম', 'Low') },
            { code: 'high', label: T('বেশি', 'High') },
          ],
        },
      }),
      bilingual('q_livestock', 'গবাদি পশু', 'Livestock', 'number_table', { settings: table }),
      bilingual('q_cows', 'মোট গরু', 'Cows in all', 'calculation', {
        calculation: {
          expr: {
            op: 'add',
            args: [
              { cell: { field: 'q_livestock', row: 'cow', col: 'own' } },
              { cell: { field: 'q_livestock', row: 'cow', col: 'shared' } },
            ],
          },
        },
      }),
    ]);

  it('leaves the defaults out of a stored form, where an empty answer stays empty', () => {
    open([logic()], { fillDefaults: false, initialAnswers: [] });
    expect(screen.getByRole('textbox', { name: /^নম্বর/ })).toHaveValue('');
  });

  it('fills a date with today and sends it, and shows a read-only number that cannot be typed into', async () => {
    const user = userEvent.setup();
    const { submitted } = open([logic()]);
    const prefix = screen.getByRole('textbox', { name: /^নম্বর/ });
    expect(prefix).toHaveValue('ASF-CBSRP-');
    expect(prefix).toHaveAttribute('readonly');
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.answers).toContainEqual(
      expect.objectContaining({ fieldKey: 'q_visit', value: { t: 'date', v: TODAY } }),
    );
  }, 20_000);

  it('repeats an earlier answer in a question’s text, in the reader’s language', async () => {
    const user = userEvent.setup();
    open([logic()]);
    expect(screen.getByRole('textbox', { name: /^কতটি পশু পালন করতে চান\?/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'গরু' }));
    expect(screen.getByRole('textbox', { name: /^কতটি গরু পালন করতে চান\?/ })).toBeInTheDocument();
  });

  it('shows a calculated text by its label, and a question when spending is above income', async () => {
    const user = userEvent.setup();
    open([logic()]);
    await user.type(screen.getByRole('textbox', { name: /^মাসিক আয়/ }), '3000');
    expect(screen.getByRole('textbox', { name: /^আয়ের ধরন/ })).toHaveValue('কম');
    expect(
      screen.queryByRole('textbox', { name: /^আয়ের চেয়ে ব্যয় বেশি/ }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^মাসিক ব্যয়/ }), '4000');
    expect(screen.getByRole('textbox', { name: /^আয়ের চেয়ে ব্যয় বেশি/ })).toBeInTheDocument();
  });

  it('takes whole numbers in a table and shows the total a calculation reads from it', async () => {
    const user = userEvent.setup();
    open([logic()]);
    const table = screen.getByRole('group', { name: 'গবাদি পশু' });
    await user.type(within(table).getByRole('textbox', { name: 'গরু: নিজের' }), '2');
    await user.type(within(table).getByRole('textbox', { name: 'গরু: বর্গা' }), '1');
    expect(screen.getByRole('textbox', { name: /^মোট গরু/ })).toHaveValue('3');
  });

  it('has no accessibility violations in Bangla and English', async () => {
    const bn = open([logic()]);
    await expectNoAxeViolations(bn.container);
    bn.unmount();
    const en = open([logic()], {}, 'en');
    await expectNoAxeViolations(en.container);
  });
});

describe('rows that follow a count', () => {
  const counted = () =>
    section('family_part', [
      bilingual('q_family', 'পরিবারের সদস্য সংখ্যা', 'Family members', 'number', {
        settings: { validation: { min: 0, max: 10 } },
      }),
      bilingual('members', 'সদস্য', 'Member', 'repeat_group', {
        settings: { repeat: { count_from: 'q_family' } },
      }),
      bilingual('member_name', 'সদস্যের নাম', "Member's name", 'short_text', {
        settings: { repeat: { group: 'members' } },
      }),
    ]);
  const names = () => screen.queryAllByRole('textbox', { name: /^সদস্যের নাম/ });

  it('draws as many rows as the count, with no add or remove button', async () => {
    const user = userEvent.setup();
    open([counted()]);
    expect(names()).toHaveLength(0);
    await user.type(screen.getByRole('textbox', { name: /^পরিবারের সদস্য সংখ্যা/ }), '3');
    expect(names()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'আরেকটি যোগ করুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /মুছুন$/ })).not.toBeInTheDocument();
  });

  it('shows the count again when a number typed straight over it is cancelled', async () => {
    const user = userEvent.setup();
    open([counted()]);
    const count = screen.getByRole('textbox', { name: /^পরিবারের সদস্য সংখ্যা/ });
    await user.type(count, '3');
    await user.type(names()[2]!, 'রহিমা');
    await user.tripleClick(count);
    await user.keyboard('2');
    await user.click(
      within(
        await screen.findByRole('alertdialog', {
          name: 'বাড়তি সারির উত্তর মুছে যাবে। তবু কমাবেন?',
        }),
      ).getByRole('button', { name: 'বাতিল' }),
    );
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.getByRole('textbox', { name: /^পরিবারের সদস্য সংখ্যা/ })).toHaveValue('3');
  });

  it('trims every group that follows the same count', async () => {
    const user = userEvent.setup();
    open([
      section('two_lists', [
        bilingual('q_family', 'পরিবারের সদস্য সংখ্যা', 'Family members', 'number', {
          settings: { validation: { min: 0, max: 10 } },
        }),
        bilingual('members', 'সদস্য', 'Member', 'repeat_group', {
          settings: { repeat: { count_from: 'q_family' } },
        }),
        bilingual('member_name', 'সদস্যের নাম', "Member's name", 'short_text', {
          settings: { repeat: { group: 'members' } },
        }),
        bilingual('health', 'স্বাস্থ্য', 'Health', 'repeat_group', {
          settings: { repeat: { count_from: 'q_family' } },
        }),
        bilingual('health_note', 'স্বাস্থ্যের কথা', 'Health note', 'short_text', {
          settings: { repeat: { group: 'health' } },
        }),
      ]),
    ]);
    const count = screen.getByRole('textbox', { name: /^পরিবারের সদস্য সংখ্যা/ });
    await user.type(count, '3');
    const notes = () => screen.queryAllByRole('textbox', { name: /^স্বাস্থ্যের কথা/ });
    // only the second list holds an answer in its last row, and it still asks
    await user.type(notes()[2]!, 'ভালো');
    await user.type(count, '{backspace}2');
    await user.click(
      within(
        await screen.findByRole('alertdialog', {
          name: 'বাড়তি সারির উত্তর মুছে যাবে। তবু কমাবেন?',
        }),
      ).getByRole('button', { name: 'কমান' }),
    );
    await waitFor(() => expect(notes()).toHaveLength(2));
    expect(names()).toHaveLength(2);
  });

  it('asks before a lower count drops answered rows, and keeps them on বাতিল', async () => {
    const user = userEvent.setup();
    open([counted()]);
    const count = screen.getByRole('textbox', { name: /^পরিবারের সদস্য সংখ্যা/ });
    await user.type(count, '3');
    await user.type(names()[2]!, 'রহিমা');
    await user.type(count, '{backspace}2');
    const ask = await screen.findByRole('alertdialog', {
      name: 'বাড়তি সারির উত্তর মুছে যাবে। তবু কমাবেন?',
    });
    await user.click(within(ask).getByRole('button', { name: 'বাতিল' }));
    // the page is read again once the dialog has closed
    await waitFor(() => expect(names()).toHaveLength(3));
    // the count's box is drawn afresh with the count it holds again
    const again = screen.getByRole('textbox', { name: /^পরিবারের সদস্য সংখ্যা/ });
    expect(again).toHaveValue('3');
    await user.type(again, '{backspace}2');
    await user.click(
      within(
        await screen.findByRole('alertdialog', {
          name: 'বাড়তি সারির উত্তর মুছে যাবে। তবু কমাবেন?',
        }),
      ).getByRole('button', { name: 'কমান' }),
    );
    await waitFor(() => expect(names()).toHaveLength(2));
    expect(again).toHaveValue('2');
  });
});
