import {
  type APIRequestContext,
  type Browser,
  devices,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { apiAs, isPhone, openTab, PASSWORD, scan, signIn, switchLanguage } from './support/admin';
import { DEMO_FINISHED, demoReadyForm } from './support/demo-form';
import { settled } from './support/forms';
import { activeProject, code, ERR } from './support/projects';

// axe on every built Phase 1 screen in Bengali and in English, on the phone and the desktop
// project (docs/MASTER_PROMPT.md, the accessibility line of the non-functional requirements; the
// gate's accessibility check of docs/testing/TEST_STRATEGY.md section 3.6). The screens are those
// of docs/ui/SCREENS.md with a Phase 1 task. A role sweeps only the pages it may open: the sweep
// never asserts on a forbidden page. The project pages use a project of this run's own, made
// through the setup wizard by the ERR Program Manager, with volunteer 3 assigned and consenting
// through the API, so no other spec decides whether a record page exists; the volunteer and the
// beneficiary come from the demo seed. The sign-in goes through the API with the language already
// chosen on the device, because the login form would otherwise write the language onto the shared
// account and change what the other specs see (docs/testing/DEMO_ACCOUNTS.md).
const LANGUAGES = ['bn', 'en'] as const;
type Lang = (typeof LANGUAGES)[number];
const PM = 'pm.err@example.org';
const HEAD = 'head@example.org';
const VOLUNTEER = '01700000103';

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

/** Opens a page, waits for its heading, switches the language and checks it with axe. */
async function sweep(page: Page, path: string, lang: Lang): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await switchLanguage(page, lang);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const results = await scan(page);
  expect(results.violations, `${path} (${lang})`).toEqual([]);
}

/** The first record link of the kind on the page; the demo seed guarantees one. */
async function firstRecord(page: Page, prefix: string): Promise<string> {
  const links = page.locator(`main a[href^="${prefix}/"]`);
  let href: string | undefined;
  // the rows arrive after the heading, and a page link under the same prefix (the duplicates page)
  // is there before them; on a phone the card's link is clipped, so attached is enough
  await expect(async () => {
    const hrefs = await links.evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    href = hrefs.find((h) => /\/[0-9a-f-]{36}$/.test(h));
    expect(href, `a record under ${prefix}`).toBeTruthy();
  }).toPass();
  return href!;
}

/** An active project of this run (the ERR PM, the Dhaka division) with volunteer 3 assigned. */
async function projectWithVolunteer(browser: Browser, request: APIRequestContext): Promise<string> {
  const officials = await browser.newContext({ ...devices['Desktop Chrome'] });
  const desk = await officials.newPage();
  await signIn(desk, PM);
  await openTab(desk, 'প্রকল্প');
  const projectId = await activeProject(desk, `অ্যাক্সেসিবিলিটির পরীক্ষা ${code()}`, ERR, PM);
  await officials.close();
  const head = await apiAs(request, HEAD);
  const volunteers = await head.get(`/volunteers?q=${VOLUNTEER}`);
  expect(volunteers.ok()).toBe(true);
  const { data } = (await volunteers.json()) as { data: { id: string }[] };
  expect(data).toHaveLength(1);
  const assigned = await head.post(`/projects/${projectId}/volunteers`, {
    volunteers: [{ volunteerId: data[0]!.id }],
  });
  expect(assigned.status(), 'the assignment').toBe(201);
  return projectId;
}

/** Volunteer 3 accepts the rules of the project through the API, as the consent screen would. */
async function consentThroughApi(request: APIRequestContext, projectId: string): Promise<void> {
  const me = await apiAs(request, VOLUNTEER);
  const detail = await me.get(`/me/projects/${projectId}`);
  expect(detail.ok()).toBe(true);
  const { data } = (await detail.json()) as {
    data: { rules: { version: number; parts: { part: string }[] } };
  };
  const consent = await me.post(`/me/projects/${projectId}/consent`, {
    rulesVersion: data.rules.version,
    decision: 'accepted',
    parts: data.rules.parts.map((p) => p.part),
  });
  expect(consent.ok(), 'the consent').toBe(true);
}

