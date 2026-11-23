import type { Me } from '@css/shared/auth';
import { SETTING_DEFAULTS } from '@css/shared/settings';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { SettingsPage } from './SettingsPage';

// The settings page of the global roles: organisation, language, thresholds, lists and the
// notification channels with the dummy OTP warning. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const ADMIN: Me = { ...ME, roles: ['admin'] };
const PM: Me = { ...ME, roles: ['program_manager'] };

const SETTINGS = [
  { key: 'organisation', value: SETTING_DEFAULTS.organisation, updatedAt: null },
  { key: 'localization', value: SETTING_DEFAULTS.localization, updatedAt: null },
  {
    key: 'monitoring.thresholds',
    value: SETTING_DEFAULTS['monitoring.thresholds'],
    updatedAt: '2026-10-16T05:00:00.000Z',
  },
];
const item = { system: false, kind: null };
const ITEMS = [
  {
    code: 'decoration',
    label: { bn: 'সাজসজ্জা', en: 'Decoration' },
    active: true,
    sortOrder: 1,
    ...item,
  },
  { code: 'food', label: { bn: 'খাবার', en: 'Food' }, active: false, sortOrder: 2, ...item },
];
const LISTS: Record<string, unknown[]> = {
  media_stage: [
    {
      code: 'published',
      label: { bn: 'প্রকাশিত', en: 'Published' },
      active: true,
      sortOrder: 1,
      system: true,
      kind: null,
    },
  ],
  media_platform: [
    {
      code: 'asf_youtube',
      label: { bn: 'আস-সুন্নাহ ইউটিউব', en: 'As-Sunnah YouTube' },
      active: true,
      sortOrder: 1,
      system: false,
      kind: 'youtube',
    },
  ],
};
const GROUPS = [
  { id: 'g1', canonical: 'আক্তার', variants: ['আকতার', 'আখতার'], active: true, etag: '"v1"' },
  { id: 'g2', canonical: 'হোসেন', variants: ['হোসাইন'], active: false, etag: '"v2"' },
];
const CHANNELS = {
  smtp: {
    host: 'mail.example.org',
    port: 587,
    secure: true,
    from: 'ERP <erp@example.org>',
    loginSet: true,
  },
  sms: {
    mode: 'logging',
    keyPresent: false,
    config: SETTING_DEFAULTS['sms.provider'],
    updatedAt: null,
  },
  otpDummy: true,
};

let patched: { key: string; body: unknown }[];
let added: unknown[];
let itemPatches: unknown[];
let smsPut: unknown[];
let variantsAdded: unknown[];
let variantPatches: { id: string; ifMatch: string | null; body: unknown }[];
let variantsRead: number;
let settingsRead: number;

