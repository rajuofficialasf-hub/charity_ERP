import { expect, test } from '@playwright/test';
import { signIn } from './support/admin';

// Light and dark (docs/architecture/ADR/ADR-016-asf-ui-system.md): the app follows the device until
// the person picks a mode, and the choice stays on the device. The Department Head only reads, so
// both projects may share the account.
test.describe('light and dark', () => {
  test('follows the device, turns dark on a tap, and keeps the choice after a reload', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await signIn(page, 'head@example.org');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-color-scheme', 'light');

    await page.getByRole('button', { name: 'অন্ধকার মোডে যান' }).click();
    await expect(html).toHaveAttribute('data-color-scheme', 'dark');
    // the page itself is dark, not only the switch
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toBe('rgb(20, 26, 33)');
    // the app's soft backgrounds resolve to a colour on the asf palette, not to nothing
    const tints = await page.evaluate(() =>
      ['--color-bg-muted', '--color-bg-subtle', '--color-bg-brand-soft'].map((name) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
      ),
    );
    for (const tint of tints) expect(tint).toMatch(/^rgba\(\d+ \d+ \d+ \/ 0?\.\d+\)$/);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
    await expect(html).toHaveAttribute('data-color-scheme', 'dark');

    await page.getByRole('button', { name: 'আলো মোডে যান' }).click();
    await expect(html).toHaveAttribute('data-color-scheme', 'light');
  });

  test('takes the device dark mode until the person picks', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, 'head@example.org');
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
    await expect(page.getByRole('button', { name: 'আলো মোডে যান' })).toBeVisible();
  });

  test('paints a dark device dark before the app has started', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    // the app's scripts never arrive, so only the page, its styles and the mode script run
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(canvas).toBe('rgb(20, 26, 33)');
  });
});
