import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderInShell } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { AdminLayout } from '../AdminLayout';
import { PermissionsPage } from './PermissionsPage';
import { stubScreen } from '../../../test/match-media';

// The permission panel screen (SCR-062, RBAC.md 7). Test data only.
const HEAD: Me = { ...ME, displayName: 'ডিপার্টমেন্ট হেড (নমুনা)', roles: ['department_head'] };
const EXECUTIVE = {
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60',
  displayName: 'প্রজেক্ট এক্সিকিউটিভ (নমুনা)',
  designation: 'Project Executive',
  roles: ['project_executive'],
};
const GRANT_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99';
const meta = { requestId: 'req_test', limit: 50, nextCursor: null, prevCursor: null };
type Row = { permission: string; scopeType: string; source: string; grantId?: string };

let effective: Row[];
let lastGrant: Record<string, unknown> | null;

function catalogue() {
  server.use(
    http.get('*/api/v1/users', ({ request }) =>
      HttpResponse.json({
        data: new URL(request.url).searchParams.get('q') ? [EXECUTIVE] : [],
        meta,
      }),
    ),
    http.get('*/api/v1/roles', () =>
      HttpResponse.json({
        data: [
          {
            key: 'project_executive',
            name: { bn: 'প্রজেক্ট এক্সিকিউটিভ', en: 'Project Executive' },
            kind: 'official',
            globalScope: false,
          },
        ],
        meta,
      }),
    ),
    http.get('*/api/v1/permissions', () =>
      HttpResponse.json({
        data: [
          { name: 'application.review', module: 'M08', sensitive: false, description: 'Review' },
          { name: 'permission.view', module: 'M02', sensitive: false, description: 'View' },
        ],
        meta,
      }),
    ),
    http.get('*/api/v1/users/:userId/effective-permissions', () =>
      HttpResponse.json({ data: effective, meta }),
    ),
  );
}

const renderPanel = (me: Me, locale: 'bn' | 'en' = 'bn', path = '/admin/permissions') => {
  refreshAs(me);
  return renderInShell(
    [
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [{ path: 'permissions', element: <PermissionsPage /> }],
      },
    ],
    path,
    locale,
  );
};

async function chooseExecutive(user: ReturnType<typeof userEvent.setup>) {
  // the whole text at once, as a browser fill or a paste does
  await user.click(await screen.findByRole('combobox', { name: /ব্যবহারকারী খুঁজুন/ }));
  await user.paste('executive@example.org');
  await user.click(await screen.findByRole('option', { name: /প্রজেক্ট এক্সিকিউটিভ \(নমুনা\)/ }));
}

// the shell's sidebar, which these tests read, shows on a desktop screen
beforeEach(() => stubScreen());

beforeEach(() => {
  resetClientForTests();
  effective = [{ permission: 'application.review', scopeType: 'REGION', source: 'role_default' }];
  lastGrant = null;
  catalogue();
});