function serve() {
  patched = [];
  added = [];
  itemPatches = [];
  smsPut = [];
  variantsAdded = [];
  variantPatches = [];
  variantsRead = 0;
  settingsRead = 0;
  server.use(
    http.get('*/api/v1/settings', () => {
      settingsRead += 1;
      return HttpResponse.json({ data: SETTINGS, meta: {} });
    }),
    http.patch('*/api/v1/settings/:key', async ({ params, request }) => {
      const body = (await request.json()) as { value: { budgetAlertPercent?: number } };
      patched.push({ key: String(params.key), body });
      if (body.value.budgetAlertPercent === 99)
        return HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              requestId: 'req_x',
              details: [
                {
                  path: 'value.budgetAlertPercent',
                  code: 'validation.out_of_range',
                  message: 'মানটি অনুমোদিত সীমার বাইরে।',
                },
              ],
            },
          },
          { status: 422 },
        );
      return HttpResponse.json({
        data: { key: params.key, value: body.value, updatedAt: '2026-10-17T05:00:00.000Z' },
        meta: {},
      });
    }),
    http.get('*/api/v1/reference-lists/:list', ({ params }) =>
      HttpResponse.json({ data: LISTS[String(params.list)] ?? ITEMS, meta: {} }),
    ),
    http.post('*/api/v1/reference-lists/:list', async ({ request }) => {
      const body = (await request.json()) as { code: string; label: { bn: string; en: string } };
      added.push(body);
      return HttpResponse.json(
        { data: { kind: null, ...body, active: true, sortOrder: 3, system: false }, meta: {} },
        { status: 201 },
      );
    }),
    http.patch('*/api/v1/reference-lists/:list/items/:code', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      itemPatches.push(body);
      return HttpResponse.json({ data: { ...ITEMS[0], ...body }, meta: {} });
    }),
    http.get('*/api/v1/name-variants', () => {
      variantsRead++;
      return HttpResponse.json({ data: GROUPS, meta: {} });
    }),
    http.patch('*/api/v1/name-variants/:id', async ({ params, request }) => {
      variantPatches.push({
        id: String(params.id),
        ifMatch: request.headers.get('if-match'),
        body: await request.json(),
      });
      // another official changed the group after this page read it
      return HttpResponse.json(
        {
          error: {
            code: 'conflict.stale_version',
            message: 'অন্য কেউ এর মধ্যে তথ্য বদলেছেন। সর্বশেষ তথ্য দেখতে আবার লোড করুন।',
            requestId: 'req_s',
          },
        },
        { status: 412 },
      );
    }),
    http.post('*/api/v1/name-variants', async ({ request }) => {
      const body = (await request.json()) as { canonical: string; variants: string[] };
      variantsAdded.push(body);
      if (body.variants.includes('হোসাইন'))
        return HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              requestId: 'req_v',
              details: [
                {
                  path: 'variants.0',
                  code: 'validation.name_variant_taken',
                  message: 'এই বানান আরেকটি দলে আছে।',
                },
              ],
            },
          },
          { status: 422 },
        );
      return HttpResponse.json(
        { data: { id: 'g3', ...body, active: true, etag: '"v3"' }, meta: {} },
        { status: 201 },
      );
    }),
    http.get('*/api/v1/admin/channels', () => HttpResponse.json({ data: CHANNELS, meta: {} })),
    http.put('*/api/v1/admin/channels/sms', async ({ request }) => {
      const body = (await request.json()) as typeof CHANNELS.sms.config;
      smsPut.push(body);
      return HttpResponse.json({
        data: { ...CHANNELS, sms: { ...CHANNELS.sms, config: body } },
        meta: {},
      });
    }),
  );
}

const open = (tab?: string) =>
  renderApp(<SettingsPage />, 'bn', {
    path: '/admin/settings',
    initialPath: tab ? `/admin/settings?tab=${tab}` : '/admin/settings',
  });

beforeEach(() => {
  resetClientForTests();
});

