import { expect, test } from '@playwright/test';
import { apiAs, isPhone, mainMenu, signIn } from './support/admin';

// Role-based denial for every demo role (docs/MASTER_PROMPT.md, the first critical E2E journey;
// docs/testing/DEMO_ACCOUNTS.md): each role opens a page of another role and sees the forbidden
// screen, and the API refuses an operation the role does not hold with 403 `permission.denied`
// (docs/security/AUTHORIZATION_MATRIX.md). An Admin and the Department Head hold every permission
// (the Head's one exception, the Main Admin transfer, is no page and no read), so they have no row.
// The Monitoring Team reads everything and administers nothing: the panel and the settings refuse
// it. The accounts are only read here; both projects sign in with the same ones, chosen among
// those whose sessions and passwords no other spec depends on (docs/testing/DEMO_ACCOUNTS.md).
const DENIED = 'এই পাতায় আপনার প্রবেশাধিকার নেই।';
/** An id no record has. */
const NO_RECORD = '01900000-0000-7000-8000-000000000000';

const ROLES: { role: string; loginId: string; page: string; api: string }[] = [
  {
    role: 'a General Volunteer',
    loginId: '01700000103',
    page: '/admin/beneficiaries',
    api: '/exports/columns?list=beneficiaries',
  },
  {
    role: 'a General Volunteer',
    loginId: '01700000103',
    page: '/admin/permissions',
    api: '/users',
  },
  {
    role: 'the Finance Team',
    loginId: 'finance@example.org',
    page: '/admin/volunteers',
    api: '/volunteers',
  },
  {
    role: 'a General Volunteer',
    loginId: '01700000103',
    page: '/media',
    api: '/media/summary',
  },
  {
    role: 'the Finance Team',
    loginId: 'finance@example.org',
    page: '/media',
    api: '/media-works',
  },
  {
    role: 'the Media Team',
    loginId: 'media@example.org',
    page: '/admin/settings',
    api: '/settings',
  },
  {
    role: 'the Procurement Team',
    loginId: 'procurement@example.org',
    page: '/admin/volunteers',
    api: '/volunteers',
  },
  {
    role: 'the Official দায়ী',
    loginId: 'daee@example.org',
    page: '/admin/registrations',
    api: '/registrations',
  },
  {
    role: 'the Project Executive',
    loginId: 'executive@example.org',
    page: '/admin/handover',
    api: '/users',
  },
  {
    role: 'the Rangpur RPM',
    loginId: 'rpm.rangpur@example.org',
    page: '/admin/settings',
    api: '/settings',
  },
  {
    role: 'the Finance Team',
    loginId: 'finance@example.org',
    page: '/admin/projects',
    api: '/program-cards',
  },
  {
    role: 'the Official দায়ী',
    loginId: 'daee@example.org',
    page: '/admin/projects',
    api: '/project-series',
  },
  // a program's page and a project's page: the forbidden screen comes before any read, so an id of
  // no record is enough
  {
    role: 'the Media Team',
    loginId: 'media@example.org',
    page: `/admin/projects/programs/${NO_RECORD}`,
    api: '/program-cards',
  },
  {
    role: 'the Procurement Team',
    loginId: 'procurement@example.org',
    page: `/admin/projects/series/${NO_RECORD}`,
    api: `/project-series/${NO_RECORD}`,
  },
  {
    role: 'the HUM Program Manager',
    loginId: 'pm.hum@example.org',
    // the panel is the Admin's and the Head's; the catalogue of roles and permissions stays
    // readable for anyone who may view permissions, and the audit log is not a PM's
    page: '/admin/permissions',
    api: '/audit-log',
  },
  // the panel's own reads stay open to the Monitoring Team (it reads every permission); what it
  // cannot do is administer: the active sessions and the system health refuse it
  {
    role: 'the Monitoring Team',
    loginId: 'monitoring@example.org',
    page: '/admin/permissions',
    api: '/sessions/active',
  },
  {
    role: 'the Monitoring Team',
    loginId: 'monitoring@example.org',
    page: '/admin/health',
    api: '/admin/health',
  },
  {
    role: 'the Monitoring Team',
    loginId: 'monitoring@example.org',
    page: '/admin/settings',
    api: '/settings',
  },
];

test.describe('role-based denial', () => {
  for (const c of ROLES) {
    test(`${c.role} is refused ${c.page} on screen and ${c.api} by the API`, async ({
      page,
      request,
    }) => {
      await signIn(page, c.loginId);
      await page.goto(c.page);
      await expect(page.getByText(DENIED)).toBeVisible();
      // the server decides, whatever the screen shows
      const api = await apiAs(request, c.loginId);
      const res = await api.get(c.api);
      expect(res.status(), `GET ${c.api} as ${c.loginId}`).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: 'permission.denied' } });
    });
  }
});

test.describe('the administration and the oversight', () => {
  test('the Monitoring Team has the audit log in its menu, and neither the panel nor the settings', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'the sidebar is for desktops');
    await signIn(page, 'monitoring@example.org');
    const nav = mainMenu(page);
    await expect(nav.getByRole('link', { name: 'অডিট লগ' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'পারমিশন' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'সেটিংস' })).toHaveCount(0);
    await nav.getByRole('link', { name: 'অডিট লগ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'অডিট লগ' })).toBeVisible();
  });

  test('an Admin has the panel, the settings and the audit log in the menu', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'the sidebar is for desktops');
    await signIn(page, 'admin@example.org');
    const nav = mainMenu(page);
    for (const name of ['পারমিশন', 'সেটিংস', 'অডিট লগ'])
      await expect(nav.getByRole('link', { name })).toBeVisible();
    await nav.getByRole('link', { name: 'পারমিশন' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(DENIED)).toHaveCount(0);
  });
});
