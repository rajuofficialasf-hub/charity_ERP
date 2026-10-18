import { expect, test } from '@playwright/test';
import { apiAs, signIn } from './support/admin';

// Role-based denial for every demo role (constitution section 14, the first critical journey;
// docs/testing/DEMO_ACCOUNTS.md): each role opens a page of another role and sees the forbidden
// screen, and the API refuses an operation the role does not hold with 403 `permission.denied`
// (docs/security/AUTHORIZATION_MATRIX.md). The Department Head and the Monitoring Team hold every
// permission; their one exception, the Main Admin transfer, has no endpoint yet, so they have no
// row. The accounts are only read here; both projects sign in with the same ones, chosen among
// those whose sessions and passwords no other spec depends on (DEMO_ACCOUNTS.md).
const DENIED = 'এই পাতায় আপনার প্রবেশাধিকার নেই।';

const ROLES: { role: string; loginId: string; page: string; api: string }[] = [
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
    role: 'the Implementer',
    loginId: 'implementer@example.org',
    page: '/admin/permissions',
    api: '/users',
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
    role: 'the HUM Program Manager',
    loginId: 'pm.hum@example.org',
    page: '/admin/permissions',
    api: '/roles',
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
