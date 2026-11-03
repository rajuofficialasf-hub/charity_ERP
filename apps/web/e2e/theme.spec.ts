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
});
