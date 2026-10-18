import { expect, type Page, test } from '@playwright/test';
import { PASSWORD, scan, switchLanguage } from './support/admin';

// axe on every built Phase 1 screen in Bengali and in English, on the phone and the desktop
// project (constitution section 10, NFR-46; the gate's accessibility check of
// docs/testing/TEST_STRATEGY.md section 3.6). The screens are those of docs/ui/SCREENS.md with a
// Phase 1 task; a record page takes the first row of its list and is left out with a note when
// the list is empty. A role sweeps only the pages it may open: the sweep never asserts on a
// forbidden page. The accounts are only read here (docs/testing/DEMO_ACCOUNTS.md): the sign-in
// goes through the API with the language already chosen on the device, because the login form
// would otherwise write the language onto the shared account and change what the other specs see.
const LANGUAGES = ['bn', 'en'] as const;
type Lang = (typeof LANGUAGES)[number];

/** Signs in through the API in the page's own context, with `lang` as the device language. */
async function signInAs(page: Page, loginId: string, lang: Lang): Promise<void> {
  const origin = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:3100/' : page.url())
    .origin;
  await page.context().addCookies([{ name: 'css_locale', value: lang, url: origin }]);
  const login = await page.request.post('/api/v1/auth/login', {
    data: {
      loginId,
      password: PASSWORD,
      device: { name: 'E2E axe', platform: 'desktop', appVersion: 'e2e' },
    },
  });
  expect(login.ok(), `login as ${loginId}: ${login.status()}`).toBe(true);
  // the app restores the session from the refresh cookie with one silent refresh
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /^(স্বাগতম|Welcome), / })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** A link to a record page of the kind, taken from the first row of the list on the page. */
const firstRecord = async (page: Page, prefix: string): Promise<string | null> => {
  const hrefs = await page
    .locator(`main a[href^="${prefix}/"]`)
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
  return hrefs.find((h) => /\/[0-9a-f-]{36}$/.test(h)) ?? null;
};

/** Opens a page, waits for its heading, switches the language and checks it with axe. */
async function sweep(page: Page, path: string, lang: Lang): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await switchLanguage(page, lang);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const results = await scan(page);
  expect(results.violations, `${path} (${lang})`).toEqual([]);
}

const skipped = (path: string, why: string) =>
  test.info().annotations.push({ type: 'skipped page', description: `${path}: ${why}` });

test.describe('accessibility of the Phase 1 screens', () => {
  for (const lang of LANGUAGES) {
    test(`signed out, in ${lang}`, async ({ page }) => {
      for (const path of ['/login', '/login/reset', '/register']) await sweep(page, path, lang);
      // a link nobody issued: the page says to ask for a new one
      await sweep(page, '/invite#not-a-link-of-this-run', lang);
    });

    test(`a volunteer, in ${lang}`, async ({ page }) => {
      await signInAs(page, '01700000116', lang);
      for (const path of [
        '/',
        '/account/profile',
        '/account/sessions',
        '/account/password',
        '/notifications',
        '/my-projects',
      ])
        await sweep(page, path, lang);
      await page.goto('/my-projects');
      const project = await firstRecord(page, '/my-projects');
      if (!project) skipped('/my-projects/:id', 'this volunteer is on no project');
      else await sweep(page, project, lang);
    });

    test(`a main volunteer with a team, in ${lang}`, async ({ page }) => {
      await signInAs(page, '01700000117', lang);
      await page.goto('/my-projects');
      const project = await firstRecord(page, '/my-projects');
      if (!project) {
        skipped('/my-projects/:id/team', 'this volunteer is on no project yet');
        return;
      }
      await sweep(page, project, lang);
      const team = page.getByRole('link', { name: /^(আমার টিম|My team)$/ });
      if ((await team.count()) === 0) skipped(`${project}/team`, 'the project is not open yet');
      else await sweep(page, `${project}/team`, lang);
    });

    test(`the Department Head, in ${lang}`, async ({ page }) => {
      test.setTimeout(240_000);
      await signInAs(page, 'head@example.org', lang);
      for (const path of [
        '/',
        '/admin/volunteers',
        '/admin/beneficiaries',
        '/admin/registrations',
        '/admin/staff',
        '/admin/staff/organogram',
        '/admin/handover',
        '/admin/programs',
        '/admin/templates',
        '/admin/projects',
        '/admin/projects/new',
        '/admin/settings',
        '/admin/nisab',
        '/admin/audit',
        '/admin/sessions',
        '/admin/health',
        '/admin/notification-templates',
        '/admin/deliveries',
        '/admin/permissions',
      ])
        await sweep(page, path, lang);
      // the record pages: the first row of each list
      for (const [list, record] of [
        ['/admin/volunteers', '/admin/volunteers'],
        ['/admin/beneficiaries', '/admin/beneficiaries'],
      ] as const) {
        await page.goto(list);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        const href = await firstRecord(page, record);
        if (!href) skipped(`${record}/:id`, 'the list is empty');
        else await sweep(page, href, lang);
      }
      await page.goto('/admin/projects');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const project = await firstRecord(page, '/admin/projects');
      if (!project) skipped('/admin/projects/:id', 'the list is empty');
      else
        for (const sub of ['', '/setup', '/volunteers'])
          await sweep(page, `${project}${sub}`, lang);
    });
  }
});
