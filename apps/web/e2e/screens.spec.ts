import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support/admin';
import { DEMO_FINISHED, demoReadyForm } from './support/demo-form';
import { code } from './support/projects';

// Screenshots of every page the owner's prototype designs, at a computer's, a tablet's and a
// phone's width, for the owner to set beside the prototype (docs/ui/SCREENS.md). The Department
// Head opens each one, in the light and in the dark mode. The spec asserts that the page loaded
// with its heading in the chosen mode and that nothing pushes it wider than a phone; the look
// itself is checked by the owner against the prototype, and the journeys and the accessibility
// sweep prove what the pages do. The files land in test-results/screens/<mode>/<width>/. The form
// builder, a computer's screen, is taken with a question chosen at the widths its layout changes
// at: three panes at 1280 and 1024 px, the settings in a drawer over the form at 768 px; then, at
// 1280 px, with a question on its way to another place and with both side panes folded away.
const HEAD = 'head@example.org';
const WIDTHS = [1280, 768, 360] as const;
const BUILDER_WIDTHS = [1280, 1024, 768] as const;
const MODES = ['light', 'dark'] as const;
type Mode = (typeof MODES)[number];
const PAGES: [string, string][] = [
  ['01-my-work', '/'],
  ['02-projects', '/admin/projects'],
  ['03-programs', '/admin/programs'],
  ['04-templates', '/admin/templates'],
  ['05-ready-forms', '/admin/ready-forms'],
  ['06-registrations', '/admin/registrations'],
  ['07-duplicates', '/admin/beneficiaries/duplicates'],
  ['08-staff', '/admin/staff'],
  ['09-handover', '/admin/handover'],
  ['10-permissions', '/admin/permissions'],
  ['11-settings', '/admin/settings'],
  ['12-nisab', '/admin/nisab'],
  ['13-audit', '/admin/audit'],
  ['14-sessions', '/admin/sessions'],
  ['15-health', '/admin/health'],
  ['16-notifications', '/notifications'],
  ['17-notification-texts', '/admin/notification-templates'],
  ['18-deliveries', '/admin/deliveries'],
  ['19-my-profile', '/account/profile'],
  ['20-my-devices', '/account/sessions'],
  ['21-password', '/account/password'],
  ['22-beneficiaries', '/admin/beneficiaries'],
  ['23-volunteers', '/admin/volunteers'],
];

/** The first volunteer's profile on the list; the demo seed guarantees one. */
async function firstVolunteer(page: Page): Promise<string> {
  await page.goto('/admin/volunteers');
  const link = page.locator('main a[href^="/admin/volunteers/"]').first();
  await expect(link).toBeAttached();
  return (await link.getAttribute('href'))!;
}

/** Opens the page at each width, waits for its heading and its data, and keeps a full shot. */
async function shoot(page: Page, mode: Mode, name: string, path: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.locator(':root')).toHaveAttribute('data-color-scheme', mode);
    await page.waitForLoadState('networkidle');
    if (width === 360) {
      // a row that does not wrap widens the whole page on a phone
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wide, `${name} at 360 px`).toBeLessThanOrEqual(360);
    }
    await page.screenshot({
      path: `test-results/screens/${mode}/${width}/${name}.png`,
      fullPage: true,
    });
  }
}

for (const mode of MODES) {
  test(`the designed pages at three widths in the ${mode} mode for the owner`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'one set of screenshots, from the desktop');
    test.setTimeout(600_000);
    // the person's own pick of the mode, kept on the device as the mode switch keeps it
    await page.addInitScript((chosen) => window.localStorage.setItem('asf-mode', chosen), mode);
    await signIn(page, HEAD);
    for (const [name, path] of PAGES) await shoot(page, mode, name, path);
    await shoot(page, mode, '24-volunteer-profile', await firstVolunteer(page));
  });
}

for (const mode of MODES) {
  test(`the form builder at three widths in the ${mode} mode for the owner`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'one set of screenshots, from the desktop');
    test.setTimeout(180_000);
    await page.addInitScript((chosen) => window.localStorage.setItem('asf-mode', chosen), mode);
    await signIn(page, HEAD);
    const form = await demoReadyForm(page, HEAD, `ডেমো ${code()}`, DEMO_FINISHED);
    const still = async () => {
      // the pointer rests on nothing, and nothing slides or fades any more
      await page.mouse.move(0, 0);
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running'),
      );
    };
    for (const width of BUILDER_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/admin/ready-forms/${form}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.locator(':root')).toHaveAttribute('data-color-scheme', mode);
      // a chosen question shows its bar and its settings
      await page.getByRole('button', { name: 'লিঙ্গ বদলান', exact: true }).click();
      await expect(page.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ })).toHaveValue('লিঙ্গ');
      await page.waitForLoadState('networkidle');
      const drawer = page.getByRole('dialog', { name: 'প্রশ্ন ও ফর্মের সেটিং' });
      if (await drawer.count()) {
        // the settings over the form as the screen shows them, then the form under them
        await still();
        await page.screenshot({
          path: `test-results/screens/${mode}/${width}/26-form-builder-settings.png`,
        });
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
      }
      await still();
      await page.screenshot({
        path: `test-results/screens/${mode}/${width}/25-form-builder.png`,
        fullPage: true,
      });
    }
    // a question on its way at a computer's width: its name beside the pointer, and the line
    // where it would land, after the question whose lower half the pointer is in
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const grip = (await page
      .getByRole('button', { name: 'মোবাইল নম্বর টেনে সরান' })
      .boundingBox())!;
    const over = (await page.locator('[data-question="q_name"]').boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(over.x + over.width / 2, over.y + over.height * 0.75, { steps: 10 });
    await expect(page.locator('[data-question="q_name"]')).toHaveClass(/is-land-after/);
    await page.screenshot({
      path: `test-results/screens/${mode}/1280/28-form-builder-drag.png`,
    });
    // given up, the question stays where it was
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.is-land-after')).toHaveCount(0);
    // both side panes folded away: the form with all the room
    await page.getByRole('button', { name: 'প্রশ্ন যোগের তালিকা লুকান' }).click();
    await page.getByRole('button', { name: 'সেটিং লুকান' }).click();
    await expect(page.getByRole('button', { name: 'সেটিং দেখান' })).toBeVisible();
    await still();
    await page.screenshot({
      path: `test-results/screens/${mode}/1280/27-form-builder-folded.png`,
    });
  });
}
