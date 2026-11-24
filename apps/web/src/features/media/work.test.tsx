import type { Me } from '@css/shared/auth';
import { isoDateInDhaka } from '@css/shared/format';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import type { MediaReferral, MediaWork } from './media-api';
import { WorkPage } from './WorkPage';

// The media work page: the referral with the person's allowed details and the decision, then the
// work's stage, team, script, publications, final review, comments and history. Test data only.
const DIRECTOR: Me = { ...ME, roles: ['media_director'] };
const MEMBER: Me = { ...ME, roles: ['media_team'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const WORK = '01900000-0000-7000-8000-0000000000c2';
const RUBEL = '01900000-0000-7000-8000-0000000000c3';
const SUMAIYA = '01900000-0000-7000-8000-0000000000c4';
const place = {
  program: { id: 'p1', name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' } },
  project: { id: 'p1', name: { bn: 'স্বাবলম্বী 2026', en: 'Self-reliance 2026' }, year: 2026 },
};
const person = { id: 'u9', name: 'রাশেদ কবির' };
const work = (over: Partial<MediaWork> = {}): MediaWork => ({
  id: WORK,
  title: 'সেলাই মেশিনে ঘুরে দাঁড়ানো',
  stageCode: 'shooting_preparation',
  heldStageCode: null,
  contentType: 'video',
  script: { summary: 'সারকথা' },
  scriptState: 'draft',
  reviewApprovedBy: null,
  reviewApprovedAt: null,
  version: '"v1"',
  members: [{ userId: RUBEL, name: 'রুবেল আহমেদ', roles: ['cinematographer'] }],
  publications: [],
  comments: [],
  nextStages: ['planning', 'editing', 'ready_to_publish'],
  mayManage: true,
  mayEditScript: true,
  mayDirect: true,
  mayReview: false,
  ...over,
});
const referral = (over: Partial<MediaReferral> = {}): MediaReferral => ({
  id: ID,
  applicationId: 'a1',
  appNo: 'APP-0001',
  state: 'accepted',
  priority: 'high',
  beneficiaryName: 'আমেনা খাতুন',
  ...place,
  referredBy: person,
  referredAt: '2026-10-26T10:00:00Z',
  decidedAt: '2026-10-26T11:00:00Z',
  note: 'ভালো গল্প',
  story: 'একাই সংসার চালান',
  decidedBy: { id: 'u8', name: 'নাসির উদ্দিন' },
  decisionComment: null,
  beneficiary: {
    name: 'আমেনা খাতুন',
    fatherOrHusbandName: 'মৃত আব্দুল হক',
    ageYears: 38,
    mobile: '01711000000',
    address: {
      divisionId: 'd1',
      districtId: 'd2',
      upazilaId: 'd3',
      unionId: 'd4',
      village: 'পূর্বপাড়া',
      postOffice: null,
    },
    occupation: { bn: 'দর্জি', en: 'Tailor' },
    monthlyIncome: '9000.00',
  },
  officialComment: 'পরিশ্রমী মানুষ',
  work: work(),
  history: [
    {
      id: 'e1',
      kind: 'referred',
      fromValue: null,
      toValue: 'pending',
      comment: null,
      actor: person,
      at: '2026-10-26T10:00:00Z',
    },
  ],
  mayDecide: false,
  mayResend: false,
  ...over,
});
const item = (code: string, bn: string, extra: object = {}) => ({
  code,
  label: { bn, en: code },
  active: true,
  sortOrder: 1,
  system: false,
  kind: null,
  ...extra,
});
const LISTS: Record<string, unknown[]> = {
  media_stage: [
    item('planning', 'পরিকল্পনা ও দল'),
    item('shooting_preparation', 'শুটিং প্রস্তুতি'),
    item('editing', 'সম্পাদনা'),
    item('ready_to_publish', 'প্রকাশের জন্য প্রস্তুত', { system: true }),
  ],
  media_role: [item('cinematographer', 'ক্যামেরা'), item('video_editor', 'ভিডিও সম্পাদনা')],
  media_platform: [item('asf_youtube', 'আস-সুন্নাহ ইউটিউব', { kind: 'youtube' })],
};

let current: MediaReferral;
let decided: unknown[];
let patches: { ifMatch: string | null; body: unknown }[];
let teams: unknown[];
let writes: { at: string; ifMatch: string | null; body: unknown }[];

function serve(initial: MediaReferral) {
  current = initial;
  decided = [];
  patches = [];
  teams = [];
  writes = [];
  // the writes these tests only read back: each answers with the referral as it stands
  const record =
    (at: string) =>
    async ({ request }: { request: Request }) => {
      writes.push({ at, ifMatch: request.headers.get('If-Match'), body: await request.json() });
      return HttpResponse.json({ data: current, meta: {} });
    };
  server.use(
    http.post(`*/api/v1/media-works/${WORK}/final-review`, record('review')),
    http.post(`*/api/v1/media-works/${WORK}/publications`, record('publication')),
    http.patch('*/api/v1/media-publications/:id', record('publication-change')),
    http.post(`*/api/v1/media-works/${WORK}/comments`, record('comment')),
    http.get(`*/api/v1/media-referrals/${ID}`, () =>
      HttpResponse.json({ data: current, meta: {} }),
    ),
    http.post(`*/api/v1/media-referrals/${ID}/decision`, async ({ request }) => {
      const body = (await request.json()) as { decision: string };
      decided.push(body);
      current = referral({
        state: body.decision === 'accept' ? 'accepted' : 'sent_back',
        mayDecide: false,
      });
      return HttpResponse.json({ data: current, meta: {} });
    }),
    http.patch(`*/api/v1/media-works/${WORK}`, async ({ request }) => {
      const body = await request.json();
      patches.push({ ifMatch: request.headers.get('If-Match'), body });
      if (patches.length > 1)
        return HttpResponse.json(
          {
            error: {
              code: 'conflict.stale_version',
              message: 'পুরনো সংস্করণ',
              requestId: 'r',
              details: [],
            },
          },
          { status: 412 },
        );
      current = referral({ work: work({ version: '"v2"', stageCode: 'editing' }) });
      return HttpResponse.json({ data: current, meta: {} });
    }),
    http.put(`*/api/v1/media-works/${WORK}/members`, async ({ request }) => {
      expect(request.headers.get('If-Match')).toBe('"v1"');
      teams.push(await request.json());
      return HttpResponse.json({ data: current, meta: {} });
    }),
    http.get('*/api/v1/media/members', () =>
      HttpResponse.json({
        data: [
          { id: RUBEL, name: 'রুবেল আহমেদ', designation: null, roles: ['media_team'] },
          { id: SUMAIYA, name: 'সুমাইয়া আক্তার', designation: null, roles: ['media_team'] },
        ],
        meta: {},
      }),
    ),
    http.get('*/api/v1/reference-lists/:list', ({ params }) =>
      HttpResponse.json({ data: LISTS[String(params.list)] ?? [], meta: {} }),
    ),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [] })),
  );
}

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<WorkPage />, locale, {
    path: '/media/referrals/:referralId',
    initialPath: `/media/referrals/${ID}`,
  });

