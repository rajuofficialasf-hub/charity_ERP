import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { fromProfileMenu, scan, signIn } from './support/admin';

// An official's own profile (docs/DECISION_LOG.md, the official's own profile and the decision
// that the supervisor is not asked for) against the API on its E2E database: the RPM sees their
// projects with the figures of their work, asks for a new designation and photo, the Department
// Head decides in the officials' requests tab, and the staff list and the RPM's own chip then ask
// for the new photo. The E2E run processes no uploads, so the photo stays unscanned and the API
// answers it with 423; the component tests show the image once the API serves it. The projects
// share the database, so each signs in with its own RPM; every repeat asks for another
// designation.
const RPM = { desktop: 'rpm.dhaka@example.org', mobile: 'rpm.rangpur@example.org' } as const;
const HEAD = 'head@example.org';

/** A tiny valid PNG (1 x 1 pixel) as the new photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wide).toBeLessThanOrEqual(0);
}

test.describe("an official's own profile", () => {
  test('shows the projects with the figures, sends a change, and the Head approves it', async ({
    page,
    browser,
  }, info) => {
    const project = info.project.name === 'mobile' ? 'mobile' : 'desktop';
    const designation = `আঞ্চলিক ব্যবস্থাপক ${randomUUID().slice(0, 8)}`;
    await signIn(page, RPM[project]);
    await fromProfileMenu(page, 'আমার প্রোফাইল');
    await expect(page.getByRole('heading', { level: 1, name: 'আমার প্রোফাইল' })).toBeVisible();
    const name = (await page.getByRole('heading', { level: 2 }).first().textContent())!.trim();
    const nav = page.getByRole('navigation', { name: 'প্রোফাইলের অংশ' });
    await expect(nav.getByRole('button', { name: 'পরিচয় ও কর্মস্থল' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect((await scan(page)).violations).toEqual([]);

    // my projects: by year, each with the figures of the area and of the own decisions
    await nav.getByRole('button', { name: 'আমার প্রকল্প' }).click();
    await expect(page.getByRole('heading', { level: 3, name: /সাল$/ }).first()).toBeVisible();
    const card = page.getByRole('article').first();
    await expect(card.getByText('এলাকার আবেদন')).toBeVisible();
    await expect(card.getByText('আপনার সিদ্ধান্ত')).toBeVisible();
    await noSidewaysScroll(page);
    expect((await scan(page)).violations).toEqual([]);

    // ask for a new designation and a new photo from the edit mode
    await nav.getByRole('button', { name: 'পরিচয় ও কর্মস্থল' }).click();
    await page.getByRole('button', { name: 'পরিচয় ও কর্মস্থল সম্পাদনা' }).click();
    const form = page.getByRole('form', { name: 'পরিচয় ও কর্মস্থল পরিবর্তনের অনুরোধ' });
    await form.getByText('পদবি বদলাতে চাই').click();
    await form.getByRole('textbox', { name: /^পদবি/ }).fill(designation);
    await form.getByText('ছবি বদলাতে চাই').click();
    await form.getByRole('button', { name: 'অনুরোধ পাঠান' }).click();
    await expect(
      page.getByText('অনুরোধ পাঠানো হয়েছে। ডিপার্টমেন্ট প্রধান বা মনিটরিং টিম সিদ্ধান্ত দেবেন।'),
    ).toBeVisible();
    // the photo request waits for its upload beside the photo
    const uploaded = page.waitForResponse(
      (r) => r.url().includes('/me/photos/photo?') && r.status() === 201,
    );
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('group', { name: /^ছবি/ })
      .getByRole('button', { name: 'গ্যালারি থেকে নিন' })
      .click();
    await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    const { fileId } = ((await (await uploaded).json()) as { data: { fileId: string } }).data;
    const photoUrl = new RegExp(`/api/v1/files/${fileId}/content`);
    // the unscanned photo is asked for and answered 423 (see the note at the top)
    const photoAsked = (p: Page) =>
      p.waitForResponse(
        (r) => photoUrl.test(r.url()) && r.request().method() === 'GET' && r.status() === 423,
      );
    await noSidewaysScroll(page);

    // the Department Head decides both in the officials' requests tab
    const headContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      baseURL: info.project.use.baseURL,
    });
    try {
      const head = await headContext.newPage();
      await signIn(head, HEAD);
      await head.goto('/admin/registrations?tab=staff-edits');
      const table = head.getByRole('grid', { name: 'অফিসিয়ালের অনুরোধ' });
      for (const field of ['পদবি', 'ছবি']) {
        const approve = table.getByRole('button', { name: `${name}-এর ${field} অনুমোদন` });
        await approve.click();
        await expect(head.getByText('নতুন মান প্রয়োগ হয়েছে')).toBeVisible();
        await expect(approve).toHaveCount(0);
      }
      // the staff list asks for the photo beside the name
      const listPhoto = photoAsked(head);
      await head.goto('/admin/staff');
      await expect(head.getByRole('row').filter({ hasText: name })).toBeVisible();
      await listPhoto;
    } finally {
      await headContext.close();
    }

    // the RPM sees the new designation, and their chip asks for the photo
    const chipPhoto = photoAsked(page);
    await page.reload();
    await expect(page.getByText(designation).first()).toBeVisible();
    await chipPhoto;
  });
});
