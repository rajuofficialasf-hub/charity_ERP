import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support/admin';

// Screenshots of every page the owner's prototype designs, at a computer's, a tablet's and a
// phone's width, for the owner to set beside the prototype (docs/ui/SCREENS.md). The Department
// Head opens each one. The spec asserts that the page loaded with its heading and that nothing
// pushes it wider than a phone; the look itself is checked by the owner against the prototype,
// and the journeys and the accessibility sweep prove what the pages do. The files land in
// test-results/screens/<width>/.
const HEAD = 'head@example.org';
const WIDTHS = [1280, 768, 360] as const;
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
async function shoot(page: Page, name: string, path: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (width === 360) {
      // a row that does not wrap widens the whole page on a phone
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wide, `${name} at 360 px`).toBeLessThanOrEqual(360);
    }
    await page.screenshot({ path: `test-results/screens/${width}/${name}.png`, fullPage: true });
  }
}

test('the designed pages at three widths for the owner', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'one set of screenshots, from the desktop');
  test.setTimeout(600_000);
  await signIn(page, HEAD);
  for (const [name, path] of PAGES) await shoot(page, name, path);
  await shoot(page, '24-volunteer-profile', await firstVolunteer(page));
});