describe('the settings page', () => {
  it('saves the organisation details and says so', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open();
    const phone = await screen.findByRole('textbox', { name: /^যোগাযোগের মোবাইল/ });
    expect(screen.getByText('সিস্টেম কনফিগারেশন')).toBeInTheDocument();
    expect(screen.getByText('এখনও ডিফল্ট মান চলছে।')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(phone);
    await user.type(phone, '01711000000');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    expect(await screen.findByText('সেটিংস সংরক্ষিত হয়েছে।')).toBeInTheDocument();
    expect(patched[0]).toMatchObject({
      key: 'organisation',
      body: { value: { ...SETTING_DEFAULTS.organisation, phone: '01711000000' } },
    });
    await expectNoAxeViolations(container);
  });

  it('sends a save once when Enter is pressed again while it is on its way', async () => {
    refreshAs(HEAD);
    serve();
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const bodies: unknown[] = [];
    server.use(
      http.patch('*/api/v1/settings/:key', async ({ params, request }) => {
        bodies.push(await request.json());
        await answered;
        return HttpResponse.json({
          data: { key: params.key, value: SETTING_DEFAULTS.organisation, updatedAt: null },
          meta: {},
        });
      }),
    );
    open();
    const phone = await screen.findByRole('textbox', { name: /^যোগাযোগের মোবাইল/ });
    const user = userEvent.setup();
    await user.type(phone, '{Enter}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    await user.type(phone, '{Enter}');
    answer();
    expect(await screen.findByText('সেটিংস সংরক্ষিত হয়েছে।')).toBeInTheDocument();
    expect(bodies).toEqual([{ value: SETTING_DEFAULTS.organisation }]);
  });

  it('changes a threshold and shows the server message on the field it names', async () => {
    refreshAs(HEAD);
    serve();
    open('thresholds');
    const review = await screen.findByRole('textbox', { name: /^রিভিউ অপেক্ষার দিন/ });
    expect(screen.getByText(/^সর্বশেষ পরিবর্তন: /)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(review);
    await user.type(review, '8');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    await screen.findByText('সেটিংস সংরক্ষিত হয়েছে।');
    expect(patched[0]).toMatchObject({
      key: 'monitoring.thresholds',
      body: { value: { reviewPendingDays: 8, budgetAlertPercent: 90 } },
    });
    const budget = screen.getByRole('textbox', { name: /^বাজেট ব্যবহারের সতর্কসীমা/ });
    // a value outside the setting's range is refused before the server is asked, in its words
    await user.clear(budget);
    await user.type(budget, '150');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    expect(await screen.findByText('মানটি অনুমোদিত সীমার বাইরে।')).toBeInTheDocument();
    expect(patched).toHaveLength(1);
    // one the server refuses shows its message on the field it names
    await user.clear(budget);
    await user.type(budget, '99');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    await waitFor(() => expect(patched).toHaveLength(2));
    await waitFor(() => expect(budget).toHaveAccessibleDescription(/মানটি অনুমোদিত সীমার বাইরে।/));
    expect(screen.queryByText('কিছু তথ্য সঠিক নয়।')).not.toBeInTheDocument();
  });

  it('keeps the default language', async () => {
    refreshAs(HEAD);
    serve();
    open('language');
    await screen.findByText(/যে ডিভাইসে কেউ ভাষা বেছে নেননি/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    await screen.findByText('সেটিংস সংরক্ষিত হয়েছে।');
    expect(patched[0]).toEqual({ key: 'localization', body: { value: { defaultLanguage: 'bn' } } });
  });

  it('adds a list item and switches one off; nothing is deleted', async () => {
    refreshAs(HEAD);
    serve();
    open('lists');
    const expense = await screen.findByRole('heading', { level: 2, name: 'খরচের খাত' });
    const card = expense.closest('section') as HTMLElement;
    expect(await within(card).findAllByText('সাজসজ্জা')).not.toHaveLength(0);
    expect(within(card).getAllByText('বন্ধ').length).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'নতুন আইটেম' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আইটেম: খরচের খাত' });
    await user.type(within(dialog).getByRole('textbox', { name: /^কোড/ }), 'banner_print');
    await user.type(
      within(dialog).getByRole('textbox', { name: /^নাম \(বাংলা\)/ }),
      'ব্যানার ছাপা',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /^নাম \(ইংরেজি\)/ }),
      'Banner printing',
    );
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(await screen.findByText('ব্যানার ছাপা সংরক্ষিত হয়েছে।')).toBeInTheDocument();
    expect(added[0]).toEqual({
      code: 'banner_print',
      label: { bn: 'ব্যানার ছাপা', en: 'Banner printing' },
    });

    await user.click(within(card).getAllByRole('button', { name: 'সাজসজ্জা সম্পাদনা' })[0]!);
    const edit = await screen.findByRole('dialog', { name: 'আইটেম সম্পাদনা: সাজসজ্জা' });
    expect(within(edit).queryByRole('textbox', { name: /^কোড/ })).toBeNull();
    await user.click(within(edit).getByRole('switch', { name: 'চালু' }));
    await user.click(within(edit).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(itemPatches[0]).toMatchObject({ active: false }));
    // two dialogs typed through: slow when the whole suite shares the machine
  }, 20_000);

  it('keeps a system stage on, and asks a new platform for its kind', async () => {
    refreshAs(HEAD);
    serve();
    open('lists');
    const stages = await screen.findByRole('heading', { level: 2, name: 'মিডিয়ার ধাপ' });
    const stageCard = stages.closest('section') as HTMLElement;
    expect(await within(stageCard).findAllByText('সিস্টেমের প্রয়োজনীয়')).not.toHaveLength(0);
    const user = userEvent.setup();
    await user.click(within(stageCard).getAllByRole('button', { name: 'প্রকাশিত সম্পাদনা' })[0]!);
    const edit = await screen.findByRole('dialog', { name: 'আইটেম সম্পাদনা: প্রকাশিত' });
    expect(within(edit).queryByRole('switch', { name: 'চালু' })).toBeNull();
    expect(within(edit).getByText(/মিডিয়ার নিয়মে এই ধাপ লাগে/)).toBeInTheDocument();
    await user.click(within(edit).getByRole('button', { name: 'বাতিল' }));

    const platforms = screen.getByRole('heading', { level: 2, name: 'প্রকাশের প্ল্যাটফর্ম' });
    const card = platforms.closest('section') as HTMLElement;
    expect(await within(card).findAllByText('YouTube')).not.toHaveLength(0);
    await user.click(within(card).getByRole('button', { name: 'নতুন আইটেম' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'নতুন আইটেম: প্রকাশের প্ল্যাটফর্ম',
    });
    await user.type(within(dialog).getByRole('textbox', { name: /^কোড/ }), 'asf_website');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম \(বাংলা\)/ }), 'ওয়েবসাইট');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম \(ইংরেজি\)/ }), 'Website');
    expect(within(dialog).getByRole('button', { name: 'সংরক্ষণ' })).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /ধরন/ }));
    await user.click(await screen.findByRole('option', { name: 'অন্য ওয়েবসাইট' }));
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() =>
      expect(added[0]).toEqual({
        code: 'asf_website',
        label: { bn: 'ওয়েবসাইট', en: 'Website' },
        kind: 'other',
      }),
    );
  }, 20_000);

  it('shows SMTP read-only, whether the SMS key is set and the red dummy OTP warning', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open('channels');
    expect(await screen.findByText('ডামি OTP চালু আছে')).toBeInTheDocument();
    expect(screen.getByText('mail.example.org')).toBeInTheDocument();
    expect(screen.getByText('কী সেট নেই')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^হোস্ট/ })).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /^প্রোভাইডার কোড/ }), 'sample_gateway');
    await user.type(
      screen.getByRole('textbox', { name: /^এন্ডপয়েন্ট/ }),
      'https://sms.example.com/send',
    );
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    await screen.findByText('সেটিংস সংরক্ষিত হয়েছে।');
    expect(smsPut[0]).toEqual({
      provider: 'sample_gateway',
      senderId: null,
      enabled: false,
      endpoint: 'https://sms.example.com/send',
    });
    await expectNoAxeViolations(container);
  });

  it('says when the dummy OTP is off, and shows a refused endpoint on its field', async () => {
    refreshAs(HEAD);
    serve();
    let puts = 0;
    server.use(
      http.get('*/api/v1/admin/channels', () =>
        HttpResponse.json({ data: { ...CHANNELS, otpDummy: false }, meta: {} }),
      ),
      http.put('*/api/v1/admin/channels/sms', () => {
        puts += 1;
        return HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              requestId: 'req_x',
              details: [
                {
                  path: 'endpoint',
                  code: 'validation.https_public_url',
                  message: 'প্রোভাইডারের ইন্টারনেটের https ঠিকানা দিন।',
                },
              ],
            },
          },
          { status: 422 },
        );
      }),
    );
    open('channels');
    expect(await screen.findByText('ডামি OTP বন্ধ আছে।')).toBeInTheDocument();
    expect(screen.queryByText('ডামি OTP চালু আছে')).toBeNull();
    const user = userEvent.setup();
    const endpoint = screen.getByRole('textbox', { name: /^এন্ডপয়েন্ট/ });
    // an address inside the network is refused before the server is asked, in its words
    await user.type(endpoint, 'http://10.0.0.1/send');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    expect(
      await screen.findByText('প্রোভাইডারের ইন্টারনেটের https ঠিকানা দিন।'),
    ).toBeInTheDocument();
    expect(puts).toBe(0);
    // one the server refuses shows its message on the field it names
    await user.clear(endpoint);
    await user.type(endpoint, 'https://sms.example.com/send');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    await waitFor(() => expect(puts).toBe(1));
    await waitFor(() =>
      expect(endpoint).toHaveAccessibleDescription(/প্রোভাইডারের ইন্টারনেটের https ঠিকানা দিন।/),
    );
    expect(screen.queryByText('কিছু তথ্য সঠিক নয়।')).not.toBeInTheDocument();
  });

  it('refuses a list code in capitals before asking the server', async () => {
    refreshAs(HEAD);
    serve();
    open('lists');
    const expense = await screen.findByRole('heading', { level: 2, name: 'খরচের খাত' });
    const card = expense.closest('section') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'নতুন আইটেম' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আইটেম: খরচের খাত' });
    await user.type(within(dialog).getByRole('textbox', { name: /^কোড/ }), 'Banner');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম \(বাংলা\)/ }), 'ব্যানার');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম \(ইংরেজি\)/ }), 'Banner');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText(
        'ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও _ দিন; শুরু হবে অক্ষর দিয়ে।',
      ),
    ).toBeInTheDocument();
    expect(added).toHaveLength(0);
  }, 20_000);

  it('shows the server’s message on the names it refuses, and edits the names and the order', async () => {
    refreshAs(HEAD);
    serve();
    server.use(
      http.post(
        '*/api/v1/reference-lists/:list',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'validation.failed',
                message: 'কিছু তথ্য সঠিক নয়।',
                requestId: 'req_x',
                details: [{ path: 'label', code: 'x', message: 'এই নাম আগেই আছে।' }],
              },
            },
            { status: 422 },
          ),
        { once: true },
      ),
    );
    open('lists');
    const expense = await screen.findByRole('heading', { level: 2, name: 'খরচের খাত' });
    const card = expense.closest('section') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'নতুন আইটেম' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আইটেম: খরচের খাত' });
    await user.type(within(dialog).getByRole('textbox', { name: /^কোড/ }), 'food_pack');
    const bn = within(dialog).getByRole('textbox', { name: /^নাম \(বাংলা\)/ });
    await user.type(bn, 'খাবার');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম \(ইংরেজি\)/ }), 'Food');
    await user.type(within(dialog).getByRole('textbox', { name: /^ক্রম/ }), '7');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    // the names' message stands under the Bengali name, as the first of the two
    await waitFor(() => expect(bn).toHaveAccessibleDescription('এই নাম আগেই আছে।'));
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল' }));

    await user.click(within(card).getAllByRole('button', { name: 'সাজসজ্জা সম্পাদনা' })[0]!);
    const edit = await screen.findByRole('dialog', { name: 'আইটেম সম্পাদনা: সাজসজ্জা' });
    const order = within(edit).getByRole('textbox', { name: /^ক্রম/ });
    await user.clear(order);
    await user.type(order, '1২a5');
    const en = within(edit).getByRole('textbox', { name: /^নাম \(ইংরেজি\)/ });
    await user.type(en, ' ');
    await user.click(within(edit).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() =>
      expect(itemPatches).toEqual([
        {
          label: { bn: 'সাজসজ্জা', en: 'Decoration' },
          active: true,
          sortOrder: 15,
        },
      ]),
    );
  }, 20_000);

  it('lists the spelling groups and adds one through the dialog', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open('lists');
    const heading = await screen.findByRole('heading', { level: 2, name: 'নামের বানানভেদ' });
    const card = heading.closest('section') as HTMLElement;
    expect(within(card).getByText(/একই নামের ভিন্ন বানান এখানে এক দলে রাখুন।/)).toBeInTheDocument();
    expect(await within(card).findAllByText('আক্তার')).not.toHaveLength(0);
    expect(within(card).getAllByText('আকতার, আখতার').length).toBeGreaterThan(0);
    expect(within(card).getAllByText('বন্ধ').length).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'নতুন বানানভেদ যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন বানানভেদ' });
    await user.type(within(dialog).getByRole('textbox', { name: /^মূল বানান/ }), 'কাদের');
    await user.type(within(dialog).getByRole('textbox', { name: /^অন্য বানান/ }), 'কাদির, কাদীর');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(await screen.findByText('কাদের সংরক্ষিত হয়েছে।')).toBeInTheDocument();
    expect(variantsAdded).toEqual([{ canonical: 'কাদের', variants: ['কাদির', 'কাদীর'] }]);
    await expectNoAxeViolations(container);
  }, 20_000);

  it('refuses a title before asking, and shows the server’s refusal of a spelling at its field', async () => {
    refreshAs(HEAD);
    serve();
    open('lists');
    const heading = await screen.findByRole('heading', { level: 2, name: 'নামের বানানভেদ' });
    const card = heading.closest('section') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'নতুন বানানভেদ যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন বানানভেদ' });
    const others = within(dialog).getByRole('textbox', { name: /^অন্য বানান/ });
    await user.type(within(dialog).getByRole('textbox', { name: /^মূল বানান/ }), 'হোসেন');
    await user.type(others, 'মোঃ');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(others).toHaveAccessibleDescription(/^মোঃ: এটি উপাধি/));
    expect(variantsAdded).toHaveLength(0);
    // a spelling another group holds is refused by the server, under the field that holds it
    await user.clear(others);
    await user.type(others, 'হোসাইন');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() =>
      expect(others).toHaveAccessibleDescription('হোসাইন: এই বানান আরেকটি দলে আছে।'),
    );
    expect(variantsAdded).toHaveLength(1);
    expect(screen.queryByText('কিছু তথ্য সঠিক নয়।')).not.toBeInTheDocument();
  }, 20_000);

  it('sends the version a group was read at, and says so when another official changed it', async () => {
    refreshAs(HEAD);
    serve();
    open('lists');
    const heading = await screen.findByRole('heading', { level: 2, name: 'নামের বানানভেদ' });
    const card = heading.closest('section') as HTMLElement;
    const user = userEvent.setup();
    const edits = await within(card).findAllByRole('button', { name: /^আক্তার/ });
    await user.click(edits[0]!);
    const dialog = await screen.findByRole('dialog', { name: /আক্তার/ });
    const others = within(dialog).getByRole('textbox', { name: /^অন্য বানান/ });
    await user.type(others, '{Enter}আকতের');
    const reads = variantsRead;
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText(
        'অন্য কেউ এর মধ্যে তথ্য বদলেছেন। সর্বশেষ তথ্য দেখতে আবার লোড করুন।',
      ),
    ).toBeInTheDocument();
    expect(variantPatches).toEqual([
      {
        id: 'g1',
        ifMatch: '"v1"',
        body: { canonical: 'আক্তার', variants: ['আকতার', 'আখতার', 'আকতের'], active: true },
      },
    ]);
    // the list is read again, so the next opening of the dialog starts from the stored group
    await waitFor(() => expect(variantsRead).toBeGreaterThan(reads));
  }, 20_000);

  it('shows the forbidden content to a Program Manager', async () => {
    refreshAs(PM);
    serve();
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('সেটিংস');
    expect(settingsRead).toBe(0);
  });

  it('lets an Admin keep the office addresses, adding the one the page is opened from', async () => {
    refreshAs(ADMIN);
    serve();
    const put: unknown[] = [];
    let addresses: string[] = ['198.51.100.0/24'];
    server.use(
      http.get('*/api/v1/admin/office-addresses', () =>
        HttpResponse.json({
          data: { addresses, updatedAt: null, yourAddress: '203.0.113.5' },
          meta: {},
        }),
      ),
      http.put('*/api/v1/admin/office-addresses', async ({ request }) => {
        const body = (await request.json()) as { addresses: string[] };
        put.push(body);
        addresses = body.addresses;
        return HttpResponse.json({
          data: { addresses, updatedAt: '2026-11-23T10:00:00.000Z', yourAddress: '203.0.113.5' },
          meta: {},
        });
      }),
    );
    const user = userEvent.setup();
    const { container } = open('security');
    expect(await screen.findByText('এই কম্পিউটারের ঠিকানা: 203.0.113.5')).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: /^অফিসের ঠিকানা/ });
    expect(field).toHaveValue('198.51.100.0/24');
    // a range wider than a /24 is refused before the server is asked
    await user.clear(field);
    await user.type(field, '10.0.0.0/16');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    expect(
      await screen.findByText(
        'একটি IP ঠিকানা লিখুন, বা এমন একটি পরিসর যা IPv4-এ /24 আর IPv6-এ /56-এর চেয়ে বড় নয়।',
      ),
    ).toBeInTheDocument();
    expect(put).toEqual([]);
    await user.clear(field);
    await user.type(field, '198.51.100.0/24');
    await user.click(screen.getByRole('button', { name: 'এই ঠিকানা যোগ করুন' }));
    expect(field).toHaveValue('198.51.100.0/24\n203.0.113.5');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    await screen.findByText('সেটিংস সংরক্ষিত হয়েছে।');
    expect(put).toEqual([{ addresses: ['198.51.100.0/24', '203.0.113.5'] }]);
    // the address is listed now, so it is not offered again
    expect(screen.queryByRole('button', { name: 'এই ঠিকানা যোগ করুন' })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('shows the office addresses to the Admin only', async () => {
    refreshAs(HEAD);
    serve();
    open('security');
    expect(await screen.findByRole('tab', { name: 'প্রতিষ্ঠান' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'নিরাপত্তা' })).toBeNull();
    // the address names the tab, but the Head lands on the first one
    expect(screen.queryByRole('textbox', { name: /^অফিসের ঠিকানা/ })).toBeNull();
  });
});
