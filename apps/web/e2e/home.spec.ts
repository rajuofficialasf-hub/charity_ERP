import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isPhone, scan, signIn } from './support/admin';

test.describe('home page', () => {
  test('sends a visitor to the login screen with the system name and the PWA manifest', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page).toHaveTitle('লগইন করুন');
    await expect(
      page.getByRole('heading', { level: 1, name: 'চ্যারিটি ও সোশ্যাল সার্ভিস' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
  });

  test('serves a manifest with the approved names (UX-09, O-31)', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: 'চ্যারিটি ও সোশ্যাল সার্ভিস',
      short_name: 'ASF Charity',
      display: 'standalone',
      start_url: '/',
    });
  });

  test('serves the install icons the phones read (192 and 512 px PNG, a maskable one, the Apple icon)', async ({
    request,
  }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    const icons = manifest.icons as { src: string; sizes: string; type: string; purpose: string }[];
    expect(icons).toEqual(
      expect.arrayContaining([
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ]),
    );
    for (const src of [...icons.map((i) => i.src), '/icons/apple-touch-icon.png']) {
      const res = await request.get(src);
      expect(res.ok(), src).toBe(true);
      expect(res.headers()['content-type'], src).toMatch(/image\/(png|svg\+xml)/);
    }
  });

  test('serves the service worker script at the root scope', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('javascript');
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    // the login page is a lazy chunk: axe waits for it, not for the loading state
    await expect(page.getByRole('heading', { level: 2, name: 'লগইন করুন' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

// The My Work home of each demo role (docs/testing/DEMO_ACCOUNTS.md), on a phone and a desktop:
// "needs your attention" first, then the widgets of the role. The accounts are only read here.
const HOMES: { role: string; loginId: string; widgets: string[]; volunteer?: boolean }[] = [
  {
    role: 'a General Volunteer',
    loginId: '01700000101',
    widgets: ['আমার প্রকল্প', 'আমার আবেদন'],
    volunteer: true,
  },
  {
    role: 'a Team Member',
    loginId: '01700000119',
    widgets: ['আমার প্রকল্প', 'আমার আবেদন'],
    volunteer: true,
  },
  {
    role: 'a Local দায়ী',
    loginId: '01700000118',
    widgets: ['আমার প্রকল্প', 'আজকের ক্লাস'],
    volunteer: true,
  },
  {
    role: 'a Paid Volunteer',
    loginId: '01700000120',
    widgets: ['আমার প্রকল্প', 'আজকের কাজ'],
    volunteer: true,
  },
  {
    role: 'the Official দায়ী',
    loginId: 'daee@example.org',
    widgets: ['লোকাল দায়ীদের খোঁজখবর', 'পরীক্ষার সূচি'],
  },
  {
    role: 'an RPM',
    loginId: 'rpm.dhaka@example.org',
    widgets: ['আমার প্রকল্প', 'পর্যালোচনার তালিকা'],
  },
  {
    role: 'a PM',
    loginId: 'pm.hum@example.org',
    widgets: ['প্রকল্পের অবস্থা', 'টেমপ্লেট', 'প্রোগ্রাম ড্যাশবোর্ড'],
  },
  {
    role: 'the Department Head',
    loginId: 'head@example.org',
    widgets: ['শর্টকাট', 'কাজের অগ্রগতি', 'মনিটরিং সতর্কতা'],
  },
  // one reader of the other officials' homes; which accounts each spec signs in with is in DEMO_ACCOUNTS.md
  { role: 'the Media Team', loginId: 'media@example.org', widgets: ['মিডিয়ার কাজের তালিকা'] },
];

test.describe('My Work home per role', () => {
  for (const home of HOMES)
    test(`${home.role} opens their own home`, async ({ page }, info) => {
      await signIn(page, home.loginId);
      await expect(page).toHaveURL(/\/$/);
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 2, name: 'এখন আপনার কাজ' })).toBeVisible();
      for (const widget of home.widgets)
        await expect(main.getByRole('heading', { level: 2, name: widget })).toBeVisible();
      // volunteers never see ratings or categories
      if (home.volunteer) await expect(main).not.toContainText(/রেটিং|ক্যাটাগরি/);
      // wait for the widgets to load before the scan
      await page.waitForLoadState('networkidle');
      if (isPhone(info))
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      expect((await scan(page)).violations).toEqual([]);
    });
});
