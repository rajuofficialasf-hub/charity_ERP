import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, pair, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { login, resetClientForTests } from '../../lib/api';
import { AppShell } from './AppShell';

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
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: px >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const renderShell = (path = '/', locale: 'bn' | 'en' = 'bn') =>
  renderApp(<AppShell />, locale, {
    path: '/',
    initialPath: path,
    children: [
      { index: true, element: <h1>হোম পাতা</h1> },
      { path: 'admin/audit', element: <h1>অডিট পাতা</h1> },
      { path: 'my-projects', element: <h1>প্রকল্প পাতা</h1> },
      { path: 'account/profile', element: <h1>প্রোফাইল পাতা</h1> },
    ],
  });

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
    // the app bar: the logo with the system name, the bell, the language and the profile menu
    const bar = screen.getByRole('banner');
    expect(within(bar).getByRole('link', { name: /চ্যারিটি ও সোশ্যাল সার্ভিস/ })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(bar).getByRole('img', { name: 'আস-সুন্নাহ ফাউন্ডেশন' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'নোটিফিকেশন' })).toBeInTheDocument();
    expect(within(bar).getByRole('radiogroup', { name: 'ভাষা' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'প্রোফাইল মেনু' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'আরও' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
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
    expect(await screen.findByRole('status')).toHaveTextContent(/অফলাইন/);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.queryByText(/অফলাইন/)).toBeNull());
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
