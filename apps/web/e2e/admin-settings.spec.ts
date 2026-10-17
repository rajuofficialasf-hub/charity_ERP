import { expect, test } from '@playwright/test';
import { isPhone, rows, scan, signIn } from './support/admin';
import { typeDate } from './support/projects';

// The admin and settings core (plan docs/plans/2026-10-17-1800-feat-admin-settings-core-plan.md):
// a threshold is changed and found in the audit log, the dummy OTP warning is red, the sessions
// and the health pages answer, and a Program Manager adds a nisab version with its effective date.
// The Department Head works on a desktop and the Monitoring Team on a phone (DEMO_ACCOUNTS.md).
const ADMIN = { desktop: 'head@example.org', mobile: 'monitoring@example.org' } as const;
const PM = 'pm.hum@example.org';

/** dd-mm-yyyy of a Dhaka day some days from now, as the date field takes it. */
function dhakaDay(offset: number): { iso: string; typed: string; shown: string } {
  const d = new Date(Date.now() + 6 * 3_600_000 + offset * 86_400_000);
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = iso.split('-');
  return { iso, typed: `${day}${m}${y}`, shown: `${day}-${m}-${y}` };
}

test.describe('admin settings', () => {
  test('a threshold is changed and audited; the dummy OTP warning, sessions and health show', async ({
    page,
  }, info) => {
    test.slow();
    // a value no other run left behind, so the audit entry found is this run's
    const value = String(10 + (Date.now() % 300));
    await signIn(page, ADMIN[isPhone(info) ? 'mobile' : 'desktop']);

    await page.goto('/admin/settings?tab=thresholds');
    await expect(page.getByRole('heading', { level: 1, name: 'সেটিংস' })).toBeVisible();
    const review = page.getByRole('textbox', { name: /^রিভিউ অপেক্ষার দিন/ });
    await review.fill(value);
    await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click();
    await expect(page.getByText('সেটিংস সংরক্ষিত হয়েছে।')).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);

    await page.getByRole('tab', { name: 'নোটিফিকেশন চ্যানেল' }).click();
    await expect(page.getByText('ডামি OTP চালু আছে')).toBeVisible();

    // the change in the audit log, with the new value in the detail; the other project changes
    // the same setting at the same time, so its entry may be the newest
    await page.goto('/admin/audit?action=settings.change&entityType=setting');
    await expect(page.getByRole('heading', { level: 1, name: 'অডিট লগ' })).toBeVisible();
    await expect(rows(page, 'অডিট লগের এন্ট্রি')).toBeVisible();
    const details = page
      .getByRole('button', { name: 'settings.change বিস্তারিত দেখুন' })
      .or(page.getByRole('button', { name: 'বিস্তারিত', exact: true }));
    await expect(details.first()).toBeVisible();
    let found = false;
    const shown = Math.min(await details.count(), 6);
    for (let i = 0; i < shown && !found; i += 1) {
      await details.nth(i).click();
      const drawer = page.getByRole('dialog', { name: 'অডিট এন্ট্রি' });
      const after = drawer.getByRole('region', { name: 'নতুন মান' });
      await expect(after).toBeVisible();
      found = ((await after.textContent()) ?? '').includes(`"reviewPendingDays": ${value}`);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    }
    expect(found).toBe(true);

    // back to the decided value for the other runs
    await page.goto('/admin/settings?tab=thresholds');
    await page.getByRole('textbox', { name: /^রিভিউ অপেক্ষার দিন/ }).fill('7');
    await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click();
    await expect(page.getByText('সেটিংস সংরক্ষিত হয়েছে।')).toBeVisible();

    await page.goto('/admin/sessions');
    await expect(page.getByRole('heading', { level: 1, name: 'সক্রিয় সেশন' })).toBeVisible();
    await expect(rows(page, 'সক্রিয় সেশন')).toBeVisible();

    await page.goto('/admin/health');
    await expect(page.getByRole('heading', { level: 1, name: 'সিস্টেমের অবস্থা' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'ডাটাবেস' })).toContainText('চালু');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('a Program Manager adds a nisab version with its effective date and withdraws it', async ({
    page,
  }, info) => {
    test.slow();
    await signIn(page, PM);
    await page.goto('/admin/nisab');
    await expect(page.getByRole('heading', { level: 1, name: 'নিসাব' })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
    // both projects share the database: only the desktop run adds, so two runs never race for the
    // "after the latest version" date (a parallel --repeat-each still can; repeat with --workers 1)
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'নতুন নিসাব' }).click();
      await expect(page.getByRole('dialog', { name: 'নতুন নিসাব' })).toBeVisible();
      return;
    }
    const day = dhakaDay(300 + (Date.now() % 60));
    await page.getByRole('button', { name: 'নতুন নিসাব' }).click();
    const dialog = page.getByRole('dialog', { name: 'নতুন নিসাব' });
    await dialog.getByRole('textbox', { name: /^পরিমাণ/ }).fill('98500');
    await typeDate(page, dialog, 'কার্যকর তারিখ', day.typed);
    await dialog.getByRole('button', { name: 'সংরক্ষণ' }).click();
    await expect(page.getByText(`${day.shown} থেকে নতুন নিসাব যোগ হয়েছে।`)).toBeVisible();
    const list = rows(page, 'নিসাবের ভার্সন');
    await expect(list.getByText(day.shown).first()).toBeVisible();

    // a version not yet in effect is withdrawn with a reason, which frees its date
    await page.getByRole('button', { name: `${day.shown}-এর নিসাব প্রত্যাহার` }).click();
    const reason = page.getByRole('dialog', { name: `${day.shown}-এর নিসাব প্রত্যাহার` });
    await reason.getByRole('textbox').fill('পরীক্ষার ভার্সন');
    await reason.getByRole('button', { name: 'প্রত্যাহার' }).click();
    await expect(page.getByText(`${day.shown}-এর নিসাব প্রত্যাহার করা হয়েছে।`)).toBeVisible();
  });
});