describe('permission panel', () => {
  it('shows a user effective permissions by module with scope and source', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel(HEAD);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'পারমিশন প্যানেল' }),
    ).toBeInTheDocument();
    expect(screen.getByText('অ্যাক্সেস কন্ট্রোল')).toBeInTheDocument();
    // before a choice: what to do, and the rule of the least access beside it
    expect(screen.getByText('একজন ব্যবহারকারী বেছে নিন')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'যতটুকু দরকার, ততটুকু' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).getByRole('link', { name: 'পারমিশন' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await chooseExecutive(user);
    const section = await screen.findByRole('region', { name: 'কার্যকর পারমিশন' });
    expect(within(section).getByRole('heading', { name: 'মডিউল M08' })).toBeInTheDocument();
    expect(within(section).getAllByText('application.review').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('রোলের ডিফল্ট').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('রিজিওন (REGION)').length).toBeGreaterThan(0);
    expect(screen.getByText('প্রজেক্ট এক্সিকিউটিভ')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('grants a permission with scope and reason, then shows the panel row', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/permission-grants', async ({ request }) => {
        lastGrant = (await request.json()) as Record<string, unknown>;
        effective = [
          ...effective,
          {
            permission: 'permission.view',
            scopeType: 'GLOBAL',
            source: 'panel_grant',
            grantId: GRANT_ID,
          },
        ];
        return HttpResponse.json({ data: { id: GRANT_ID }, meta }, { status: 201 });
      }),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    await user.type(within(dialog).getByRole('combobox', { name: /পারমিশন/ }), 'permission.view');
    await user.click(await screen.findByRole('option', { name: 'permission.view' }));
    await user.click(within(dialog).getByRole('combobox', { name: /স্কোপ/ }));
    await user.click(await screen.findByRole('option', { name: 'সারা দেশ (GLOBAL)' }));
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'Monitoring help');
    await user.click(within(dialog).getByRole('button', { name: 'দিন' }));
    expect(await screen.findByText('পারমিশন দেওয়া হয়েছে')).toBeInTheDocument();
    expect(lastGrant).toEqual({
      userId: EXECUTIVE.id,
      permission: 'permission.view',
      effect: 'grant',
      scopeType: 'GLOBAL',
      reason: 'Monitoring help',
    });
    expect((await screen.findAllByText('প্যানেল')).length).toBeGreaterThan(0);
  }, 15_000);

  it('shows the message of a refused change', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/permission-grants', () =>
        HttpResponse.json(
          {
            error: {
              code: 'permission.grant_refused',
              messageKey: 'errors.permission.grant_refused',
              message: 'এই পারমিশন পরিবর্তন অনুমোদিত নয়।',
              params: { rule: 'sensitive_to_volunteer' },
              requestId: 'req_test',
            },
          },
          { status: 403 },
        ),
      ),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    await user.type(within(dialog).getByRole('combobox', { name: /পারমিশন/ }), 'permission.view');
    await user.click(await screen.findByRole('option', { name: 'permission.view' }));
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'Trying it');
    await user.click(within(dialog).getByRole('button', { name: 'দিন' }));
    expect(
      await within(dialog).findByText('এই পারমিশন পরিবর্তন অনুমোদিত নয়।'),
    ).toBeInTheDocument();
  });

  it('ends a panel grant with a reason', async () => {
    const user = userEvent.setup();
    effective = [
      {
        permission: 'permission.view',
        scopeType: 'GLOBAL',
        source: 'panel_grant',
        grantId: GRANT_ID,
      },
    ];
    let ended: unknown = null;
    server.use(
      http.post('*/api/v1/permission-grants/:grantId/revoke', async ({ params, request }) => {
        ended = { id: params.grantId, ...((await request.json()) as object) };
        effective = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(
      (await screen.findAllByRole('button', { name: 'permission.view প্রত্যাহার' }))[0]!,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'পারমিশন প্রত্যাহার' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'No longer needed');
    await user.click(within(dialog).getByRole('button', { name: 'প্রত্যাহার করুন' }));
    expect(await screen.findByText('পারমিশন প্রত্যাহার করা হয়েছে')).toBeInTheDocument();
    expect(ended).toEqual({ id: GRANT_ID, reason: 'No longer needed' });
  });

  it('shows why ending a grant failed, inside the dialog', async () => {
    const user = userEvent.setup();
    effective = [
      {
        permission: 'permission.view',
        scopeType: 'GLOBAL',
        source: 'panel_grant',
        grantId: GRANT_ID,
      },
    ];
    server.use(
      http.post('*/api/v1/permission-grants/:grantId/revoke', () =>
        HttpResponse.json(
          {
            error: {
              code: 'permission.not_found',
              messageKey: 'errors.permission.not_found',
              message: 'পাওয়া যায়নি।',
              requestId: 'req_test',
            },
          },
          { status: 404 },
        ),
      ),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(
      (await screen.findAllByRole('button', { name: 'permission.view প্রত্যাহার' }))[0]!,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'পারমিশন প্রত্যাহার' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'No longer needed');
    await user.click(within(dialog).getByRole('button', { name: 'প্রত্যাহার করুন' }));
    expect(await within(dialog).findByText('পাওয়া যায়নি।')).toBeInTheDocument();
  });

  it('shows a field error at its field and an unshown one above the form', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/permission-grants', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              details: [
                {
                  path: 'reason',
                  code: 'validation.too_long',
                  messageKey: 'x',
                  message: 'লেখা অনেক লম্বা।',
                },
                {
                  path: 'userId',
                  code: 'validation.required',
                  messageKey: 'x',
                  message: 'ঘরটি পূরণ করুন।',
                },
              ],
              requestId: 'req_test',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    await user.type(within(dialog).getByRole('combobox', { name: /পারমিশন/ }), 'permission.view');
    await user.click(await screen.findByRole('option', { name: 'permission.view' }));
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'Long reason');
    await user.click(within(dialog).getByRole('button', { name: 'দিন' }));
    expect(await within(dialog).findByText('লেখা অনেক লম্বা।')).toBeInTheDocument();
    expect(within(dialog).getByText('কিছু তথ্য সঠিক নয়।')).toBeInTheDocument();
  });

  it('shows an error instead of an empty list when the permissions do not load, and retries', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get('*/api/v1/users/:userId/effective-permissions', () =>
        fail
          ? HttpResponse.json(
              {
                error: {
                  code: 'server.internal',
                  messageKey: 'errors.server.internal',
                  message: 'কিছু একটা ভুল হয়েছে।',
                  requestId: 'req_failed',
                },
              },
              { status: 500 },
            )
          : HttpResponse.json({ data: effective, meta }),
      ),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    // a server error is retried twice by the query client before the error state shows
    const retry = await screen.findByRole(
      'button',
      { name: /আবার চেষ্টা করুন/ },
      { timeout: 8000 },
    );
    expect(screen.queryByText('এই ব্যবহারকারীর কোনো পারমিশন নেই।')).not.toBeInTheDocument();
    fail = false;
    await user.click(retry);
    expect((await screen.findAllByText('application.review')).length).toBeGreaterThan(0);
  }, 15_000);

  it('renders in English without accessibility violations', async () => {
    const { container } = renderPanel({ ...ME, roles: ['monitoring_team'] }, 'en');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Permission panel' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('hides the menu item from a Program Manager', async () => {
    renderPanel(ME, 'bn', '/admin');
    const nav = await screen.findByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).getByRole('link', { name: 'আমার কাজ' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'পারমিশন' })).not.toBeInTheDocument();
  });

  it('shows the forbidden screen to a Program Manager at the panel address', async () => {
    renderPanel(ME);
    expect(await screen.findByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /ব্যবহারকারী খুঁজুন/ })).not.toBeInTheDocument();
  });
});
