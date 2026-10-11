import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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

  test('serves the service worker script', async ({ request }) => {
    const res = await request.get('/serwist/sw.js');
    expect(res.ok()).toBe(true);
    expect(res.headers()['service-worker-allowed']).toBe('/');
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
