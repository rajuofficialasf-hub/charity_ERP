import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderInShell, TEST_SESSION_ID } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { afterSignIn } from '../../offline/keys';
import { apply, applyResult, enqueue } from '../../offline/outbox';
import { add as addPhoto } from '../../offline/photo-queue';
import { MyWorkPage } from './MyWorkPage';
import { ROLE_WIDGETS, widgetsFor } from './widgets';

// The My Work home of each role: "needs your attention" first, the widgets of the person's roles,
// and the quiet cards of the widgets that come later. Test data only.
const VOLUNTEER: Me = {
  ...ME,
  kind: 'volunteer',
  displayName: 'স্বেচ্ছাসেবক (নমুনা)',
  roles: ['volunteer_general'],
};
const PROJECT = {
  projectId: '01900000-0000-7000-8000-0000000000c1',
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  status: 'active',
  applyFrom: '2026-11-01',
  applyTo: '2026-12-31',
  perVolunteerLimit: 25,
  dawahEnabled: false,
  via: 'assignment',
  permissionSet: 'application_distribution',
  isPaid: false,
  consentStatus: 'pending',
  rulesVersion: 2,
  applicationsCounted: 18,
  applicationsLeft: 7,
  leadsTeam: true,
};

const ok = (data: unknown, meta: Record<string, unknown> = {}) =>
  HttpResponse.json({ data, meta: { requestId: 'test', ...meta } });
const attentionIs = (items: unknown[]) =>
  server.use(http.get('*/api/v1/me/attention', () => ok(items)));

const openHome = (me: Me, locale: 'bn' | 'en' = 'bn') => {
  refreshAs(me);
  return renderInShell([{ index: true, element: <MyWorkPage /> }], '/', locale);
};

beforeEach(() => {
  resetClientForTests();
});

