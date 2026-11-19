import { expect, type Page, test } from '@playwright/test';
import { fromProfileMenu, scan, signIn } from './support/admin';

// The photo viewer (docs/architecture/FILES_AND_DOCUMENTS.md, "Download of a photo", and
// docs/ui/DESIGN_SYSTEM.md, "Photo viewer") against the API on its E2E database: an official
// asks for a new photo, the Department Head opens it large from the officials' requests, reads
// its details, saves it and copies its link; the link opens the photo for the official, and a
// volunteer who may not see it is told so. The projects share the database, so each uses an
// official of its own.
const OFFICIAL = { desktop: 'executive@example.org', mobile: 'daee@example.org' } as const;
const VOLUNTEER = { desktop: '01700000101', mobile: '01700000103' } as const;
const HEAD = 'head@example.org';

/** A tiny valid PNG (1 x 1 pixel) as the new photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const NOT_FOUND = 'ছবিটি পাওয়া যায়নি, অথবা এটি দেখার অনুমতি আপনার নেই।';

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wide).toBeLessThanOrEqual(0);
}

test.use({ actionTimeout: 20_000 });

test('a photo opens large with its details, saves with its name, and its link opens it', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const project = info.project.name === 'mobile' ? 'mobile' : 'desktop';

  // the official asks for a new photo
  await signIn(page, OFFICIAL[project]);
  await fromProfileMenu(page, 'আমার প্রোফাইল');
  await expect(page.getByRole('heading', { level: 1, name: 'আমার প্রোফাইল' })).toBeVisible();
  const name = (await page.getByRole('heading', { level: 2 }).first().textContent())!.trim();
  await page.getByRole('button', { name: 'পরিচয় ও কর্মস্থল সম্পাদনা' }).click();
  const form = page.getByRole('form', { name: 'পরিচয় ও কর্মস্থল পরিবর্তনের অনুরোধ' });
  await form.getByText('ছবি বদলাতে চাই').click();
  await form.getByRole('button', { name: 'অনুরোধ পাঠান' }).click();
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

  // the Department Head opens it large among the officials' requests
  const headContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    baseURL: info.project.use.baseURL,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  try {
    const head = await headContext.newPage();
    await signIn(head, HEAD);
    await head.goto('/admin/registrations?tab=staff-edits');
    const row = head
      .getByRole('table', { name: 'অফিসিয়ালের অনুরোধ' })
      .getByRole('row')
      .filter({ hasText: name });
    // the worker scans the photo a moment after its upload
    await expect(async () => {
      await head.reload();
      await row.getByRole('button', { name: 'নতুন ছবি বড় করে দেখুন' }).click();
      const viewer = head.getByRole('dialog', { name: 'ছবি' });
      await expect(viewer.getByRole('img', { name: 'নতুন ছবি' })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    const viewer = head.getByRole('dialog', { name: 'ছবি' });
    // the details stand beside the photo on a computer
    const details = viewer.getByRole('complementary', { name: 'বিস্তারিত' });
    await expect(details.getByText('তোলার সময়')).toBeVisible();
    await expect(details.getByText('অবস্থান')).toBeVisible();
    await expect(details.getByText('রেজোলিউশন')).toBeVisible();
    const saved = head.waitForEvent('download');
    await viewer.getByRole('button', { name: 'ডাউনলোড' }).click();
    // the app sends a photo as a JPEG, made smaller on the device; one without a capture time
    // is named by its id
    expect((await saved).suggestedFilename()).toBe(`photo-${fileId.slice(0, 8)}.jpg`);
    await viewer.getByRole('button', { name: 'লিংক কপি করুন' }).click();
    await expect(viewer.getByRole('status').filter({ hasText: 'লিংক কপি হয়েছে' })).toHaveCount(1);
    const link = await head.evaluate(() => navigator.clipboard.readText());
    expect(new URL(link).pathname).toBe(`/photos/${fileId}`);
    expect((await scan(head)).violations).toEqual([]);
    await head.keyboard.press('Escape');
    await expect(viewer).toBeHidden();

    // the copied link opens the same photo
    await head.goto(new URL(link).pathname);
    await expect(
      head.getByRole('dialog', { name: 'ছবি' }).getByRole('img', { name: 'ছবি' }),
    ).toBeVisible();
    await head.keyboard.press('Escape');

    // the request is decided, so a repeat starts from a clean list
    await head.goto('/admin/registrations?tab=staff-edits');
    await head
      .getByRole('table', { name: 'অফিসিয়ালের অনুরোধ' })
      .getByRole('button', { name: `${name}-এর ছবি অনুমোদন` })
      .click();
    await expect(head.getByText('নতুন মান প্রয়োগ হয়েছে')).toBeVisible();
  } finally {
    await headContext.close();
  }

  // the official opens the link on their own screen
  await page.goto(`/photos/${fileId}`);
  const own = page.getByRole('dialog', { name: 'ছবি' });
  await expect(own.getByRole('img', { name: 'ছবি' })).toBeVisible();
  if (project === 'mobile') {
    // a phone opens the details as a sheet under the photo
    await own.getByRole('button', { name: 'বিস্তারিত' }).click();
    await expect(
      page.getByRole('dialog', { name: 'বিস্তারিত' }).getByText('তোলার সময়'),
    ).toBeVisible();
    await noSidewaysScroll(page);
  }

  // a volunteer who may not see the photo is told it was not found
  const volunteerContext = await browser.newContext({
    ...(project === 'mobile' ? { viewport: { width: 360, height: 780 } } : {}),
    baseURL: info.project.use.baseURL,
  });
  try {
    const volunteer = await volunteerContext.newPage();
    await signIn(volunteer, VOLUNTEER[project]);
    await volunteer.goto(`/photos/${fileId}`);
    await expect(volunteer.getByText(NOT_FOUND)).toBeVisible();
    await expect(volunteer.getByRole('dialog', { name: 'ছবি' })).toHaveCount(0);
  } finally {
    await volunteerContext.close();
  }
});
