import { type APIRequestContext, expect, test } from '@playwright/test';
import { isPhone, PASSWORD, scan, signIn } from './support/admin';

// Notifications in the browser (docs/architecture/NOTIFICATIONS.md): a permission change reaches
// its official's inbox with an unread badge that "mark all read" clears; the template preview shows
// both languages; the delivery page opens for the global roles. Mobile and desktop share the
// database, so each project uses its own official.
const TARGET = { desktop: 'procurement@example.org', mobile: 'media@example.org' } as const;

/** The Department Head through the API, for the permission change and its end. */
async function asHead(request: APIRequestContext) {
  const login = await request.post('/api/v1/auth/login', {
    data: {
      loginId: 'head@example.org',
      password: PASSWORD,
      device: { name: 'E2E notifications', platform: 'desktop', appVersion: 'e2e' },
    },
  });
  expect(login.ok()).toBe(true);
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  return {
    async userId(q: string) {
      const res = await request.get(`/api/v1/users?q=${encodeURIComponent(q)}`, { headers });
      expect(res.ok()).toBe(true);
      return ((await res.json()) as { data: { id: string }[] }).data[0]!.id;
    },
    async grant(userId: string) {
      const res = await request.post('/api/v1/permission-grants', {
        headers,
        data: {
          userId,
          permissions: ['permission.view'],
          effect: 'grant',
          // the own records: a grant for the whole country would ask the demo account for a new
          // password, and the other specs sign it in with the demo one
          scopeType: 'SELF',
          reason: 'E2E: notification check',
        },
      });
      expect(res.status()).toBe(201);
      return ((await res.json()) as { data: { id: string }[] }).data[0]!.id;
    },
    async end(grantId: string) {
      await request.post(`/api/v1/permission-grants/${grantId}/revoke`, {
        headers,
        data: { reason: 'E2E: notification check done' },
      });
    },
  };
}

test.describe('notifications', () => {
  test('a permission change reaches the inbox, and marking all read clears the badge', async ({
    page,
    request,
  }, info) => {
    const login = isPhone(info) ? TARGET.mobile : TARGET.desktop;
    const head = await asHead(request);
    const grantId = await head.grant(await head.userId(login));
    try {
      await signIn(page, login);
      const bell = page
        .getByRole('banner')
        .getByRole('link', { name: /^নোটিফিকেশন, \d+টি না-পড়া$/ });
      await expect(bell).toBeVisible();
      await bell.click();
      await expect(page.getByRole('heading', { level: 1, name: 'নোটিফিকেশন' })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'আপনার অনুমতি পরিবর্তিত হয়েছে' }).first(),
      ).toBeVisible();
      await expect(
        page.getByText('অনুমতি দেওয়া হয়েছে: কার কী পারমিশন আছে দেখা').first(),
      ).toBeVisible();
      expect((await scan(page)).violations).toEqual([]);
      await page.getByRole('button', { name: 'সবগুলো পড়া হয়েছে' }).click();
      await expect(page.getByRole('button', { name: 'সবগুলো পড়া হয়েছে' })).toHaveCount(0);
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'নোটিফিকেশন', exact: true }),
      ).toBeVisible();
    } finally {
      await head.end(grantId);
    }
  });

  test('the template preview shows both languages, and the delivery page opens', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'a management screen on a desktop');
    await signIn(page, 'head@example.org');
    await page.goto('/admin/notification-templates');
    await expect(page.getByRole('heading', { level: 1, name: 'নোটিফিকেশনের লেখা' })).toBeVisible();
    await page.getByRole('button', { name: 'registration_approved বদলান' }).click();
    const dialog = page.getByRole('dialog', { name: 'registration_approved বদলান' });
    await dialog.getByRole('button', { name: 'প্রিভিউ' }).click();
    const preview = dialog.getByRole('region', { name: 'নমুনা মান দিয়ে প্রিভিউ' });
    await expect(preview.getByText('নিবন্ধন অনুমোদিত', { exact: true })).toBeVisible();
    await expect(preview.getByText('Registration approved', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.goto('/admin/deliveries');
    await expect(
      page.getByRole('heading', { level: 1, name: 'বার্তা পাঠানোর অবস্থা' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'পাঠানো যায়নি', pressed: false })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
});
