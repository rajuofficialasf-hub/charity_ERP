import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import type { MediaMember } from './media-api';
import { MemberPage } from './MemberPage';

// A Media Team member's profile: the designation, the contact for the team, the counts and the
// portfolio of published works with the member's own roles. Test data only.
const DIRECTOR: Me = { ...ME, roles: ['media_director'] };
const FINANCE: Me = { ...ME, roles: ['finance_team'] };
const USER = '01900000-0000-7000-8000-0000000000d1';
const place = {
  program: { id: 'p1', name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' } },
  project: { id: 'p1', name: { bn: 'স্বাবলম্বী 2026', en: 'Self-reliance 2026' }, year: 2026 },
};
const member = (over: Partial<MediaMember> = {}): MediaMember => ({
  id: USER,
  name: 'সুমাইয়া আক্তার',
  designation: 'ভিডিও এডিটর',
  mobile: '01711000001',
  email: 'sumaiya@example.org',
  roles: ['media_team'],
  counts: { works: 4, published: 1 },
  portfolio: [
    {
      referralId: 'r1',
      workId: 'w1',
      title: 'সেলাই মেশিনে ঘুরে দাঁড়ানো',
      ...place,
      stageCode: 'published',
      contentType: 'video',
      summary: null,
      publishedOn: '2026-10-12',
      publications: [
        {
          platformCode: 'asf_youtube',
          link: 'https://youtu.be/dQw4w9WgXcQ',
          publishedOn: '2026-10-12',
          youtubeId: 'dQw4w9WgXcQ',
        },
      ],
      members: [
        { userId: 'u1', name: 'রুবেল আহমেদ', roles: ['cinematographer'] },
        { userId: USER, name: 'সুমাইয়া আক্তার', roles: ['video_editor', 'scriptwriter'] },
      ],
      ownRoles: ['video_editor', 'scriptwriter'],
    },
  ],
  ...over,
});

let asked: number;

function serve(data: MediaMember) {
  asked = 0;
  server.use(
    http.get(`*/api/v1/media/members/${USER}`, () => {
      asked += 1;
      return HttpResponse.json({ data, meta: {} });
    }),
    http.get('*/api/v1/reference-lists/:list', ({ params }) =>
      HttpResponse.json({
        data:
          params.list === 'media_role'
            ? [
                {
                  code: 'video_editor',
                  label: { bn: 'ভিডিও সম্পাদনা', en: 'Video editing' },
                  active: true,
                  sortOrder: 1,
                  system: false,
                  kind: null,
                },
                {
                  code: 'scriptwriter',
                  label: { bn: 'স্ক্রিপ্ট লেখা', en: 'Scriptwriting' },
                  active: true,
                  sortOrder: 2,
                  system: false,
                  kind: null,
                },
              ]
            : params.list === 'media_platform'
              ? [
                  {
                    code: 'asf_youtube',
                    label: { bn: 'আস-সুন্নাহ ইউটিউব', en: 'ASF YouTube' },
                    active: true,
                    sortOrder: 1,
                    system: false,
                    kind: 'youtube',
                  },
                ]
              : [],
        meta: {},
      }),
    ),
  );
}

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<MemberPage />, locale, {
    path: '/media/members/:userId',
    initialPath: `/media/members/${USER}`,
  });

beforeEach(() => {
  resetClientForTests();
});

describe('a media member’s profile', () => {
  it('shows the contact, the counts and the portfolio with the member’s own roles', async () => {
    refreshAs(DIRECTOR);
    serve(member());
    const view = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'সুমাইয়া আক্তার' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ভিডিও এডিটর · মিডিয়া টিম')).toBeInTheDocument();
    expect(screen.getByText('01711000001')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    const portfolio = screen
      .getByRole('heading', { level: 2, name: 'পোর্টফোলিও' })
      .closest('.ui-card') as HTMLElement;
    expect(
      await within(portfolio).findByText('ভূমিকা: ভিডিও সম্পাদনা, স্ক্রিপ্ট লেখা'),
    ).toBeInTheDocument();
    expect(
      within(portfolio).getByRole('link', { name: 'আস-সুন্নাহ ইউটিউব-এ দেখুন' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });

  it('leaves the contact out when the server does', async () => {
    refreshAs(DIRECTOR);
    serve(member({ mobile: null, email: null }));
    open('en');
    expect(await screen.findByRole('heading', { level: 2, name: 'Portfolio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Contact' })).not.toBeInTheDocument();
  });

  it('shows the forbidden content to the Finance Team without asking the server', async () => {
    refreshAs(FINANCE);
    serve(member());
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('সুমাইয়া');
    expect(asked).toBe(0);
  });
});
