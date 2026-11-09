import { expect, test } from '@playwright/test';
import { fromProfileMenu, isPhone, mainMenu, scan, signIn } from './support/admin';

// The app shell against the API on its E2E database: the navigation of each width, the profile
// menu and the offline banner. Read-only accounts of the demo seed (docs/testing/DEMO_ACCOUNTS.md),
// so the spec runs beside the others.
const VOLUNTEER = '01700000116';

test.describe('app shell', () => {
  test('a volunteer on a phone has the bottom tabs and opens My projects from them', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'the bottom tabs are for phones');
    await signIn(page, VOLUNTEER);
    const tabs = mainMenu(page);
    await expect(tabs.getByRole('link')).toHaveText([
      'হোম',
      'আমার প্রকল্প',
      'আমার আবেদন',
      'নোটিফিকেশন',
    ]);
    await expect(tabs.getByRole('button', { name: 'আরও' })).toBeVisible();
    await tabs.getByRole('link', { name: 'আমার প্রকল্প' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার প্রকল্প' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'আমার প্রকল্প' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Department Head on a desktop opens the audit log from the sidebar', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'the sidebar is for desktops');
    await signIn(page, 'head@example.org');
    await mainMenu(page).getByRole('link', { name: 'অডিট লগ' }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.getByRole('heading', { level: 1, name: 'অডিট লগ' })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the profile menu leads to my devices', async ({ page }) => {
    await signIn(page, VOLUNTEER);
    await fromProfileMenu(page, 'আমার ডিভাইস');
    await expect(page.getByRole('heading', { level: 1, name: 'আমার ডিভাইস' })).toBeVisible();
  });

  test('the installed app opens offline from its own cache, with the fonts and the banner', async ({
    page,
    context,
  }, info) => {
    test.skip(!isPhone(info), 'the offline open is for the phones');
    const snapshot = page.waitForResponse((r) => r.url().includes('/api/v1/sync/snapshot'), {
      timeout: 30_000,
    });
    await signIn(page, VOLUNTEER);
    // the phone has its data set, and the worker has precached the shell and the fonts
    await snapshot;
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/আপনি অফলাইনে আছেন/)).toBeVisible();
      expect(
        // each font with a letter it draws: Latin from Public Sans, Bengali from Noto Sans Bengali
        await page.evaluate(async () => {
          await document.fonts.ready;
          return (
            document.fonts.check('16px "Public Sans Variable"', 'A') &&
            document.fonts.check('16px "Noto Sans Bengali Variable"', 'আ')
          );
        }),
      ).toBe(true);
    } finally {
      await context.setOffline(false);
    }
  });

  test('an official’s installed app opens offline to the home and the banner, and its data says it needs the connection', async ({
    page,
    context,
  }, info) => {
    test.skip(!isPhone(info), 'the offline open is for the phones');
    await signIn(page, 'head@example.org');
    await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible({
        timeout: 15_000,
      });
      // the banner by its landmark name: the loading blocks of the home are status regions too
      await expect(page.getByRole('region', { name: 'সংযোগ ও সিঙ্কের অবস্থা' })).toContainText(
        'তালিকা, পর্যালোচনা ও অনুমোদনের জন্য নেট লাগবে',
      );
      // the home's own data could not be read: it says why, not "something went wrong"
      await expect(
        page.getByRole('main').getByText('নেট নেই। এই তথ্য দেখতে সংযোগ লাগবে।').first(),
      ).toBeVisible();
      // nothing of the office's work is on the device: the store holds the keys and the profile only
      expect(
        await page.evaluate(async () => {
          const open = indexedDB.open('css-offline');
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
          });
          const names = Array.from(db.objectStoreNames);
          const counts: Record<string, number> = {};
          await Promise.all(
            names.map(
              (name) =>
                new Promise<void>((resolve) => {
                  const req = db.transaction(name).objectStore(name).count();
                  req.onsuccess = () => {
                    counts[name] = req.result;
                    resolve();
                  };
                }),
            ),
          );
          db.close();
          return counts;
        }),
      ).toMatchObject({ outbox: 0, applications: 0 });
    } finally {
      await context.setOffline(false);
    }
  });

  test('the offline banner shows while the browser has no connection', async ({
    page,
    context,
  }) => {
    await signIn(page, VOLUNTEER);
    await context.setOffline(true);
    await expect(page.getByText(/আপনি অফলাইনে আছেন/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/আপনি অফলাইনে আছেন/)).toBeHidden();
  });
});
