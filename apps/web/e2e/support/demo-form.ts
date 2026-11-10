import { expect, request as apiRequest, type Page } from '@playwright/test';
import { apiAs } from './admin';
import { choice, code, question } from './projects';

/**
 * The body of the self-reliance demo form, the part a journey does not build on the screen: the
 * identity questions, the application's date and number prefix, the family with its rows, income
 * and spending with the reason asked only when spending is above income, the gold and cash, and
 * the farm whose count question names the animal chosen before it. The gold price, the total
 * assets, the livestock table and the family rows' count are left for the builder's screen.
 */
const named = (
  fieldKey: string,
  type: string,
  bn: string,
  en: string,
  extra: Record<string, unknown> = {},
) => question(fieldKey, type, { label: { bn, en }, ...extra });
const titled = (key: string, bn: string, en: string, fields: ReturnType<typeof question>[]) => ({
  key,
  librarySectionKey: null,
  title: { bn, en },
  visibility: 'volunteer',
  condition: null,
  fields,
});

export const DEMO_SECTIONS = [
  titled('identity', 'পরিচয়', 'Identity', [
    named('q_id', 'short_text', 'জাতীয় পরিচয়পত্র নম্বর', 'NID number', {
      standardColumn: 'nid_or_birth_reg',
    }),
    named('q_name', 'short_text', 'উপকারভোগীর নাম', "Beneficiary's name", {
      standardColumn: 'name',
    }),
    named('q_father', 'short_text', 'পিতা/স্বামীর নাম', "Father's or husband's name", {
      standardColumn: 'father_or_husband_name',
    }),
    named('q_mobile', 'phone', 'মোবাইল নম্বর', 'Mobile number', { standardColumn: 'mobile' }),
    named('q_gender', 'single_select', 'লিঙ্গ', 'Gender', {
      standardColumn: 'gender_code',
      options: [
        choice('male', { bn: 'পুরুষ', en: 'Male' }),
        choice('female', { bn: 'নারী', en: 'Female' }),
      ],
    }),
    named('q_address', 'bd_address', 'ঠিকানা', 'Address', {
      standardColumn: 'division_id,district_id,upazila_id,union_id',
    }),
    named('q_village', 'short_text', 'গ্রাম', 'Village', { standardColumn: 'village' }),
    named('q_date', 'date', 'আবেদনের তারিখ', 'Date of application', {
      settings: { default: { today: true } },
    }),
    named('q_prefix', 'short_text', 'আবেদন নম্বরের শুরু', 'Application number prefix', {
      settings: { default: { text: 'SRP-26-' }, read_only: true },
    }),
  ]),
  titled('family', 'পরিবার', 'Family', [
    named('q_family', 'number', 'পরিবারের সদস্য সংখ্যা', 'Family members'),
    named('members', 'repeat_group', 'পরিবারের সদস্য', 'Members of the family', {
      required: false,
    }),
    named('m_name', 'short_text', 'সদস্যের নাম', "Member's name", {
      settings: { repeat: { group: 'members' } },
    }),
  ]),
  titled('money', 'আয়-ব্যয়', 'Income and spending', [
    named('q_income', 'money', 'মাসিক আয়', 'Monthly income'),
    named('q_expense', 'money', 'মাসিক ব্যয়', 'Monthly spending'),
    named(
      'q_deficit',
      'long_text',
      'আয়ের চেয়ে ব্যয় বেশি হওয়ার কারণ',
      'Why spending is above income',
      {
        logic: { show_if: { field: 'q_expense', op: 'gt', value: { field: 'q_income' } } },
      },
    ),
  ]),
  titled('assets', 'সম্পদ', 'Assets', [
    named('q_karat', 'radio', 'সোনার ক্যারেট', 'Gold karat', {
      options: [
        choice('k22', { bn: '22 ক্যারেট', en: '22 karat' }),
        choice('k21', { bn: '21 ক্যারেট', en: '21 karat' }),
      ],
    }),
    named('q_gold_price', 'calculation', 'প্রতি আনার দাম', 'Price per ana', { required: false }),
    named('q_gold_anas', 'number', 'সোনার পরিমাণ (আনা)', 'Gold (ana)'),
    named('q_cash', 'money', 'নগদ টাকা', 'Cash'),
    named('q_assets', 'calculation', 'মোট সম্পদ', 'Total assets', { required: false }),
  ]),
  titled('farm', 'খামার', 'Farm', [
    named('q_farm', 'radio', 'কী পালন করতে চান?', 'What do you want to raise?', {
      options: [
        choice('cow', { bn: 'গরু', en: 'cows' }),
        choice('goat', { bn: 'ছাগল', en: 'goats' }),
      ],
    }),
    named(
      'q_count',
      'number',
      'কতটি {{q_farm}} পালন করতে চান?',
      'How many {{q_farm}} do you want to raise?',
    ),
  ]),
];

const LIVESTOCK = named('q_livestock', 'number_table', 'গবাদি পশু', 'Livestock', {
  settings: {
    table: {
      rows: [{ key: 'r1', label: { bn: 'গরু', en: 'Cows' } }],
      cols: [{ key: 'c1', label: { bn: 'নিজের', en: 'Own' } }],
    },
  },
});
const TOTAL_ASSETS = {
  expr: {
    op: 'add',
    args: [
      { op: 'mul', args: [{ field: 'q_gold_anas' }, { field: 'q_gold_price' }] },
      { field: 'q_cash' },
    ],
  },
};

/** The demo with a number table and the total assets' formula in place, for pages that only look at it. */
export const DEMO_FINISHED = DEMO_SECTIONS.map((s) => ({
  ...s,
  fields: [
    ...s.fields.map((f) => (f.fieldKey === 'q_assets' ? { ...f, calculation: TOTAL_ASSETS } : f)),
    ...(s.key === 'farm' ? [LIVESTOCK] : []),
  ],
}));

/**
 * A new ready form for beneficiary applications with the demo's body (or the given sections) in
 * its draft, made through the API by `loginId`, one of the two roles that keep the ready forms. Returns the form's id; the builder opens it at
 * `/admin/ready-forms/<id>`.
 */
export async function demoReadyForm(
  page: Page,
  loginId: string,
  title: string,
  sections: unknown[] = DEMO_SECTIONS,
): Promise<string> {
  const origin = new URL(page.url()).origin;
  // the API refuses a write without the app's origin, which a browser would send
  const context = await apiRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  try {
    const builder = await apiAs(context, loginId);
    const made = await builder.post('/ready-forms', {
      key: `e2e_${code().toLowerCase()}`,
      title: { bn: title, en: 'Self-reliance application' },
      kind: 'beneficiary_application',
      source: { kind: 'blank' },
    });
    expect(made.ok(), await made.text()).toBe(true);
    const ready = ((await made.json()) as { data: { id: string; draftVersionId: string } }).data;
    const etag = (await builder.get(`/form-versions/${ready.draftVersionId}`)).headers()['etag'];
    const saved = await builder.patch(
      `/form-versions/${ready.draftVersionId}`,
      { sections },
      { 'If-Match': etag ?? '' },
    );
    expect(saved.ok(), await saved.text()).toBe(true);
    return ready.id;
  } finally {
    await context.dispose();
  }
}