beforeEach(() => {
  resetClientForTests();
});

describe('the media work page', () => {
  it('shows the person’s allowed details and the official’s comment, never an identity number', async () => {
    refreshAs(DIRECTOR);
    serve(referral());
    const view = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'সেলাই মেশিনে ঘুরে দাঁড়ানো' }),
    ).toBeInTheDocument();
    for (const text of [
      'মৃত আব্দুল হক',
      '01711000000',
      'দর্জি',
      'পরিশ্রমী মানুষ',
      'একাই সংসার চালান',
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/NID নম্বর|জন্মনিবন্ধন/)).not.toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });

  it('lets a director accept a waiting referral, and send one back with a comment', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(
      referral({ state: 'pending', decidedBy: null, decidedAt: null, work: null, mayDecide: true }),
    );
    open();
    await user.click(await screen.findByRole('button', { name: 'সংশোধনের জন্য ফেরত দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'রেফারেল সংশোধনের জন্য ফেরত দিন' });
    const send = within(dialog).getByRole('button', { name: 'সংশোধনের জন্য ফেরত দিন' });
    expect(send).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কী ঠিক করতে হবে/ }), 'ছবি লাগবে');
    await user.click(send);
    await waitFor(() => expect(decided).toEqual([{ decision: 'send_back', comment: 'ছবি লাগবে' }]));
    expect(await screen.findByText('রেফারেল ফেরত দেওয়া হলো')).toBeInTheDocument();
  });

  it('accepts after asking once', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(
      referral({ state: 'pending', decidedBy: null, decidedAt: null, work: null, mayDecide: true }),
    );
    open();
    await user.click(await screen.findByRole('button', { name: 'গ্রহণ করুন' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'গ্রহণ করুন' });
    // says what follows before it is pressed
    expect(
      within(confirm).getByText('গ্রহণ করলে কাজ শুরু হবে; এরপর কাজের দল বেছে নিতে হবে।'),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'গ্রহণ করুন' }));
    await waitFor(() => expect(decided).toEqual([{ decision: 'accept' }]));
  });

  it('moves the stage among those offered with the version read, and tells of a stale save', async () => {
    const user = userEvent.setup();
    refreshAs(MEMBER);
    serve(referral({ work: work({ mayDirect: false }) }));
    open();
    await user.click(await screen.findByRole('combobox', { name: /নতুন ধাপ/ }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['পরিকল্পনা ও দল', 'সম্পাদনা', 'প্রকাশের জন্য প্রস্তুত']);
    await user.click(screen.getByRole('option', { name: 'সম্পাদনা' }));
    await user.click(screen.getByRole('button', { name: 'ধাপ বদলান' }));
    await waitFor(() =>
      expect(patches[0]).toEqual({ ifMatch: '"v1"', body: { stageCode: 'editing' } }),
    );
    expect(await screen.findByText('ধাপ বদলানো হলো, ইতিহাসে লেখা থাকল')).toBeInTheDocument();
    // a second save meets a version someone else changed
    await user.click(screen.getByRole('button', { name: 'স্ক্রিপ্ট সংরক্ষণ' }));
    expect(await screen.findAllByText(/এর মধ্যে অন্য কেউ কাজটি বদলেছেন/)).not.toHaveLength(0);
    expect(patches[1]?.ifMatch).toBe('"v2"');
  });

  it('gives a member no decision, no team change and no final review', async () => {
    refreshAs(MEMBER);
    serve(
      referral({
        work: work({ mayDirect: false, stageCode: 'ready_to_publish', mayReview: false }),
      }),
    );
    open();
    await screen.findByRole('heading', { level: 1, name: 'সেলাই মেশিনে ঘুরে দাঁড়ানো' });
    for (const name of ['গ্রহণ করুন', 'দল বদলান', 'চূড়ান্ত পর্যালোচনা অনুমোদন', 'নাম বদলান'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('lets a director put a member on the team with several roles', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(referral());
    open();
    await user.click(await screen.findByRole('button', { name: 'দল বদলান' }));
    const dialog = await screen.findByRole('dialog', { name: 'দল' });
    await user.click(within(dialog).getByRole('combobox', { name: /মিডিয়া টিমের সদস্য খুঁজুন/ }));
    await user.click(await screen.findByRole('option', { name: 'সুমাইয়া আক্তার' }));
    const save = within(dialog).getByRole('button', { name: 'সংরক্ষণ' });
    expect(save).toBeDisabled();
    const groups = within(dialog).getAllByRole('group', { name: /ভূমিকা/ });
    await user.click(within(groups[1]!).getByRole('checkbox', { name: 'ক্যামেরা' }));
    await user.click(within(groups[1]!).getByRole('checkbox', { name: 'ভিডিও সম্পাদনা' }));
    await user.click(save);
    await waitFor(() =>
      expect(teams).toEqual([
        {
          members: [
            { userId: RUBEL, roles: ['cinematographer'] },
            { userId: SUMAIYA, roles: ['cinematographer', 'video_editor'] },
          ],
        },
      ]),
    );
  });

  it('rejects a referral with its reason, and shows a refusal in the dialog', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(
      referral({ state: 'pending', decidedBy: null, decidedAt: null, work: null, mayDecide: true }),
    );
    server.use(
      http.post(
        `*/api/v1/media-referrals/${ID}/decision`,
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'validation.failed',
                message: 'কিছু তথ্য সঠিক নয়।',
                requestId: 'r',
                details: [{ path: 'comment', code: 'x', message: 'কারণটি আরও খুলে লিখুন।' }],
              },
            },
            { status: 422 },
          ),
        { once: true },
      ),
    );
    open();
    await user.click(await screen.findByRole('button', { name: 'বাতিল করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'রেফারেল বাতিল করুন' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), '  ছবি নেই  ');
    const reject = within(dialog).getByRole('button', { name: 'বাতিল করুন' });
    await user.click(reject);
    expect(await within(dialog).findByText('কারণটি আরও খুলে লিখুন।')).toBeInTheDocument();
    await user.click(reject);
    await waitFor(() => expect(decided).toEqual([{ decision: 'reject', comment: 'ছবি নেই' }]));
  });

  it('renames the work with the version read, the name trimmed', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(referral());
    open();
    await user.click(await screen.findByRole('button', { name: 'নাম বদলান' }));
    const dialog = await screen.findByRole('dialog', { name: 'নাম বদলান' });
    const save = within(dialog).getByRole('button', { name: 'সংরক্ষণ' });
    // the same name is no change
    expect(save).toBeDisabled();
    const name = within(dialog).getByRole('textbox', { name: /কাজের নাম/ });
    await user.clear(name);
    await user.type(name, '  নতুন নাম  ');
    await user.click(save);
    await waitFor(() =>
      expect(patches).toEqual([{ ifMatch: '"v1"', body: { title: 'নতুন নাম' } }]),
    );
    expect(await screen.findByText('সংরক্ষিত হলো')).toBeInTheDocument();
  });

  it('saves the filled parts of the script, trimmed, with its state and the version read', async () => {
    const user = userEvent.setup();
    refreshAs(MEMBER);
    serve(referral({ work: work({ mayDirect: false }) }));
    open();
    await user.type(
      await screen.findByRole('textbox', { name: 'সাক্ষাৎকারের প্রশ্ন' }),
      '  কীভাবে শুরু?  ',
    );
    await user.type(screen.getByRole('textbox', { name: 'দৃশ্য' }), '   ');
    await user.click(screen.getByRole('combobox', { name: 'স্ক্রিপ্টের অবস্থা' }));
    await user.click(await screen.findByRole('option', { name: 'চূড়ান্ত' }));
    await user.click(screen.getByRole('button', { name: 'স্ক্রিপ্ট সংরক্ষণ' }));
    await waitFor(() =>
      expect(patches).toEqual([
        {
          ifMatch: '"v1"',
          body: { script: { summary: 'সারকথা', questions: 'কীভাবে শুরু?' }, scriptState: 'final' },
        },
      ]),
    );
    expect(await screen.findByText('স্ক্রিপ্ট সংরক্ষিত')).toBeInTheDocument();
  });

  it('sends a work ready to publish back at the final review with a comment', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(referral({ work: work({ stageCode: 'ready_to_publish', mayReview: true }) }));
    open();
    await user.click(await screen.findByRole('button', { name: 'সংশোধনে ফেরত দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'কাজটি সংশোধনে ফেরত দিন' });
    const send = within(dialog).getByRole('button', { name: 'সংশোধনে ফেরত দিন' });
    expect(send).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কী ঠিক করতে হবে/ }), ' আলো কম ');
    await user.click(send);
    await waitFor(() =>
      expect(writes).toEqual([
        { at: 'review', ifMatch: '"v1"', body: { decision: 'send_back', comment: 'আলো কম' } },
      ]),
    );
  });

  it('says the final review is approved once it is', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    serve(referral({ work: work({ stageCode: 'ready_to_publish', mayReview: true }) }));
    open();
    await user.click(await screen.findByRole('button', { name: 'চূড়ান্ত পর্যালোচনা অনুমোদন' }));
    await waitFor(() =>
      expect(writes).toEqual([{ at: 'review', ifMatch: '"v1"', body: { decision: 'approve' } }]),
    );
    expect(await screen.findByText('চূড়ান্ত পর্যালোচনা অনুমোদিত হলো')).toBeInTheDocument();
  });

  it('adds a published post with its link and date, and clears an emptied note of one', async () => {
    const user = userEvent.setup();
    refreshAs(DIRECTOR);
    const PUBLICATION = '01900000-0000-7000-8000-0000000000c5';
    serve(
      referral({
        work: work({
          reviewApprovedBy: { id: 'u8', name: 'নাসির উদ্দিন' },
          reviewApprovedAt: '2026-10-27T10:00:00Z',
          publications: [
            {
              id: PUBLICATION,
              platformCode: 'asf_youtube',
              state: 'waiting',
              publishedOn: null,
              link: null,
              note: 'সোমবার',
              youtubeId: null,
            },
          ],
        }),
      }),
    );
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকাশ যোগ করুন' }));
    let dialog = await screen.findByRole('dialog', { name: 'প্রকাশ যোগ করুন' });
    const save = within(dialog).getByRole('button', { name: 'সংরক্ষণ' });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /প্ল্যাটফর্ম/ }));
    await user.click(await screen.findByRole('option', { name: 'আস-সুন্নাহ ইউটিউব' }));
    await user.click(within(dialog).getByRole('combobox', { name: /অবস্থা/ }));
    await user.click(await screen.findByRole('option', { name: 'প্রকাশিত' }));
    // a published post waits for its link
    expect(save).toBeDisabled();
    await user.type(
      within(dialog).getByRole('textbox', { name: /লিংক/ }),
      ' https://www.youtube.com/watch?v=abc ',
    );
    await user.click(save);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      at: 'publication',
      ifMatch: null,
      body: {
        platformCode: 'asf_youtube',
        state: 'published',
        publishedOn: isoDateInDhaka(new Date()),
        link: 'https://www.youtube.com/watch?v=abc',
      },
    });
    expect(await screen.findByText('প্রকাশ সংরক্ষিত হলো')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'আস-সুন্নাহ ইউটিউব-এর প্রকাশ বদলান' }));
    dialog = await screen.findByRole('dialog', { name: 'আস-সুন্নাহ ইউটিউব-এর প্রকাশ বদলান' });
    await user.clear(within(dialog).getByRole('textbox', { name: /নোট/ }));
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    // a waiting post without a link sends no date
    expect(writes[1]).toEqual({
      at: 'publication-change',
      ifMatch: null,
      body: { state: 'waiting', note: null },
    });
  }, 20_000);

  it('adds a comment, trimmed, and empties the box', async () => {
    const user = userEvent.setup();
    refreshAs(MEMBER);
    serve(referral({ work: work({ mayDirect: false }) }));
    open();
    const box = await screen.findByRole('textbox', { name: 'নতুন মন্তব্য' });
    const add = screen.getByRole('button', { name: 'মন্তব্য যোগ করুন' });
    expect(add).toBeDisabled();
    await user.type(box, '  ভালো হয়েছে  ');
    await user.click(add);
    await waitFor(() =>
      expect(writes).toEqual([{ at: 'comment', ifMatch: null, body: { body: 'ভালো হয়েছে' } }]),
    );
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('reads in English too, without accessibility violations', async () => {
    refreshAs(DIRECTOR);
    serve(referral());
    const view = open('en');
    expect(await screen.findByRole('heading', { level: 2, name: 'Script' })).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });
});
