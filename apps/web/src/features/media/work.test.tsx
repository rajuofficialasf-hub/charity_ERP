import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
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

function serve(initial: MediaReferral) {
  current = initial;
  decided = [];
  patches = [];
  teams = [];
  server.use(
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
    await user.click(within(confirm).getByRole('button', { name: 'গ্রহণ করুন' }));
    await waitFor(() => expect(decided).toEqual([{ decision: 'accept' }]));
  });

  it('moves the stage among those offered with the version read, and tells of a stale save', async () => {
    const user = userEvent.setup();
    refreshAs(MEMBER);
    serve(referral({ work: work({ mayDirect: false }) }));
    open();
    await user.click(await screen.findByRole('button', { name: /নতুন ধাপ/ }));
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
    await user.click(within(dialog).getByRole('button', { name: /মিডিয়া টিমের সদস্য খুঁজুন/ }));
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

  it('reads in English too, without accessibility violations', async () => {
    refreshAs(DIRECTOR);
    serve(referral());
    const view = open('en');
    expect(await screen.findByRole('heading', { level: 2, name: 'Script' })).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });
});
