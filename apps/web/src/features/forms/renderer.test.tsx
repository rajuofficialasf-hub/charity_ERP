import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@css/ui/testing';
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
const place = (id: string, bn: string) => ({ id, name: { bn, en: bn } });

beforeEach(() => {
  sessionStorage.clear();
  server.use(
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const rows: Record<string, ReturnType<typeof place>[]> = {
        root: [place(DIVISION, 'ঢাকা বিভাগ')],
        [DIVISION]: [place(DISTRICT, 'ঢাকা জেলা')],
        [DISTRICT]: [place(UPAZILA, 'সাভার')],
        [UPAZILA]: [place(UNION, 'আশুলিয়া')],
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
  await user.click(screen.getByRole('button', { name: /gender/ }));
  await user.click(await screen.findByRole('option', { name: 'female' }));
  for (const [label, name] of [
    ['বিভাগ', 'ঢাকা বিভাগ'],
    ['জেলা', 'ঢাকা জেলা'],
    ['উপজেলা', 'সাভার'],
    ['ইউনিয়ন', 'আশুলিয়া'],
  ] as const) {
    const box = screen.getByRole('button', { name: level(label) });
    await waitFor(() => expect(box).toBeEnabled());
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

  it('waits for each level of the address before the next', async () => {
    open([]);
    expect(screen.getByRole('button', { name: level('জেলা') })).toBeDisabled();
    expect(screen.getByRole('button', { name: level('ইউনিয়ন') })).toBeDisabled();
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
    expect(screen.getByText('অংশ 1 / 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: level('বিভাগ') })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    expect(
      await screen.findByText(/পরের অংশে যাওয়ার আগে \d+টি সমস্যা ঠিক করুন/),
    ).toBeInTheDocument();
    expect(screen.getByText('অংশ 1 / 2')).toBeInTheDocument();
  });
});

describe('the answers in the tab', () => {
  it('come back after the screen is opened again, and are gone after sending', async () => {
    const user = userEvent.setup();
    const first = open([], { storageKey: 'form-test' });
    await user.type(screen.getByRole('textbox', { name: /^name/ }), 'নমুনা');
    await waitFor(() => expect(sessionStorage.getItem('form-test')).toContain('নমুনা'));
    first.unmount();
    const { submitted } = open([], { storageKey: 'form-test' });
    expect(screen.getByRole('textbox', { name: /^name/ })).toHaveValue('নমুনা');
    await user.clear(screen.getByRole('textbox', { name: /^name/ }));
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(sessionStorage.getItem('form-test')).toBeNull();
  }, 20_000);

  it('keep the same client id when the screen is opened again before sending', async () => {
    const user = userEvent.setup();
    const first = open([], { storageKey: 'form-id' });
    await user.type(screen.getByRole('textbox', { name: /^name/ }), 'ক');
    await waitFor(() => expect(sessionStorage.getItem('form-id')).not.toBeNull());
    const stored = JSON.parse(sessionStorage.getItem('form-id')!) as { clientUuid: string };
    first.unmount();
    const { submitted } = open([], { storageKey: 'form-id' });
    await user.clear(screen.getByRole('textbox', { name: /^name/ }));
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]!.clientUuid).toBe(stored.clientUuid);
  }, 20_000);

  it('are written nowhere without a storage key', async () => {
    const user = userEvent.setup();
    open([]);
    await user.type(screen.getByRole('textbox', { name: /^name/ }), 'নমুনা');
    expect(sessionStorage.length).toBe(0);
  });
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
  it('drops the stored copy when the person empties the answers again', async () => {
    const user = userEvent.setup();
    open([], { storageKey: 'form-empty' });
    const name = screen.getByRole('textbox', { name: /^name/ });
    await user.type(name, 'ক');
    await waitFor(() => expect(sessionStorage.getItem('form-empty')).not.toBeNull());
    await user.clear(name);
    await waitFor(() => expect(sessionStorage.getItem('form-empty')).toBeNull());
  });

  it('stores an added repeat row although nothing is typed in it yet', async () => {
    const user = userEvent.setup();
    open(
      [
        section('earners_part', [
          bilingual('earners', 'আয়কারী', 'Earners', 'repeat_group', {
            settings: { repeat: { max_rows: 3 } },
          }),
          bilingual('earner_name', 'আয়কারীর নাম', "Earner's name", 'short_text', {
            settings: { repeat: { group: 'earners' } },
          }),
        ]),
      ],
      { storageKey: 'form-rows' },
    );
    await user.click(screen.getByRole('button', { name: 'আরেকটি যোগ করুন' }));
    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem('form-rows') ?? '{}')).toMatchObject({
        rows: { earners: 1 },
      }),
    );
  });

  it('keeps the answers and the client id when the send fails, and shows the message', async () => {
    const user = userEvent.setup();
    const sent: Submission[] = [];
    let fail = true;
    const onSubmit = vi.fn(async (s: Submission) => {
      sent.push(s);
      if (fail) throw new Error('এখন পাঠানো যাচ্ছে না।');
    });
    open([], { storageKey: 'form-fail', onSubmit });
    await fillCore(user);
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    expect(await screen.findByText('এখন পাঠানো যাচ্ছে না।')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^name/ })).toHaveValue('নমুনা');
    expect(sessionStorage.getItem('form-fail')).not.toBeNull();
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
    expect(screen.getByRole('button', { name: level('জেলা') })).toBeDisabled();
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

  it('starts afresh from a stored copy that is not a copy of answers', () => {
    sessionStorage.setItem('form-bad', JSON.stringify({ clientUuid: 'x', answers: 'no' }));
    open([], { storageKey: 'form-bad' });
    expect(screen.getByRole('textbox', { name: /^name/ })).toHaveValue('');
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
