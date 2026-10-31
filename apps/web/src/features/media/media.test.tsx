import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { MediaHomePage } from './MediaHomePage';

// The Media Team's home: what waits, the counts overall and by program, and the works list with
// its filters in the address. Test data only.
const DIRECTOR: Me = { ...ME, roles: ['media_director'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const P1 = '01900000-0000-7000-8000-0000000000a1';
const P2 = '01900000-0000-7000-8000-0000000000a2';
const counts = (n: number) => ({
  referrals: n,
  new: 1,
  inReview: 0,
  inProgress: n - 1,
  waitingForShooting: 0,
  inEditing: 0,
  published: 0,
  done: 0,
  rejected: 0,
});
const ROW = {
  referralId: '01900000-0000-7000-8000-0000000000b1',
  workId: '01900000-0000-7000-8000-0000000000b2',
  title: 'সেলাই মেশিনে ঘুরে দাঁড়ানো',
  beneficiaryName: 'আমেনা খাতুন',
  program: { id: P1, name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' } },
  project: { id: P1, name: { bn: 'স্বাবলম্বী 2026', en: 'Self-reliance 2026' }, year: 2026 },
  members: [{ userId: 'u1', name: 'রুবেল আহমেদ' }],
  state: 'accepted',
  stageCode: 'shooting_preparation',
  priority: 'high',
  referredAt: '2026-10-26T10:00:00Z',
  updatedAt: '2026-10-27T10:00:00Z',
};

let workUrls: URL[];

function serve() {
  workUrls = [];
  server.use(
    http.get('*/api/v1/me/attention', () =>
      HttpResponse.json({
        data: [
          { kind: 'media_referrals_new', count: 2, href: '/media?state=pending' },
          { kind: 'unread_notifications', count: 3, href: '/notifications' },
        ],
        meta: {},
      }),
    ),
    http.get('*/api/v1/media/summary', () =>
      HttpResponse.json({
        data: {
          overall: counts(5),
          programs: [
            { program: ROW.program, counts: counts(3) },
            {
              program: { id: P2, name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' } },
              counts: counts(2),
            },
          ],
        },
        meta: {},
      }),
    ),
    http.get('*/api/v1/media-works', ({ request }) => {
      workUrls.push(new URL(request.url));
      return HttpResponse.json({ data: [ROW], meta: { nextCursor: null } });
    }),
    http.get('*/api/v1/reference-lists/:list', ({ params }) =>
      HttpResponse.json({
        data:
          params.list === 'media_stage'
            ? [
                {
                  code: 'shooting_preparation',
                  label: { bn: 'শুটিং প্রস্তুতি', en: 'Shooting preparation' },
                  active: true,
                  sortOrder: 1,
                  system: false,
                  kind: null,
                },
              ]
            : [],
        meta: {},
      }),
    ),
  );
}

const open = (locale: 'bn' | 'en' = 'bn', initialPath = '/media') =>
  renderApp(<MediaHomePage />, locale, { path: '/media', initialPath });

beforeEach(() => {
  resetClientForTests();
});

describe('the Media Team home', () => {
  it('shows only the media items that wait, the counts and the works, without accessibility violations', async () => {
    refreshAs(DIRECTOR);
    serve();
    const view = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'মিডিয়ার কাজ' }),
    ).toBeInTheDocument();
    const waiting = await screen.findByRole('link', {
      name: /2টি নতুন মিডিয়া রেফারেল সিদ্ধান্তের অপেক্ষায়/,
    });
    expect(waiting).toHaveAttribute('href', '/media?state=pending');
    expect(screen.queryByText(/অপঠিত/)).not.toBeInTheDocument();
    expect(await screen.findByText('রেফারেল')).toBeInTheDocument();
    const work = await screen.findAllByRole('link', { name: 'সেলাই মেশিনে ঘুরে দাঁড়ানো' });
    expect(work[0]).toHaveAttribute('href', `/media/referrals/${ROW.referralId}`);
    expect((await screen.findAllByText('শুটিং প্রস্তুতি')).length).toBeGreaterThan(0);
    await expectNoAxeViolations(view.container);
  });

  it('shows the counts of one program when it is chosen', async () => {
    refreshAs(DIRECTOR);
    serve();
    open();
    const user = userEvent.setup();
    const card = (await screen.findByRole('heading', { level: 2, name: 'সংখ্যায়' })).closest(
      '.ui-card',
    ) as HTMLElement;
    await within(card).findByText('5');
    await user.click(within(card).getByRole('button', { name: /প্রোগ্রাম/ }));
    await user.click(await screen.findByRole('option', { name: 'মানবিক সহায়তা' }));
    expect(await within(card).findByText('2')).toBeInTheDocument();
    expect(within(card).queryByText('5')).not.toBeInTheDocument();
  });

  it('keeps the filters in the address and asks the server with them', async () => {
    refreshAs(DIRECTOR);
    serve();
    open('bn', '/media?priority=high');
    await screen.findAllByRole('link', { name: 'সেলাই মেশিনে ঘুরে দাঁড়ানো' });
    await waitFor(() => expect(workUrls[0]?.searchParams.get('priority')).toBe('high'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ফিল্টার মুছুন' }));
    await waitFor(() => expect(workUrls.at(-1)?.searchParams.get('priority')).toBeNull());
  });

  it('reads in English too, without accessibility violations', async () => {
    refreshAs(DIRECTOR);
    serve();
    const view = open('en');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Media work' }),
    ).toBeInTheDocument();
    await screen.findAllByRole('link', { name: 'সেলাই মেশিনে ঘুরে দাঁড়ানো' });
    await expectNoAxeViolations(view.container);
  });

  it('shows the forbidden content to a volunteer without asking the server', async () => {
    refreshAs(VOLUNTEER);
    serve();
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('মিডিয়ার কাজ');
    expect(workUrls).toHaveLength(0);
  });
});
