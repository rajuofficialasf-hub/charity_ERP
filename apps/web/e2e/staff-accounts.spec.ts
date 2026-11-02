import { expect, test } from '@playwright/test';
import { choose, isPhone, PASSWORD, scan, signIn } from './support/admin';

// Officials created by the admin (DECISION_LOG D-097; plan
// docs/plans/2026-10-17-1500-feat-official-accounts-organogram-plan.md): the Department Head (the
// Monitoring Team on a phone) creates an official, copies the set-password link, the official sets
// a password through it in another browser, logs in with the job ID, and appears in the organogram.
const ADMIN = { desktop: 'head@example.org', mobile: 'monitoring@example.org' } as const;
const NEW_PASSWORD = `${PASSWORD} New`;

test.describe('officials created by the admin', () => {
  test('create, copy the link, set the password, log in with the job ID', async ({
    page,
    browser,
  }, info) => {
    const suffix = `${Date.now().toString(36).slice(-5)}${info.project.name === 'mobile' ? 'm' : 'd'}`;
    const jobId = `E2E-${suffix}`.toUpperCase();
    const name = `পরীক্ষা কর্মকর্তা ${suffix}`;
    await signIn(page, ADMIN[isPhone(info) ? 'mobile' : 'desktop']);
    await page.goto('/admin/staff');
    await expect(page.getByRole('heading', { level: 1, name: 'কর্মী' })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
    // the page never scrolls sideways, on a phone neither
    const noSideways = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noSideways()).toBe(true);

    await page.getByRole('button', { name: 'নতুন অফিসিয়াল' }).click();
    const dialog = page.getByRole('dialog', { name: 'নতুন অফিসিয়াল' });
    await dialog.getByRole('textbox', { name: /^Job ID/ }).fill(jobId.toLowerCase());
    await dialog.getByRole('textbox', { name: /^নাম/ }).fill(name);
    await dialog.getByRole('textbox', { name: /^পদবি/ }).fill('Project Executive');
    await dialog.getByRole('textbox', { name: /^ইমেইল/ }).fill(`e2e-${suffix}@example.org`);
    // the second step: the role and the place
    await dialog.getByRole('button', { name: 'পরের ধাপ' }).click();
    await choose(page, 'ভূমিকা \\(আবশ্যক\\)', 'প্রজেক্ট এক্সিকিউটিভ');
    await dialog.getByRole('button', { name: 'অ্যাকাউন্ট তৈরি করুন' }).click();

    const linkDialog = page.getByRole('dialog', { name: `${name}-এর পাসওয়ার্ড লিঙ্ক` });
    const field = linkDialog.getByRole('textbox', { name: 'লিঙ্ক' });
    await expect(field).toHaveValue(/\/invite#[A-Za-z0-9_-]{43}$/);
    const link = await field.inputValue();
    // the footer button; the corner one carries the same name
    await linkDialog.getByRole('button', { name: 'বন্ধ করুন' }).last().click();
    // the new official waits for the password in the list
    await page.getByRole('searchbox', { name: 'খুঁজুন' }).fill(jobId);
    // the table on a desktop and the cards on a phone: the visible one
    await expect(page.getByText('পাসওয়ার্ডের অপেক্ষায়').filter({ visible: true })).toHaveCount(1);
    // the name opens the official's profile with the Job ID and the new-link action
    await page.getByRole('link', { name }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText(new RegExp(`^Job ID: ${jobId}$`, 'i'))).toBeVisible();
    await expect(page.getByRole('button', { name: 'নতুন পাসওয়ার্ড লিঙ্ক' })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
    expect(await noSideways()).toBe(true);

    // the official opens the link in a browser of their own
    const other = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
    });
    const person = await other.newPage();
    await person.goto(`/invite${new URL(link).hash}`);
    await expect(person.getByText(`আপনার Job ID: ${jobId}। এটি দিয়েই লগইন করবেন।`)).toBeVisible();
    // the token leaves the address bar at once
    await expect(person).toHaveURL(/\/invite$/);
    await person.getByLabel(/^নতুন পাসওয়ার্ড(?! আবার)/).fill(NEW_PASSWORD);
    await person.getByLabel(/^নতুন পাসওয়ার্ড আবার লিখুন/).fill(NEW_PASSWORD);
    await person.getByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করুন' }).click();
    await expect(person.getByText(/পাসওয়ার্ড সংরক্ষিত হয়েছে।/)).toBeVisible();
    await person.getByRole('link', { name: 'লগইনে যান' }).click();
    await person
      .getByRole('textbox', { name: /Job ID, মোবাইল নম্বর বা ইমেইল/ })
      .fill(jobId.toLowerCase());
    await person
      .getByLabel(/^পাসওয়ার্ড/)
      .first()
      .fill(NEW_PASSWORD);
    await person.getByRole('button', { name: 'লগইন', exact: true }).click();
    await expect(person.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
    await expect(person.getByTestId('profile-name')).toHaveText(name);

    // the link works once
    await person.goto(`/invite${new URL(link).hash}`);
    await expect(person.getByText(/নতুন লিঙ্কের জন্য/)).toBeVisible();
    await other.close();

    // a new official without a program stands among those not placed yet
    await page.goto('/admin/staff/organogram');
    await expect(page.getByRole('heading', { level: 1, name: 'অর্গানোগ্রাম' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'এখনও স্থান নির্ধারিত হয়নি' }).getByText(name),
    ).toBeVisible();
    expect(await noSideways()).toBe(true);
  });
});