describe('My Work home', () => {
  it('shows a volunteer what waits, the projects with the deadline and limit, and what comes later', async () => {
    attentionIs([{ kind: 'consent_pending', count: 1, href: '/my-projects' }]);
    server.use(http.get('*/api/v1/me/projects', () => ok([PROJECT])));
    const { container } = openHome(VOLUNTEER);
    expect(
      // the page is named for what it holds, without a greeting
      await screen.findByRole('heading', { level: 1, name: 'আমার কাজ' }),
    ).toBeInTheDocument();
    const attention = screen.getByRole('region', { name: 'এখন আপনার কাজ' });
    expect(
      await within(attention).findByRole('link', {
        name: /1টি প্রকল্পের নিয়মাবলিতে আপনার সম্মতি দরকার/,
      }),
    ).toHaveAttribute('href', '/my-projects');
    expect(await screen.findByRole('link', { name: 'শীতবস্ত্র বিতরণ' })).toHaveAttribute(
      'href',
      `/my-projects/${PROJECT.projectId}`,
    );
    expect(screen.getByText('আবেদনের শেষ দিন: 31-12-2026')).toBeInTheDocument();
    expect(screen.getByText('25টির মধ্যে 18টি আবেদন')).toBeInTheDocument();
    // a main volunteer reaches the team of the project
    expect(screen.getByRole('link', { name: 'শীতবস্ত্র বিতরণ: টিম দেখুন' })).toHaveAttribute(
      'href',
      `/my-projects/${PROJECT.projectId}/team`,
    );
    const later = screen.getByRole('heading', { name: 'আমার আবেদন' }).closest('section');
    expect(later).toHaveTextContent('শিগগিরই আসছে');
    expect(within(later as HTMLElement).queryByRole('button')).toBeNull();
    expect(within(later as HTMLElement).queryByRole('link')).toBeNull();
    // ratings and categories are never shown to volunteers
    expect(document.body).not.toHaveTextContent(/রেটিং|ক্যাটাগরি/);
    await expectNoAxeViolations(container);
  });

  it('lists what this phone holds first: a refused record, photos still to go, and the day-old reminder once', async () => {
    server.use(http.get('*/api/v1/me/projects', () => ok([])));
    await afterSignIn({ sessionId: TEST_SESSION_ID, userId: ME.id, deviceKey: 'k'.repeat(43) });
    const yesterday = new Date(Date.now() - 25 * 60 * 60_000);
    const failed = await enqueue({
      kind: 'application_draft',
      projectId: PROJECT.projectId,
      formVersionId: '01900000-0000-7000-8000-0000000000c2',
      payload: { answers: [] },
      now: yesterday,
    });
    await apply([failed.clientUuid], { type: 'flush', at: yesterday });
    await applyResult(
      { clientUuid: failed.clientUuid, result: 'failed', code: 'sync.deadline_passed' },
      yesterday,
    );
    const waiting = await enqueue({
      kind: 'application_draft',
      projectId: PROJECT.projectId,
      formVersionId: '01900000-0000-7000-8000-0000000000c2',
      payload: { answers: [], second: true },
    });
    await addPhoto({
      clientUuid: waiting.clientUuid,
      slot: 'house_photo',
      blob: new Blob([new Uint8Array(512)], { type: 'image/jpeg' }),
      facts: { name: 'h.jpg', mime: 'image/jpeg', source: 'camera' },
    });
    const first = openHome(VOLUNTEER);
    const attention = await screen.findByRole('region', { name: 'এখন আপনার কাজ' });
    expect(
      await within(attention).findByRole('link', { name: /1টি রেকর্ড পাঠানো যায়নি/ }),
    ).toHaveAttribute('href', '/sync');
    expect(within(attention).getByRole('link', { name: /1টি ছবি এখনো যায়নি/ })).toHaveAttribute(
      'href',
      '/sync',
    );
    const reminder = await screen.findByText('জমা কাজ পাঠানো বাকি');
    expect(reminder.closest('[role="status"]')).toHaveTextContent(
      '2টি রেকর্ড 1 দিন ধরে এই ফোনে অপেক্ষায়',
    );
    expect(screen.getByRole('link', { name: 'সিঙ্ক দেখুন' })).toHaveAttribute('href', '/sync');
    first.unmount();
    // the reminder came today already: the next open of the home does not repeat it
    openHome(VOLUNTEER);
    await screen.findByRole('link', { name: /1টি রেকর্ড পাঠানো যায়নি/ });
    expect(screen.queryByText('জমা কাজ পাঠানো বাকি')).toBeNull();
  });

  it('gives a Local দায়ী today’s class as a card that comes later', async () => {
    server.use(http.get('*/api/v1/me/projects', () => ok([])));
    openHome({ ...VOLUNTEER, roles: ['volunteer_local_daee'] });
    expect(await screen.findByRole('heading', { name: 'আজকের ক্লাস' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'আজকের বিতরণ' })).toBeNull();
  });

  it('shows the Dhaka RPM the registrations waiting, linked to the list', async () => {
    attentionIs([
      { kind: 'registrations_pending', count: 2, href: '/admin/volunteers?state=pending' },
    ]);
    server.use(http.get('*/api/v1/projects', () => ok([])));
    openHome({ ...ME, roles: ['regional_program_manager'] });
    expect(
      await screen.findByRole('link', { name: /2টি স্বেচ্ছাসেবক নিবন্ধন অনুমোদনের অপেক্ষায়/ }),
    ).toHaveAttribute('href', '/admin/volunteers?state=pending');
    expect(await screen.findByText('এখন কোনো চলমান প্রকল্প নেই')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'পর্যালোচনার তালিকা' })).toBeInTheDocument();
  });

  it('shows a PM the projects by state and the templates', async () => {
    server.use(
      http.get('*/api/v1/projects', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        return ok([], { total: status === 'active' ? 4 : 1, nextCursor: null, prevCursor: null });
      }),
      http.get('*/api/v1/templates', () => ok([{ id: 't1' }, { id: 't2' }])),
    );
    openHome({ ...ME, roles: ['program_manager'] });
    const states = await screen.findByRole('heading', { name: 'প্রকল্পের অবস্থা' });
    expect(states).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /4\s*সক্রিয়/ })).toHaveAttribute(
      'href',
      '/admin/projects?status=active',
    );
    expect(await screen.findByText('2টি সক্রিয় টেমপ্লেট')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'টেমপ্লেট দেখুন' })).toHaveAttribute(
      'href',
      '/admin/templates',
    ); // the shortcuts of the global roles are not a PM's
    expect(screen.queryByRole('link', { name: 'পারমিশন প্যানেল' })).toBeNull();
  });

  it('never shows a count it could not read as zero', async () => {
    server.use(
      http.get('*/api/v1/projects', () => apiError(500, 'server.error', 'Something went wrong')),
      http.get('*/api/v1/templates', () => apiError(500, 'server.error', 'Something went wrong')),
    );
    openHome({ ...ME, roles: ['program_manager'] });
    // four state counts and the templates, each with its retry
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /আবার চেষ্টা/ })).toHaveLength(5),
      { timeout: 5000 },
    );
    expect(screen.queryByRole('link', { name: /খসড়া/ })).toBeNull();
    expect(screen.queryByText(/0টি সক্রিয় টেমপ্লেট/)).toBeNull();
  });

  it('gives the Department Head the shortcuts', async () => {
    openHome({ ...ME, roles: ['department_head'] });
    const main = await screen.findByRole('main');
    expect(await within(main).findByRole('link', { name: 'পারমিশন প্যানেল' })).toHaveAttribute(
      'href',
      '/admin/permissions',
    );
    expect(within(main).getByRole('link', { name: 'অডিট লগ' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
    expect(within(main).getByRole('heading', { name: 'কাজের অগ্রগতি' })).toBeInTheDocument();
  });

  it('shows the union of the widgets of several roles, each once', () => {
    const both = widgetsFor({
      roles: ['program_manager', 'regional_program_manager'],
      state: 'active',
    });
    expect(both).toEqual(
      expect.arrayContaining(['official_projects', 'project_states', 'templates']),
    );
    expect(both.filter((w) => w === 'notifications')).toHaveLength(1);
    expect(both.at(-1)).toBe('notifications');
    // every role has a home
    for (const role of Object.keys(ROLE_WIDGETS))
      expect(widgetsFor({ roles: [role], state: 'active' }).length).toBeGreaterThan(0);
  });

  it('opens with the area label, the line of purpose and the day summed up from what waits', async () => {
    attentionIs([
      { kind: 'unread_notifications', count: 2, href: '/notifications' },
      { kind: 'projects_draft', count: 4, href: '/admin/projects?status=draft' },
      { kind: 'handovers_open', count: 2, href: '/admin/handover' },
    ]);
    const { container } = openHome({ ...ME, roles: ['department_head'] });
    expect(await screen.findByText('কাজের কেন্দ্র')).toBeInTheDocument();
    expect(screen.getByText('আপনার কাজ, অনুমোদন ও অগ্রগতি এক জায়গায় দেখুন।')).toBeInTheDocument();
    const today = screen.getByRole('region', { name: 'আজকের সারসংক্ষেপ' });
    // the unread notifications are counted on their own, not among the tasks
    expect(
      await within(today).findByText(/আজ আপনার জন্য 6টি কাজ অপেক্ষা করছে।/),
    ).toBeInTheDocument();
    expect(within(today).getByText('অপেক্ষমাণ কাজ').parentElement).toHaveTextContent('6');
    expect(within(today).getByText('না-পড়া নোটিফিকেশন').parentElement).toHaveTextContent('2');
    await expectNoAxeViolations(container);
  });

  it('says the day is clear when nothing waits', async () => {
    attentionIs([]);
    openHome({ ...ME, roles: ['department_head'] });
    const today = await screen.findByRole('region', { name: 'আজকের সারসংক্ষেপ' });
    expect(
      await within(today).findByText(/আজ আপনার জন্য কোনো কাজ অপেক্ষায় নেই।/),
    ).toBeInTheDocument();
    expect(within(today).getByText('অপেক্ষমাণ কাজ').parentElement).toHaveTextContent('0');
  });

  it('says calmly when nothing waits', async () => {
    openHome({ ...ME, roles: ['finance_team'] });
    expect(await screen.findByText('এখন অপেক্ষায় কিছু নেই')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'বাজেট ও পেমেন্ট' })).toBeInTheDocument();
  });

  it('keeps the other widgets when the attention call fails, and retries it', async () => {
    let failing = true;
    server.use(
      http.get('*/api/v1/me/attention', () =>
        failing ? apiError(500, 'server.error', 'Something went wrong') : ok([]),
      ),
    );
    const user = userEvent.setup();
    openHome({ ...ME, roles: ['finance_team'] });
    const retry = await screen.findByRole('button', { name: /আবার চেষ্টা/ }, { timeout: 5000 });
    expect(screen.getByRole('heading', { name: 'সাম্প্রতিক নোটিফিকেশন' })).toBeInTheDocument();
    failing = false;
    await user.click(retry);
    expect(await screen.findByText('এখন অপেক্ষায় কিছু নেই')).toBeInTheDocument();
  });

  it('shows a pending registrant the notice and the corrections only', async () => {
    attentionIs([{ kind: 'corrections', count: 1, href: '/account/profile' }]);
    openHome({ ...VOLUNTEER, state: 'pending' });
    expect(await screen.findByText(/অনুমোদনের অপেক্ষায়/)).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /নিবন্ধনে 1টি সংশোধন চাওয়া হয়েছে/ }),
    ).toHaveAttribute('href', '/account/profile');
    expect(screen.queryByRole('heading', { name: 'আমার প্রকল্প' })).toBeNull();
  });

  it('reads well in English', async () => {
    attentionIs([
      { kind: 'deadlines_soon', count: 1, href: '/admin/projects?status=active&endingSoon=true' },
    ]);
    server.use(
      http.get('*/api/v1/projects', () => ok([], { total: 0, nextCursor: null, prevCursor: null })),
      http.get('*/api/v1/templates', () => ok([])),
    );
    const { container } = openHome({ ...ME, roles: ['program_manager'] }, 'en');
    expect(
      await screen.findByRole('link', { name: /1 application window ends within 7 days/ }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
