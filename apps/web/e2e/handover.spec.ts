import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { openTab } from './support/admin';

// The staff handover (BD-08, BR-034; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U14): the Department
// Head cannot deactivate the dedicated demo official while work is pending, hands all of it to the
// Dhaka RPM, completes the handover and deactivates the account. The E2E database is shared by
// the repeats of a run, so the spec gives the work back and reactivates the official at the end
// (through the API, as the Department Head). Repeats need one worker (`--repeat-each 3 --workers
// 1`): parallel copies would share the one official and the Department Head's five sessions.
const PASSWORD = 'CssDemo2026';
const OFFICIAL = 'handover.rpm@example.org';
/** Either refusal of a deactivation with pending work (the first run, or after a repeat). */
const REFUSED =
  /অ্যাকাউন্ট বন্ধের আগে ব্যবহারকারীর অপেক্ষমাণ কাজ হস্তান্তর করুন।|কিছু অপেক্ষমাণ কাজ এখনও হস্তান্তর করা হয়নি।/;

const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

/** Picks a user in a search combobox by typing a part of the email. */
async function pickUser(page: Page, label: RegExp, text: string, option: RegExp) {
  await page.getByRole('combobox', { name: label }).fill(text);
  await page.getByRole('option', { name: option }).click();
}

/** A small API client as the Department Head, for the set-up facts and the restore. */
async function asHead(request: APIRequestContext) {
  const login = await request.post('/api/v1/auth/login', {
    data: {
      loginId: 'head@example.org',
      password: PASSWORD,
      device: { name: 'E2E', platform: 'desktop', appVersion: 'e2e' },
    },
  });
  expect(login.ok()).toBe(true);
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  const call = async <T>(method: 'GET' | 'POST', path: string, data?: unknown, extra = {}) => {
    const res = await request.fetch(`/api/v1${path}`, {
      method,
      headers: { ...headers, ...extra },
      ...(data === undefined ? {} : { data }),
    });
    expect(res.ok(), `${method} ${path}: ${res.status()}`).toBe(true);
    return (await res.json()) as { data: T; meta: { etag?: string } };
  };
  const userId = async (q: string) =>
    (await call<{ id: string }[]>('GET', `/users?q=${encodeURIComponent(q)}`)).data[0]!.id;
  return { call, userId };
}

type Pending = { itemType: string; itemId: string }[];

test.describe('staff handover', () => {
  test('deactivation waits for the handover of all pending work', async ({
    page,
    request,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'a management screen on a desktop');
    const head = await asHead(request);
    const officialId = await head.userId(OFFICIAL);
    const receiverId = await head.userId('rpm.dhaka@example.org');
    const before = (await head.call<{ pending: Pending }>('GET', `/users/${officialId}/handover`))
      .data.pending;
    expect(before.length).toBeGreaterThan(0);

    try {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'লগইন', exact: true })).toBeEnabled();
      await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill('head@example.org');
      await page
        .getByLabel(/^পাসওয়ার্ড/)
        .first()
        .fill(PASSWORD);
      await page.getByRole('button', { name: 'লগইন', exact: true }).click();
      await openTab(page, 'হ্যান্ডওভার');
      await pickUser(page, /কর্মকর্তা খুঁজুন/, 'handover.rpm', /আরপিএম হ্যান্ডওভার \(নমুনা\)/);
      await expect(
        page.getByRole('region', { name: 'প্রজেক্ট' }).getByRole('listitem'),
      ).toHaveCount(before.length);
      expect((await scan(page)).violations).toEqual([]);

      // refused while work is pending
      await page.getByRole('button', { name: 'নিষ্ক্রিয় করুন' }).click();
      let dialog = page.getByRole('alertdialog');
      await dialog.getByRole('textbox', { name: /কারণ/ }).fill('চাকরি ছেড়েছেন (নমুনা)');
      await dialog.getByRole('button', { name: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন' }).click();
      await expect(dialog.getByText(REFUSED)).toBeVisible();
      await dialog.getByRole('button', { name: 'বাতিল' }).click();

      await pickUser(page, /যাঁকে দেবেন/, 'rpm.dhaka', /আরপিএম ঢাকা \(নমুনা\)/);
      await page.getByRole('button', { name: 'সব হস্তান্তর করুন' }).click();
      await expect(page.getByText('কাজ হস্তান্তর করা হয়েছে')).toBeVisible();
      await page.getByRole('button', { name: 'হ্যান্ডওভার শেষ করুন' }).click();
      await expect(page.getByText('হ্যান্ডওভার শেষ হয়েছে', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'নিষ্ক্রিয় করুন' }).click();
      dialog = page.getByRole('alertdialog');
      await dialog.getByRole('textbox', { name: /কারণ/ }).fill('চাকরি ছেড়েছেন (নমুনা)');
      await dialog.getByRole('button', { name: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন' }).click();
      await expect(page.getByText('অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে')).toBeVisible();
      await expect(page.getByText('এই অ্যাকাউন্ট নিষ্ক্রিয়।')).toBeVisible();
    } finally {
      // give the work back and reactivate the official for the next repeat of this run
      const user = await head.call<{ state: string }>('GET', `/users/${officialId}`);
      if (user.data.state === 'deactivated')
        await head.call(
          'POST',
          `/users/${officialId}/state`,
          { state: 'active', reason: 'E2E: next repeat' },
          { 'If-Match': user.meta.etag },
        );
      const moved = (
        await head.call<{ pending: Pending }>('GET', `/users/${receiverId}/handover`)
      ).data.pending.filter((p) => before.some((b) => b.itemId === p.itemId));
      if (moved.length > 0)
        await head.call('POST', `/users/${receiverId}/handover`, {
          toUserId: officialId,
          items: moved.map((p) => ({ itemType: p.itemType, itemId: p.itemId })),
        });
    }
  });
});