test.describe('accessibility of the Phase 1 screens', () => {
  for (const lang of LANGUAGES) {
    test(`signed out, in ${lang}`, async ({ page }) => {
      for (const path of ['/login', '/login/reset', '/register']) await sweep(page, path, lang);
      // a link nobody issued: the page says to ask for a new one
      await sweep(page, '/invite#not-a-link-of-this-run', lang);
      // a public application link that takes nothing shows its one plain page
      await sweep(page, '/apply/not-a-link-of-this-run-0123456789', lang);
    });

    test(`a volunteer, in ${lang}`, async ({ browser, page, request }) => {
      test.setTimeout(180_000);
      const projectId = await projectWithVolunteer(browser, request);
      await signInAs(page, VOLUNTEER, lang);
      for (const path of [
        '/',
        '/account/profile',
        '/account/sessions',
        '/account/password',
        '/notifications',
        '/my-projects',
      ])
        await sweep(page, path, lang);
      // the project waiting for the consent, then the open project and the team
      await sweep(page, `/my-projects/${projectId}`, lang);
      await consentThroughApi(request, projectId);
      await sweep(page, `/my-projects/${projectId}`, lang);
      await expect(page.getByRole('link', { name: /^(আমার টিম|My team)$/ })).toBeVisible();
      await sweep(page, `/my-projects/${projectId}/team`, lang);
      // the own applications, the new application with its lookup, and the sync centre
      await sweep(page, '/my-applications', lang);
      await sweep(page, `/my-projects/${projectId}/apply`, lang);
      await sweep(page, '/sync', lang);
    });

    test(`the Department Head, in ${lang}`, async ({ browser, page, request }) => {
      test.setTimeout(300_000);
      const projectId = await projectWithVolunteer(browser, request);
      const found = await (await apiAs(request, HEAD)).get(`/volunteers?q=${VOLUNTEER}`);
      expect(found.ok(), await found.text()).toBe(true);
      const [volunteer] = ((await found.json()) as { data: { id: string }[] }).data;
      expect(volunteer, 'the demo volunteer').toBeDefined();
      await signInAs(page, HEAD, lang);
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
        `/admin/projects/${projectId}`,
        `/admin/projects/${projectId}/setup`,
        `/admin/projects/${projectId}/volunteers`,
        `/admin/projects/${projectId}/applications`,
        // the quota section of the areas step, the verification queue and the transfer
        `/admin/projects/${projectId}/setup?step=areas`,
        `/admin/projects/${projectId}/applications?status=needs_verification`,
        `/admin/projects/${projectId}/transfer?from=${volunteer!.id}`,
        '/admin/settings',
        '/admin/nisab',
        '/admin/audit',
        '/admin/sessions',
        '/admin/health',
        '/admin/notification-templates',
        '/admin/deliveries',
        '/admin/permissions',
        // the Media Team's home; its work page is checked by the media journey
        '/media',
      ])
        await sweep(page, path, lang);
      const media = await (await apiAs(request, HEAD)).get('/users?q=media%40example.org');
      const [member] = ((await media.json()) as { data: { id: string }[] }).data;
      await sweep(page, `/media/members/${member!.id}`, lang);
      // the record pages: the first row of each list
      for (const list of ['/admin/volunteers', '/admin/beneficiaries']) {
        await page.goto(list);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await sweep(page, await firstRecord(page, list), lang);
      }
      // the project's forms and the builder of its form (the open public form is checked by the
      // form builder's journey, whose project takes applications today)
      const forms = await (await apiAs(request, HEAD)).get(`/projects/${projectId}/forms`);
      expect(forms.ok()).toBe(true);
      const [form] = ((await forms.json()) as { data: { id: string }[] }).data;
      await sweep(page, `/admin/projects/${projectId}/forms`, lang);
      await sweep(page, `/admin/projects/${projectId}/forms/${form!.id}`, lang);
      // the ready forms, the question library in the same builder, and the placement dialog
      await sweep(page, '/admin/ready-forms', lang);
      await sweep(page, '/admin/question-library', lang);
      await page.goto(`/admin/projects/${projectId}/forms`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page
        .getByRole('button', { name: lang === 'bn' ? 'তৈরি ফর্ম বসান' : 'Place a ready form' })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // axe reads the colours the dialog settles on, not a frame of its fade-in
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running'),
      );
      expect((await scan(page)).violations, `the placement dialog (${lang})`).toEqual([]);
      // the builder with a number table chosen, then a calculation's formula in its editor; on a
      // phone the builder edits only texts, so its settings are a computer's
      if (isPhone(test.info())) return;
      const demo = await demoReadyForm(page, HEAD, `ডেমো ${code()}`, DEMO_FINISHED);
      await page.goto(`/admin/ready-forms/${demo}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const bn = lang === 'bn';
      await page
        .getByRole('button', { name: bn ? 'গবাদি পশু বদলান' : 'Change Livestock', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: bn ? 'সারি যোগ করুন' : /^Add a row/ }),
      ).toBeVisible();
      await settled(page);
      expect((await scan(page)).violations, `the builder with a table (${lang})`).toEqual([]);
      await page
        .getByRole('button', { name: bn ? 'মোট সম্পদ বদলান' : 'Change Total assets', exact: true })
        .click();
      await page
        .getByRole('button', { name: bn ? 'হিসাব বদলান' : 'Change the calculation' })
        .click();
      const calc = page.getByRole('dialog');
      await calc.getByText(bn ? 'সূত্র লিখুন' : 'Type a formula', { exact: true }).click();
      await expect(calc.getByRole('textbox', { name: bn ? /^সূত্র/ : /^Formula/ })).toHaveValue(
        'q_gold_anas * q_gold_price + q_cash',
      );
      await settled(page);
      expect((await scan(page)).violations, `the formula editor (${lang})`).toEqual([]);
    });
  }
});
