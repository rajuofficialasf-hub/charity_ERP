import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import type { InboxEntry } from './notifications-api';
import { NotificationsPage } from './NotificationsPage';

// The inbox: own entries, newest first by day, marked read one by one or all at once; the
// email setting for officials only.
const entry = (over: Partial<InboxEntry>): InboxEntry => ({
  id: '0190a1b2-0000-7000-8000-000000000001',
  templateKey: 'project_assignment',
  title: 'New project',
  body: 'You have been added to "Winter 2026".',
  link: '/my-projects/0190a1b2-0000-7000-8000-0000000000aa',
  count: 1,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const VOLUNTEER = { ...ME, kind: 'volunteer' as const, roles: ['volunteer_general'] };

function inbox(entries: InboxEntry[]) {
  const reads: unknown[] = [];
  let rows = entries;
  server.use(
    http.get('*/api/v1/notifications', ({ request }) => {
      const unread = new URL(request.url).searchParams.get('unread') === 'true';
      const shown = unread ? rows.filter((r) => !r.readAt) : rows;
      return HttpResponse.json({
        data: shown,
        meta: {
          nextCursor: null,
          prevCursor: null,
          unreadCount: rows.filter((r) => !r.readAt).length,
        },
      });
    }),
    http.post('*/api/v1/notifications/read', async ({ request }) => {
      const body = (await request.json()) as { ids?: string[]; all?: true };
      reads.push(body);
      rows = rows.map((r) =>
        body.all || body.ids?.includes(r.id) ? { ...r, readAt: new Date().toISOString() } : r,
      );
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('*/api/v1/me/preferences', () =>
      HttpResponse.json({ data: { email_mode: 'digest', digest_time: '08:00' }, meta: {} }),
    ),
  );
  return reads;
}

beforeEach(() => {
  resetClientForTests();
});

describe('NotificationsPage', () => {
  it('lists the entries by day with their unread mark and marks one read', async () => {
    refreshAs(VOLUNTEER);
    const user = userEvent.setup();
    const reads = inbox([
      entry({ id: 'a', count: 3 }),
      entry({
        id: 'b',
        title: 'Registration approved',
        link: null,
        readAt: '2026-10-10T05:00:00.000Z',
        createdAt: '2026-10-10T05:00:00.000Z',
      }),
    ]);
    const { container } = renderApp(<NotificationsPage />, 'en');
    expect(await screen.findByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeVisible();
    expect(screen.getByText('3 times')).toBeVisible();
    expect(screen.getByText('Unread: 1')).toBeVisible();
    // a read entry with no record has neither button
    const old = screen.getByRole('heading', { name: 'Registration approved' }).closest('li')!;
    expect(within(old).queryByRole('button')).toBeNull();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(reads).toEqual([{ ids: ['a'] }]));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull());
  });

  it('marks everything read at once and opens an entry’s record', async () => {
    refreshAs(VOLUNTEER);
    const user = userEvent.setup();
    const reads = inbox([entry({ id: 'a' }), entry({ id: 'b', title: 'Team member added' })]);
    const { router } = renderApp(<NotificationsPage />, 'en');
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(reads).toEqual([{ all: true }]));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull(),
    );

    await user.click(screen.getAllByRole('button', { name: 'Open' })[0]!);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/my-projects/0190a1b2-0000-7000-8000-0000000000aa',
      ),
    );
  });

  it('shows the empty state, and no email setting for a volunteer', async () => {
    refreshAs(VOLUNTEER);
    inbox([]);
    renderApp(<NotificationsPage />, 'bn');
    expect(await screen.findByText('কোনো নোটিফিকেশন নেই')).toBeVisible();
    expect(
      screen.queryByRole('radiogroup', { name: 'যে বিষয় অপেক্ষা করতে পারে তার ইমেইল' }),
    ).toBeNull();
  });

  it('lets an official choose the daily summary for emails that can wait', async () => {
    refreshAs(ME);
    const user = userEvent.setup();
    inbox([]);
    const saved: unknown[] = [];
    server.use(
      http.get('*/api/v1/me/preferences', () =>
        HttpResponse.json({ data: { email_mode: 'immediate', digest_time: '08:00' }, meta: {} }),
      ),
      http.patch('*/api/v1/me/preferences', async ({ request }) => {
        const body = await request.json();
        saved.push(body);
        return HttpResponse.json({
          data: { email_mode: 'digest', digest_time: '08:00' },
          meta: {},
        });
      }),
    );
    renderApp(<NotificationsPage />, 'bn');
    const group = await screen.findByRole('radiogroup', {
      name: 'যে বিষয় অপেক্ষা করতে পারে তার ইমেইল',
    });
    await user.click(within(group).getByRole('radio', { name: 'দৈনিক সংক্ষিপ্তসার' }));
    await waitFor(() => expect(saved).toEqual([{ email_mode: 'digest' }]));
    expect(await screen.findByRole('status')).toHaveTextContent('সংরক্ষিত হয়েছে।');
  });
});
