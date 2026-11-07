import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, pair, refreshAs, renderApp, TEST_SESSION_ID } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { login, resetClientForTests } from '../../lib/api';
import { announceUpdate, resetUpdateForTests } from '../../lib/app-update';
import { afterSignIn } from '../../offline/keys';
import { OfflineProvider } from '../../offline/OfflineProvider';
import { enqueue } from '../../offline/outbox';
import type { SyncEngine, SyncStatus } from '../../offline/sync-engine';
import { AppShell } from './AppShell';
import { PageCrumbs } from './breadcrumb';
import { stubMatchMedia } from '../../../test/match-media';

const HEAD: Me = { ...ME, displayName: 'ডিপার্টমেন্ট হেড (নমুনা)', roles: ['department_head'] };
const PM: Me = { ...ME, roles: ['program_manager'] };
const FINANCE: Me = { ...ME, displayName: 'ফাইন্যান্স (নমুনা)', roles: ['finance_team'] };
const VOLUNTEER: Me = {
  ...ME,
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60',
  kind: 'volunteer',
  displayName: 'স্বেচ্ছাসেবক (নমুনা)',
  roles: ['volunteer_general'],
};

/** The screen is this many pixels wide (the shell reads its width class from media queries). */
function atWidth(px: number) {
  stubMatchMedia((query) => {
    if (query.includes('prefers-color-scheme')) return false;
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return (!min || px >= Number(min[1])) && (!max || px <= Number(max[1]));
  });
}

const PAGES = [
  { index: true, element: <h1>হোম পাতা</h1> },
  { path: 'admin/audit', element: <h1>অডিট পাতা</h1> },
  { path: 'my-projects', element: <h1>প্রকল্প পাতা</h1> },
  { path: 'account/profile', element: <h1>প্রোফাইল পাতা</h1> },
  { path: 'sync', element: <h1>সিঙ্ক পাতা</h1> },
  {
    path: 'admin/staff/x',
    element: (
      <>
        <PageCrumbs
          items={[
            { id: 'list', label: 'কর্মীদের তালিকা', href: '/admin/staff' },
            { id: 'profile', label: 'রহিম উদ্দিন' },
          ]}
        />
        <h1>কর্মীর পাতা</h1>
      </>
    ),
  },
];
const renderShell = (path = '/', locale: 'bn' | 'en' = 'bn') =>
  renderApp(<AppShell />, locale, { path: '/', initialPath: path, children: PAGES });

const IDLE: SyncStatus = {
  state: 'idle',
  pending: 0,
  syncing: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
};
/** An engine standing still at the given status, so the shell's reading of it can be checked. */
const engineAt = (status: Partial<SyncStatus>) => {
  const fixed = { ...IDLE, ...status };
  return {
    status: fixed,
    subscribe(listener: (s: SyncStatus) => void) {
      listener(fixed);
      return () => undefined;
    },
    start: () => undefined,
    stop: () => undefined,
    flush: () => Promise.resolve(),
  } as unknown as SyncEngine;
};
const renderShellWith = (engine: SyncEngine, path = '/') =>
  renderApp(
    <OfflineProvider engine={engine}>
      <AppShell />
    </OfflineProvider>,
    'bn',
    { path: '/', initialPath: path, children: PAGES },
  );

const mainMenu = () => screen.findByRole('navigation', { name: 'প্রধান মেনু' });
const linkNames = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((l) => l.textContent);

beforeEach(() => {
  resetClientForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUpdateForTests();
});

