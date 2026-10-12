import AxeBuilder from '@axe-core/playwright';
import { fakeEmail, fakeMobile, fakeNid } from '@css/shared';
import { expect, type Page, test } from '@playwright/test';

// Registration on a phone from the login page to the pending confirmation (plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U11; AUTH.md 2). The
// API runs with the dummy OTP 123456 on a fresh E2E database; every run uses its own fake mobile,
// email and NID in the ranges the demo seed leaves free.
const OTP = '123456';
const PASSWORD = 'Nadi kul 2026';

/** A tiny valid PNG (1 x 1 pixel) as the photo and the NID photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

/** Contacts and an NID nobody else of this run uses. */
function freshPerson() {
  const n = 5000 + Math.floor(Math.random() * 4999);
  return {
    mobile: fakeMobile(n),
    email: fakeEmail(`reg-e2e-${Date.now()}-${n}`),
    nid: fakeNid(60000 + Math.floor(Math.random() * 39999)),
  };
}

/** Picks from a Select; its button is named by the current value, then the label. */
async function choose(page: Page, label: RegExp, option?: string) {
  await page.getByRole('button', { name: label }).click();
  const list = page.getByRole('listbox');
  const choice = option
    ? list.getByRole('option', { name: option, exact: true })
    : list.getByRole('option').first();
  await choice.click();
  // the list closes before the next one opens
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function photo(page: Page, label: RegExp, slot: string) {
  const uploaded = page.waitForResponse(
    (r) => r.url().includes(`/auth/register/photos/${slot}?`) && r.status() === 201,
  );
  await page
    .getByRole('group', { name: label })
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: `${slot}.png`, mimeType: 'image/png', buffer: PNG });
  await uploaded;
}

test.describe('registration on a phone', () => {
  test('a volunteer registers with two codes and reaches the pending confirmation', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone journey');
    const person = freshPerson();
    await page.goto('/login');
    await page.getByRole('link', { name: 'নিবন্ধন করুন' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByRole('radio', { name: 'স্বেচ্ছাসেবক' }).check();
    await page.getByRole('textbox', { name: /মোবাইল নম্বর/ }).fill(person.mobile);
    await page.getByRole('textbox', { name: /ইমেইল/ }).fill(person.email);
    await page.getByRole('button', { name: 'কোড পাঠান' }).click();
    await page.getByRole('textbox', { name: /মোবাইলে পাওয়া কোড/ }).fill(OTP);
    await page.getByRole('button', { name: 'পরের ধাপ' }).click();
    await page.getByRole('textbox', { name: /ইমেইলে পাওয়া কোড/ }).fill(OTP);
    await page.getByRole('button', { name: 'যাচাই করুন' }).click();

    await expect(page.getByRole('heading', { name: 'নিবন্ধন ফর্ম' })).toBeVisible();
    await page.getByRole('textbox', { name: /^নাম/ }).fill('নতুন স্বেচ্ছাসেবক (নমুনা)');
    await page.getByRole('textbox', { name: /পিতার নাম/ }).fill('নমুনা পিতা');
    await page.getByRole('textbox', { name: /মাতার নাম/ }).fill('নমুনা মাতা');
    await page.getByRole('textbox', { name: /NID নম্বর/ }).fill(person.nid);
    await choose(page, /(^|\s)বিভাগ/, 'ঢাকা');
    await choose(page, /(^|\s)জেলা/, 'ঢাকা');
    await choose(page, /(^|\s)উপজেলা/);
    await choose(page, /(^|\s)ইউনিয়ন/);
    await expect(page.getByRole('button', { name: /স্বেচ্ছাসেবকের ধরন/ })).toBeVisible();
    await photo(page, /^ছবি/, 'photo');
    await photo(page, /^NID-এর ছবি/, 'nid_photo');
    await page
      .getByLabel(/^পাসওয়ার্ড/)
      .first()
      .fill(PASSWORD);
    await page.getByLabel(/^পাসওয়ার্ড আবার লিখুন/).fill(PASSWORD);
    await page.getByRole('button', { name: 'জমা দিন' }).click();

    await expect(page.getByRole('heading', { name: 'নিবন্ধন জমা হয়েছে' })).toBeVisible();
    await expect(page.getByText('অনুমোদনের পর আপনি কাজ শুরু করতে পারবেন।')).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
});
