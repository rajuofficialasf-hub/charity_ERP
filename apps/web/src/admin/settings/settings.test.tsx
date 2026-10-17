import type { Me } from '@css/shared/auth';
import { SETTING_DEFAULTS } from '@css/shared/settings';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { SettingsPage } from './SettingsPage';

// The settings page of the global roles: organisation, language, thresholds, lists and the
// notification channels with the dummy OTP warning. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
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
const ITEMS = [
  { code: 'decoration', label: { bn: 'সাজসজ্জা', en: 'Decoration' }, active: true, sortOrder: 1 },
  { code: 'food', label: { bn: 'খাবার', en: 'Food' }, active: false, sortOrder: 2 },
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

function serve() {
  patched = [];
  added = [];
  itemPatches = [];
  smsPut = [];
  server.use(
    http.get('*/api/v1/settings', () => HttpResponse.json({ data: SETTINGS, meta: {} })),
    http.patch('*/api/v1/settings/:key', async ({ params, request }) => {
      const body = (await request.json()) as { value: { budgetAlertPercent?: number } };
      patched.push({ key: String(params.key), body });
      if (body.value.budgetAlertPercent === 150)
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
    http.get('*/api/v1/reference-lists/:list', () => HttpResponse.json({ data: ITEMS, meta: {} })),
    http.post('*/api/v1/reference-lists/:list', async ({ request }) => {
      const body = (await request.json()) as { code: string; label: { bn: string; en: string } };
      added.push(body);
      return HttpResponse.json(
        { data: { ...body, active: true, sortOrder: 3 }, meta: {} },
        { status: 201 },
      );
    }),
    http.patch('*/api/v1/reference-lists/:list/items/:code', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      itemPatches.push(body);
      return HttpResponse.json({ data: { ...ITEMS[0], ...body }, meta: {} });
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
    await user.clear(budget);
    await user.type(budget, '150');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    expect(await screen.findByText('মানটি অনুমোদিত সীমার বাইরে।')).toBeInTheDocument();
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
    const card = expense.closest('.ui-card') as HTMLElement;
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

  it('shows the forbidden content to a Program Manager', async () => {
    refreshAs(PM);
    serve();
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('সেটিংস');
  });
});