describe('app shell', () => {
  it('gives an official on a desktop the sidebar with My Work first and only their destinations', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    const { container } = renderShell();
    const nav = await mainMenu();
    expect(linkNames(nav)[0]).toBe('আমার কাজ');
    expect(within(nav).getByRole('link', { name: 'আমার কাজ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('group', { name: 'প্রশাসন' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'অডিট লগ' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
    // the dark sidebar carries the Foundation's mark and name, a help card and the person
    const sidebar = screen.getByRole('complementary');
    expect(
      within(sidebar).getByRole('link', {
        name: /আস-সুন্নাহ ফাউন্ডেশন.*চ্যারিটি ও সোশ্যাল সার্ভিস/,
      }),
    ).toHaveAttribute('href', '/');
    expect(within(sidebar).getByText('সহায়তা প্রয়োজন?')).toBeInTheDocument();
    expect(within(sidebar).getByText('ডিপার্টমেন্ট হেড (নমুনা)')).toBeInTheDocument();
    // the person is named alone, without a role or kind
    expect(within(sidebar).queryByText('কর্মকর্তা')).toBeNull();
    // the app bar beside it: the bell, the language and the profile menu, no second logo
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('img', { name: 'আস-সুন্নাহ ফাউন্ডেশন' })).toBeNull();
    expect(within(bar).getByRole('link', { name: 'নোটিফিকেশন' })).toBeInTheDocument();
    // an official keeps nothing on the device: no sync chip
    expect(within(bar).queryByRole('link', { name: /সিঙ্কের অবস্থা/ })).toBeNull();
    expect(within(bar).getByRole('group', { name: 'ভাষা' })).toBeInTheDocument();
    // the profile chip: the person's letter and name
    const chip = within(bar).getByRole('button', { name: 'প্রোফাইল মেনু' });
    expect(chip).toHaveTextContent(/ডিপার্টমেন্ট হেড \(নমুনা\)/);
    expect(chip).not.toHaveTextContent(/কর্মকর্তা/);
    expect(screen.queryByRole('button', { name: 'আরও' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows the person's own photo in the profile chip and the sidebar", async () => {
    atWidth(1280);
    const photo = '01900000-0000-7000-8000-0000000000f9';
    server.use(
      http.get(`*/api/v1/files/${photo}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([137, 80, 78, 71]).buffer, {
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );
    refreshAs({ ...HEAD, photoFileId: photo });
    renderShell();
    await mainMenu();
    const chip = within(screen.getByRole('banner')).getByRole('button', { name: 'প্রোফাইল মেনু' });
    await waitFor(() => expect(chip.querySelector('img[src^="data:image/png"]')).not.toBeNull());
    expect(
      screen.getByRole('complementary').querySelector('img[src^="data:image/png"]'),
    ).not.toBeNull();
  });

  it('shows a Program Manager no administration destinations', async () => {
    atWidth(1280);
    refreshAs(PM);
    renderShell();
    const nav = await mainMenu();
    expect(within(nav).getByRole('link', { name: 'প্রকল্প' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'অডিট লগ' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'সেটিংস' })).not.toBeInTheDocument();
  });

  it('marks the page under a destination as current', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    renderShell('/admin/audit');
    const nav = await mainMenu();
    expect(within(nav).getByRole('link', { name: 'অডিট লগ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'আমার কাজ' })).not.toHaveAttribute('aria-current');
  });

  it('counts what waits beside its destination in the sidebar', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    server.use(
      http.get('*/api/v1/me/attention', () =>
        HttpResponse.json({
          data: [
            { kind: 'registrations_pending', count: 3, href: '/admin/volunteers?state=pending' },
            { kind: 'staff_registrations_pending', count: 2, href: '/admin/registrations' },
            { kind: 'edit_requests_pending', count: 1, href: '/admin/registrations?tab=edits' },
          ],
          meta: { requestId: 'test' },
        }),
      ),
    );
    renderShell('/admin/audit');
    const nav = await mainMenu();
    expect(
      await within(nav).findByRole('link', { name: 'স্বেচ্ছাসেবক, 3টি অপেক্ষমাণ' }),
    ).toHaveAttribute('href', '/admin/volunteers');
    expect(within(nav).getByRole('link', { name: 'নিবন্ধন, 3টি অপেক্ষমাণ' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'অডিট লগ' })).toBeInTheDocument();
  });

  it('reads the counts again when the person moves to another page', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    let waiting = 3;
    server.use(
      http.get('*/api/v1/me/attention', () =>
        HttpResponse.json({
          data: waiting
            ? [
                {
                  kind: 'staff_registrations_pending',
                  count: waiting,
                  href: '/admin/registrations',
                },
              ]
            : [],
          meta: { requestId: 'test' },
        }),
      ),
    );
    renderShell('/');
    const nav = await mainMenu();
    expect(await within(nav).findByRole('link', { name: 'নিবন্ধন, 3টি অপেক্ষমাণ' })).toBeVisible();
    // the last registration was decided elsewhere; the next page shows the count without it
    waiting = 0;
    await userEvent.setup().click(within(nav).getByRole('link', { name: 'অডিট লগ' }));
    expect(await within(nav).findByRole('link', { name: 'নিবন্ধন' })).toBeVisible();
  });

  it('names the group and the page in the app bar on a desktop', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    renderShell('/admin/audit');
    await mainMenu();
    const trail = within(screen.getByRole('banner')).getByRole('navigation', { name: 'অবস্থান' });
    expect(trail).toHaveTextContent('প্রশাসন');
    expect(within(trail).getByText('অডিট লগ').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('puts the crumbs of a page in the app bar on a desktop, and keeps them on the page on a phone', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    const { unmount } = renderShell('/admin/staff/x');
    await screen.findByRole('heading', { name: 'কর্মীর পাতা' });
    const bar = screen.getByRole('banner');
    const trail = await within(bar).findByRole('navigation', { name: 'অবস্থান' });
    expect(trail).toHaveTextContent('মানুষ');
    expect(within(trail).getByRole('link', { name: 'কর্মীদের তালিকা' })).toHaveAttribute(
      'href',
      '/admin/staff',
    );
    expect(within(trail).getByText('রহিম উদ্দিন')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('navigation')).toBeNull();
    unmount();

    atWidth(375);
    renderShell('/admin/staff/x');
    await screen.findByRole('heading', { name: 'কর্মীর পাতা' });
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'কর্মীদের তালিকা-এ ফিরে যান' })).toHaveAttribute(
      'href',
      '/admin/staff',
    );
    expect(within(screen.getByRole('banner')).queryByRole('navigation')).toBeNull();
  });

  it('gives a volunteer no sidebar: the rail holds home, my projects, my applications, notifications and more', async () => {
    atWidth(1280);
    refreshAs(VOLUNTEER);
    renderShell();
    const nav = await mainMenu();
    expect(linkNames(nav)).toEqual(['হোম', 'আমার প্রকল্প', 'আমার আবেদন', 'নোটিফিকেশন']);
    expect(within(nav).getByRole('button', { name: 'আরও' })).toBeInTheDocument();
    expect(within(nav).queryByRole('group')).toBeNull();
  });

  it('gives a volunteer on a phone the bottom tabs, and the language inside the profile menu', async () => {
    atWidth(360);
    refreshAs(VOLUNTEER);
    const user = userEvent.setup();
    const { container } = renderShell();
    const nav = await mainMenu();
    expect(linkNames(nav)).toEqual(['হোম', 'আমার প্রকল্প', 'আমার আবেদন', 'নোটিফিকেশন']);
    expect(within(nav).getByRole('button', { name: 'আরও' })).toBeInTheDocument();
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('radiogroup')).toBeNull();
    await user.click(within(bar).getByRole('button', { name: 'প্রোফাইল মেনু' }));
    expect(screen.getByRole('menuitem', { name: 'English' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await expectNoAxeViolations(container);
  });

  it('gives an official on a phone home, people, projects and notifications', async () => {
    atWidth(360);
    refreshAs(PM);
    renderShell();
    const nav = await mainMenu();
    expect(linkNames(nav)).toEqual(['হোম', 'মানুষ', 'প্রকল্প', 'নোটিফিকেশন']);
    expect(within(nav).getByRole('link', { name: 'মানুষ' })).toHaveAttribute(
      'href',
      '/admin/volunteers',
    );
  });

  it('leaves out the tabs an official may not use', async () => {
    atWidth(360);
    refreshAs(FINANCE);
    renderShell();
    const nav = await mainMenu();
    expect(linkNames(nav)).toEqual(['হোম', 'নোটিফিকেশন']);
    expect(within(nav).getByRole('button', { name: 'আরও' })).toBeInTheDocument();
  });

  it('opens the rest under "more"', async () => {
    atWidth(360);
    refreshAs(PM);
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('button', { name: 'আরও' }));
    const sheet = await screen.findByRole('dialog', { name: 'আরও' });
    const names = linkNames(within(sheet).getByRole('navigation', { name: 'আরও' }));
    // what the tabs already open (projects, volunteers) is not repeated
    expect(names).toEqual([
      'প্রোগ্রাম',
      'টেমপ্লেট',
      'মিডিয়ার কাজ',
      'উপকারভোগী',
      'কর্মী',
      'নিসাব',
      'আমার প্রোফাইল',
      'আমার ডিভাইস',
    ]);
  });

  it('closes "more" on the page chosen, and it stays closed when the person comes back', async () => {
    atWidth(360);
    refreshAs(VOLUNTEER);
    const user = userEvent.setup();
    const { router } = renderShell();
    await user.click(await screen.findByRole('button', { name: 'আরও' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'আরও' })).getByRole('link', {
        name: 'আমার প্রোফাইল',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'প্রোফাইল পাতা' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByRole('heading', { name: 'হোম পাতা' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    // the link of the page already shown closes the sheet too
    await act(async () => {
      await router.navigate('/account/profile');
    });
    await user.click(await screen.findByRole('button', { name: 'আরও' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'আরও' })).getByRole('link', {
        name: 'আমার প্রোফাইল',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers the profile, the devices, the password and logout; logout ends the session', async () => {
    atWidth(1280);
    refreshAs(PM);
    let loggedOut = false;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('button', { name: 'প্রোফাইল মেনু' }));
    expect(screen.getByRole('menuitem', { name: 'আমার প্রোফাইল' })).toHaveAttribute(
      'href',
      '/account/profile',
    );
    expect(screen.getByRole('menuitem', { name: 'আমার ডিভাইস' })).toHaveAttribute(
      'href',
      '/account/sessions',
    );
    expect(screen.getByRole('menuitem', { name: 'পাসওয়ার্ড পরিবর্তন' })).toHaveAttribute(
      'href',
      '/account/password',
    );
    await user.click(screen.getByRole('menuitem', { name: 'লগআউট' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/login?ended=logout');
    expect(loggedOut).toBe(true);
  });

  it('never shows the last person’s counts to the next one on the same device', async () => {
    atWidth(1280);
    const other: Me = { ...PM, id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a77', displayName: 'অন্যজন' };
    server.use(
      http.get('*/api/v1/notifications/unread-count', ({ request }) =>
        HttpResponse.json({
          data: { count: request.headers.get('authorization')?.includes('access-b') ? 0 : 7 },
          meta: {},
        }),
      ),
      http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair(other, 'access-b'), meta: {} }),
      ),
    );
    refreshAs(PM);
    const user = userEvent.setup();
    const { router } = renderShell();
    expect(await screen.findByRole('link', { name: /7/ })).toHaveAttribute(
      'href',
      '/notifications',
    );
    await user.click(screen.getByRole('button', { name: 'প্রোফাইল মেনু' }));
    await user.click(screen.getByRole('menuitem', { name: 'লগআউট' }));
    await screen.findByTestId('location');
    await act(async () => {
      await login('b', 'secret 123');
      await router.navigate('/');
    });
    expect(await screen.findByRole('button', { name: 'প্রোফাইল মেনু' })).toHaveTextContent(
      'অন্যজন',
    );
    await waitFor(() => expect(screen.getByRole('banner')).not.toHaveTextContent(/7/));
  });

  it('shows the offline banner while the browser has no connection', async () => {
    atWidth(1280);
    refreshAs(PM);
    renderShell();
    await mainMenu();
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/অফলাইন/);
    // an official keeps no work on the device: the banner says what needs the connection
    expect(status).toHaveTextContent('তালিকা, পর্যালোচনা ও অনুমোদনের জন্য নেট লাগবে');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.queryByText(/অফলাইন/)).toBeNull());
  });

  it('gives a volunteer the sync chip with the counts, opening the sync centre, also under "more"', async () => {
    atWidth(360);
    refreshAs(VOLUNTEER);
    const user = userEvent.setup();
    const { container } = renderShellWith(engineAt({ pending: 2, failed: 1 }));
    const bar = await screen.findByRole('banner');
    const chip = await within(bar).findByRole('link', {
      name: 'সিঙ্কের অবস্থা: 3টি বাকি, 1টি পাঠানো যায়নি',
    });
    expect(chip).toHaveAttribute('href', '/sync');
    expect(within(bar).getByText('3')).toBeInTheDocument();
    // a sync that failed: the banner under the bar leads to the centre too
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('সিঙ্ক হয়নি');
    expect(screen.getByText('3টি সিঙ্কের অপেক্ষায়')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'বিস্তারিত দেখুন' }));
    expect(await screen.findByRole('heading', { name: 'সিঙ্ক পাতা' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'আরও' }));
    const sheet = await screen.findByRole('dialog', { name: 'আরও' });
    expect(within(sheet).getByRole('link', { name: 'সিঙ্ক' })).toHaveAttribute('href', '/sync');
  });

  it('tells a volunteer offline how much waits, then that the connection is back', async () => {
    atWidth(1280);
    refreshAs(VOLUNTEER);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderShellWith(engineAt({ state: 'offline', pending: 2 }));
    await mainMenu();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/অফলাইন/);
    expect(screen.getByText('2টি সিঙ্কের অপেক্ষায়')).toBeInTheDocument();
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByRole('status')).toHaveTextContent('আবার অনলাইনে');
  });

  it('warns a volunteer who logs out with records still on the phone, twice, and sends the count', async () => {
    atWidth(1280);
    refreshAs(VOLUNTEER);
    await afterSignIn({
      sessionId: TEST_SESSION_ID,
      userId: VOLUNTEER.id,
      deviceKey: 'k'.repeat(43),
    });
    for (const n of [1, 2])
      await enqueue({
        kind: 'application_draft',
        projectId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01',
        formVersionId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d01',
        payload: { answers: [], n },
      });
    let body: unknown = null;
    server.use(
      http.post('*/api/v1/auth/logout', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderShellWith(engineAt({ pending: 2 }));
    await user.click(await screen.findByRole('button', { name: 'প্রোফাইল মেনু' }));
    await user.click(screen.getByRole('menuitem', { name: 'লগআউট' }));
    const first = await screen.findByRole('alertdialog', { name: 'না পাঠানো কাজ আছে' });
    expect(first).toHaveTextContent('2টি রেকর্ড এখনো অফিসে পৌঁছায়নি');
    expect(within(first).getByRole('button', { name: 'এখনই সিঙ্ক করুন' })).toBeInTheDocument();
    expect(screen.queryByTestId('location')).toBeNull();
    await user.click(within(first).getByRole('button', { name: 'তবুও লগআউট করুন' }));
    const second = await screen.findByRole('alertdialog', { name: 'সত্যিই লগআউট করবেন?' });
    expect(second).toHaveTextContent('2টি রেকর্ড চিরতরে হারিয়ে যাবে');
    await user.click(within(second).getByRole('button', { name: 'হ্যাঁ, মুছে লগআউট করুন' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/login?ended=logout');
    expect(body).toEqual({ pendingCount: 2 });
  });

  it('offers the reload once a new version waits, and only the tap takes it', async () => {
    atWidth(1280);
    refreshAs(PM);
    const user = userEvent.setup();
    renderShell();
    await mainMenu();
    expect(screen.queryByText('অ্যাপের নতুন সংস্করণ এসেছে।')).toBeNull();
    const reload = vi.fn();
    act(() => announceUpdate(reload));
    expect(await screen.findByText('অ্যাপের নতুন সংস্করণ এসেছে।')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'রিলোড করুন' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('is accessible in English', async () => {
    atWidth(1280);
    refreshAs(HEAD);
    const { container } = renderShell('/', 'en');
    expect(await screen.findByRole('navigation', { name: 'Main menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Work' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
