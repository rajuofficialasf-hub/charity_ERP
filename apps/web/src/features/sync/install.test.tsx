import type { Me } from '@css/shared/auth';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderInShell } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { MyWorkPage } from '../home/MyWorkPage';
import { type InstallPromptEvent, resetInstallForTests, watchInstall } from './install';

// The install hint on the volunteer's home: the browser's prompt on Android, the share-sheet
// steps on an iPhone, put away and brought back from the profile menu. Test data only.
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const userAgent = (value: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);

/** The browser offers its install prompt, as Chrome on Android does soon after the load. */
function offerPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  window.dispatchEvent(event);
  return prompt;
}

const openHome = () => {
  refreshAs(VOLUNTEER);
  return renderInShell([{ index: true, element: <MyWorkPage /> }], '/');
};

beforeEach(() => {
  resetClientForTests();
  resetInstallForTests();
  server.use(
    http.get('*/api/v1/me/projects', () =>
      HttpResponse.json({ data: [], meta: { requestId: 'test' } }),
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  resetInstallForTests();
});

describe('the install hint', () => {
  it('offers the browser’s install button once the prompt arrives, and goes once accepted', async () => {
    userAgent(ANDROID);
    watchInstall();
    const user = userEvent.setup();
    openHome();
    await screen.findByRole('heading', { level: 1, name: 'আমার কাজ' });
    expect(screen.queryByText('অ্যাপটি ফোনে ইনস্টল করুন')).toBeNull();
    const prompt = offerPrompt('accepted');
    const hint = (await screen.findByText('অ্যাপটি ফোনে ইনস্টল করুন')).closest('.ui-alert')!;
    expect(hint).toHaveTextContent('ইনস্টল করলে নেট ছাড়াও অ্যাপ খুলবে');
    await user.click(within(hint as HTMLElement).getByRole('button', { name: 'ইনস্টল করুন' }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText('অ্যাপটি ফোনে ইনস্টল করুন')).toBeNull());
  });

  it('shows an iPhone the share-sheet steps; put away, the profile menu brings it back', async () => {
    userAgent(IPHONE);
    const user = userEvent.setup();
    openHome();
    const hint = (await screen.findByText('অ্যাপটি ফোনে ইনস্টল করুন')).closest('.ui-alert')!;
    expect(hint).toHaveTextContent(/Add to Home Screen/);
    expect(within(hint as HTMLElement).queryByRole('button', { name: 'ইনস্টল করুন' })).toBeNull();
    await user.click(within(hint as HTMLElement).getByRole('button', { name: 'সরিয়ে দিন' }));
    await waitFor(() => expect(screen.queryByText('অ্যাপটি ফোনে ইনস্টল করুন')).toBeNull());
    expect(window.localStorage.getItem('css_install_dismissed')).toBe('1');
    await user.click(screen.getByRole('button', { name: 'প্রোফাইল মেনু' }));
    await user.click(screen.getByRole('menuitem', { name: 'অ্যাপ ইনস্টল করুন' }));
    expect(await screen.findByText('অ্যাপটি ফোনে ইনস্টল করুন')).toBeInTheDocument();
    expect(window.localStorage.getItem('css_install_dismissed')).toBeNull();
  });

  it('shows nothing where the app cannot be installed from the page', async () => {
    userAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/130.0');
    const user = userEvent.setup();
    openHome();
    await screen.findByRole('heading', { level: 1, name: 'আমার কাজ' });
    expect(screen.queryByText('অ্যাপটি ফোনে ইনস্টল করুন')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'প্রোফাইল মেনু' }));
    expect(screen.queryByRole('menuitem', { name: 'অ্যাপ ইনস্টল করুন' })).toBeNull();
  });
});
