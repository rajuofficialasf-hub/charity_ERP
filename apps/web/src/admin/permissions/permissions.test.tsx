import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderInShell } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { AdminLayout } from '../AdminLayout';
import { PermissionsPage } from './PermissionsPage';
import { stubScreen } from '../../../test/match-media';

// The permission panel screen (docs/ui/SCREENS.md "Permission panel"; docs/security/RBAC.md,
// "Permission panel"). Test data only.
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
let overrides: Record<string, unknown>[];
const PROJECT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a55';
const DHAKA = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a77';
const HEAD_USER = {
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a11',
  displayName: 'ডিপার্টমেন্ট হেড (নমুনা)',
};
/** A live panel override as the API lists it. */
const override = (over: Record<string, unknown> = {}) => ({
  id: GRANT_ID,
  permission: 'permission.view',
  title: { bn: 'কার কী পারমিশন আছে দেখা', en: 'View who holds which permissions' },
  effect: 'grant',
  scopeType: 'GLOBAL',
  scopeRef: null,
  scopeName: null,
  condition: null,
  reason: 'নজরদারির সহায়তা',
  expiresAt: null,
  grantedAt: '2026-11-20T04:00:00.000Z',
  grantedBy: HEAD_USER,
  ...over,
});

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
          {
            name: 'application.review',
            title: { bn: 'আবেদন রিভিউ করা', en: 'Review applications' },
            module: 'M08',
            sensitive: false,
            description: 'Review',
          },
          {
            name: 'permission.view',
            title: { bn: 'কার কী পারমিশন আছে দেখা', en: 'View who holds which permissions' },
            module: 'M02',
            sensitive: false,
            description: 'View',
          },
        ],
        meta,
      }),
    ),
    http.get('*/api/v1/users/:userId/effective-permissions', () =>
      HttpResponse.json({ data: effective, meta }),
    ),
    http.get('*/api/v1/users/:userId/permission-overrides', () =>
      HttpResponse.json({ data: overrides, meta }),
    ),
    http.get('*/api/v1/projects', () =>
      HttpResponse.json({
        data: [
          {
            id: PROJECT,
            code: 'WC',
            year: 2026,
            sessionLabel: '2026',
            name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
            status: 'active',
          },
        ],
        meta: { nextCursor: null, prevCursor: null },
      }),
    ),
    http.get('*/api/v1/locations', ({ request }) =>
      HttpResponse.json({
        data: new URL(request.url).searchParams.get('parentId')
          ? []
          : [{ id: DHAKA, name: { bn: 'ঢাকা', en: 'Dhaka' }, postCode: null }],
        meta,
      }),
    ),
  );
}

/** Adds a permission to the dialog's list by a part of its name. */
async function addPermission(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  text: string,
  option: RegExp,
) {
  await user.type(within(dialog).getByRole('combobox', { name: /পারমিশন যোগ করুন/ }), text);
  await user.click(await screen.findByRole('option', { name: option }));
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
  overrides = [];
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
    // each permission by its name, with its code beside it
    expect(within(section).getAllByText('আবেদন রিভিউ করা').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('application.review').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('রোলের ডিফল্ট').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('রিজিওন (REGION)').length).toBeGreaterThan(0);
    expect(screen.getByText('প্রজেক্ট এক্সিকিউটিভ')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    // the whole page's journey and an axe scan, as the other journeys of this file
  }, 20_000);

  it('gives several permissions by name on a project chosen by name, then lists what is given', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/permission-grants', async ({ request }) => {
        lastGrant = (await request.json()) as Record<string, unknown>;
        overrides = [
          override({
            scopeType: 'PROJECT',
            scopeRef: PROJECT,
            scopeName: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
            reason: 'Monitoring help',
          }),
        ];
        return HttpResponse.json({ data: [{ id: GRANT_ID }], meta }, { status: 201 });
      }),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    // found by the Bengali name, and the code beside it
    await addPermission(user, dialog, 'কার কী', /^কার কী পারমিশন আছে দেখা · permission\.view$/);
    await addPermission(user, dialog, 'রিভিউ', /^আবেদন রিভিউ করা · application\.review$/);
    const chosen = within(dialog).getByRole('list', { name: 'বাছাই করা পারমিশন' });
    expect(within(chosen).getAllByRole('listitem')).toHaveLength(2);
    // one taken out again, and added back
    await user.click(within(chosen).getByRole('button', { name: 'আবেদন রিভিউ করা বাদ দিন' }));
    expect(within(chosen).getAllByRole('listitem')).toHaveLength(1);
    await addPermission(user, dialog, 'রিভিউ', /^আবেদন রিভিউ করা · application\.review$/);
    await user.click(within(dialog).getByRole('combobox', { name: /স্কোপ/ }));
    await user.click(await screen.findByRole('option', { name: 'প্রজেক্ট (PROJECT)' }));
    const submit = within(dialog).getByRole('button', { name: 'দিন' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'Monitoring help');
    // a project scope names the project: no id is typed
    expect(submit).toBeDisabled();
    expect(within(dialog).queryByRole('textbox', { name: /আইডি/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: /প্রকল্প/ }));
    await user.click(await screen.findByRole('option', { name: 'শীতবস্ত্র বিতরণ · 2026 (WC)' }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(await screen.findByText('পারমিশন দেওয়া হয়েছে')).toBeInTheDocument();
    expect(lastGrant).toEqual({
      userId: EXECUTIVE.id,
      permissions: ['permission.view', 'application.review'],
      effect: 'grant',
      scopeType: 'PROJECT',
      scopeRef: PROJECT,
      reason: 'Monitoring help',
    });
    const given = await screen.findByRole('region', { name: 'যা দেওয়া আছে' });
    const row = (await within(given).findByText('কার কী পারমিশন আছে দেখা')).closest('li')!;
    expect(within(row).getByText('প্রজেক্ট (PROJECT): শীতবস্ত্র বিতরণ')).toBeInTheDocument();
    expect(within(row).getByText('কারণ: Monitoring help')).toBeInTheDocument();
  }, 20_000);

  it('takes a permission away in a region chosen by name until a date, and starts empty again', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/permission-grants', async ({ request }) => {
        lastGrant = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: [{ id: GRANT_ID }], meta }, { status: 201 });
      }),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    await user.click(within(dialog).getByRole('radio', { name: 'পারমিশন সরিয়ে নেওয়া' }));
    const submit = within(dialog).getByRole('button', { name: 'সরিয়ে নিন' });
    await addPermission(user, dialog, 'application', /^আবেদন রিভিউ করা · application\.review$/);
    await user.click(within(dialog).getByRole('combobox', { name: /স্কোপ/ }));
    await user.click(await screen.findByRole('option', { name: 'রিজিওন (REGION)' }));
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), ' Not here ');
    // a scope of a region names the division, chosen from the address list
    expect(submit).toBeDisabled();
    expect(within(dialog).queryByRole('combobox', { name: /জেলা/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: /বিভাগ/ }));
    await user.click(await screen.findByRole('option', { name: 'ঢাকা' }));
    expect(submit).toBeEnabled();
    const date = within(dialog).getByRole('group', { name: /^মেয়াদ শেষের তারিখ/ });
    await user.click(within(date).getAllByRole('spinbutton')[0]!);
    await user.keyboard('31122026');
    await user.click(submit);
    expect(await screen.findByText('পারমিশন সরিয়ে নেওয়া হয়েছে')).toBeInTheDocument();
    expect(lastGrant).toEqual({
      userId: EXECUTIVE.id,
      permissions: ['application.review'],
      effect: 'revoke',
      scopeType: 'REGION',
      scopeRef: DHAKA,
      reason: 'Not here',
      expiresAt: '2026-12-31T23:59:59+06:00',
    });
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const again = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    expect(within(again).getByRole('radio', { name: 'পারমিশন দেওয়া' })).toBeChecked();
    expect(within(again).getByRole('textbox', { name: /কারণ/ })).toHaveValue('');
    expect(
      within(again).queryByRole('list', { name: 'বাছাই করা পারমিশন' }),
    ).not.toBeInTheDocument();
  }, 20_000);

  it('keeps the box ready for the next permission, stops at twenty, and says when the project list fails', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 21 }, (_, i) => ({
      name: `test.permission_${String(i).padStart(2, '0')}`,
      title: { bn: `পরীক্ষার পারমিশন ${i}`, en: `Test permission ${i}` },
      module: 'M02',
      sensitive: false,
      description: 'Test',
    }));
    let projectReads = 0;
    server.use(
      http.get('*/api/v1/permissions', () => HttpResponse.json({ data: many, meta })),
      // refused quickly, so the read is not tried again in the background
      http.get('*/api/v1/projects', () => {
        projectReads += 1;
        return HttpResponse.json(
          { error: { code: 'rate_limited', message: 'Too many requests' } },
          { status: 429 },
        );
      }),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(await screen.findByRole('button', { name: 'পারমিশন দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পারমিশন দিন' });
    await addPermission(user, dialog, 'পরীক্ষার', /^পরীক্ষার পারমিশন 0 · /);
    // the box is empty and has the focus again, so the next one is typed at once
    const box = () => within(dialog).getByRole('combobox', { name: /পারমিশন যোগ করুন/ });
    await waitFor(() => expect(box()).toHaveFocus());
    expect(box()).toHaveValue('');
    for (let i = 1; i < 20; i += 1) {
      await user.paste('পরীক্ষার');
      await user.click(
        await screen.findByRole('option', { name: new RegExp(`^পরীক্ষার পারমিশন ${i} · `) }),
      );
      // the twentieth fills the list, and the box is closed then
      if (i < 19) await waitFor(() => expect(box()).toHaveFocus());
    }
    const chosen = within(dialog).getByRole('list', { name: 'বাছাই করা পারমিশন' });
    expect(within(chosen).getAllByRole('listitem')).toHaveLength(20);
    // twenty at once: the box takes no more and says why
    expect(box()).toBeDisabled();
    expect(
      within(dialog).getByText('একসঙ্গে 20টির বেশি বাছা যায় না। আগে এগুলো দিন, তারপর বাকিগুলো।'),
    ).toBeInTheDocument();
    await user.click(within(chosen).getByRole('button', { name: 'পরীক্ষার পারমিশন 3 বাদ দিন' }));
    expect(box()).toBeEnabled();

    // a project list that cannot be read is said, with a retry, not shown as an empty list
    await user.click(within(dialog).getByRole('combobox', { name: /স্কোপ/ }));
    await user.click(await screen.findByRole('option', { name: 'প্রজেক্ট (PROJECT)' }));
    const retry = await within(dialog).findByRole('button', { name: 'আবার চেষ্টা করুন' });
    expect(within(dialog).queryByRole('combobox', { name: /প্রকল্প/ })).not.toBeInTheDocument();
    const before = projectReads;
    await user.click(retry);
    await waitFor(() => expect(projectReads).toBeGreaterThan(before));
  }, 30_000);

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
    await addPermission(user, dialog, 'permission', /permission\.view$/);
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'Trying it');
    await user.click(within(dialog).getByRole('button', { name: 'দিন' }));
    expect(
      await within(dialog).findByText('এই পারমিশন পরিবর্তন অনুমোদিত নয়।'),
    ).toBeInTheDocument();
  });

  it('withdraws a permission given in the panel with a reason', async () => {
    const user = userEvent.setup();
    overrides = [override()];
    let ended: unknown = null;
    server.use(
      http.post('*/api/v1/permission-grants/:grantId/revoke', async ({ params, request }) => {
        ended = { id: params.grantId, ...((await request.json()) as object) };
        overrides = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    const given = await screen.findByRole('region', { name: 'যা দেওয়া আছে' });
    await user.click(
      await within(given).findByRole('button', { name: 'কার কী পারমিশন আছে দেখা প্রত্যাহার' }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'পারমিশন প্রত্যাহার' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'No longer needed');
    await user.click(within(dialog).getByRole('button', { name: 'প্রত্যাহার করুন' }));
    expect(await screen.findByText('পারমিশন প্রত্যাহার করা হয়েছে')).toBeInTheDocument();
    expect(ended).toEqual({ id: GRANT_ID, reason: 'No longer needed' });
    expect(
      await within(given).findByText('প্যানেল থেকে আলাদা করে কিছু দেওয়া নেই।'),
    ).toBeInTheDocument();
  });

  it('lists what is taken away with who, when and why, and gives it back with a reason', async () => {
    const user = userEvent.setup();
    overrides = [
      override({
        permission: 'application.review',
        title: { bn: 'আবেদন রিভিউ করা', en: 'Review applications' },
        effect: 'revoke',
        scopeType: 'PROJECT',
        scopeRef: PROJECT,
        scopeName: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
        reason: 'এই প্রকল্পে নয়',
        expiresAt: '2026-12-31T17:59:59.000Z',
      }),
    ];
    let ended: unknown = null;
    server.use(
      http.post('*/api/v1/permission-grants/:grantId/revoke', async ({ params, request }) => {
        ended = { id: params.grantId, ...((await request.json()) as object) };
        overrides = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { container } = renderPanel(HEAD);
    await chooseExecutive(user);
    const taken = await screen.findByRole('region', { name: 'যা সরিয়ে নেওয়া আছে' });
    const row = (await within(taken).findByText('আবেদন রিভিউ করা')).closest('li')!;
    expect(within(row).getByText('application.review')).toBeInTheDocument();
    expect(within(row).getByText('প্রজেক্ট (PROJECT): শীতবস্ত্র বিতরণ')).toBeInTheDocument();
    expect(within(row).getByText(/^ডিপার্টমেন্ট হেড \(নমুনা\) করেছেন, /)).toBeInTheDocument();
    expect(within(row).getByText('কারণ: এই প্রকল্পে নয়')).toBeInTheDocument();
    expect(within(row).getByText(/^মেয়াদ .+ পর্যন্ত$/)).toBeInTheDocument();
    expect(
      within(await screen.findByRole('region', { name: 'যা দেওয়া আছে' })).getByText(
        'প্যানেল থেকে আলাদা করে কিছু দেওয়া নেই।',
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(within(row).getByRole('button', { name: 'আবেদন রিভিউ করা ফিরিয়ে দিন' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'সরিয়ে নেওয়া পারমিশন ফিরিয়ে দিন',
    });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'Needed again');
    await user.click(within(dialog).getByRole('button', { name: 'ফিরিয়ে দিন' }));
    expect(await screen.findByText('পারমিশন ফিরিয়ে দেওয়া হয়েছে')).toBeInTheDocument();
    expect(ended).toEqual({ id: GRANT_ID, reason: 'Needed again' });
  }, 20_000);

  it('shows why ending an override failed, inside the dialog', async () => {
    const user = userEvent.setup();
    overrides = [override()];
    server.use(
      http.post('*/api/v1/permission-grants/:grantId/revoke', () =>
        HttpResponse.json(
          {
            error: {
              code: 'permission.grant_refused',
              messageKey: 'errors.permission.grant_refused',
              message: 'এই পারমিশন পরিবর্তন অনুমোদিত নয়।',
              params: { rule: 'key_permission_admin_only' },
              requestId: 'req_test',
            },
          },
          { status: 403 },
        ),
      ),
    );
    renderPanel(HEAD);
    await chooseExecutive(user);
    await user.click(
      await screen.findByRole('button', { name: 'কার কী পারমিশন আছে দেখা প্রত্যাহার' }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'পারমিশন প্রত্যাহার' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'No longer needed');
    await user.click(within(dialog).getByRole('button', { name: 'প্রত্যাহার করুন' }));
    expect(
      await within(dialog).findByText('এই পারমিশন পরিবর্তন অনুমোদিত নয়।'),
    ).toBeInTheDocument();
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
    await addPermission(user, dialog, 'permission', /permission\.view$/);
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
    const { container } = renderPanel({ ...ME, roles: ['admin'] }, 'en');
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

  it('keeps the panel from the Monitoring Team: no menu item, and the forbidden screen at its address', async () => {
    const monitoring = { ...ME, roles: ['monitoring_team'] };
    const menu = renderPanel(monitoring, 'bn', '/admin');
    const nav = await screen.findByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).queryByRole('link', { name: 'পারমিশন' })).not.toBeInTheDocument();
    menu.unmount();
    renderPanel(monitoring);
    expect(await screen.findByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeInTheDocument();
  });

  it('shows the forbidden screen to a Program Manager at the panel address', async () => {
    renderPanel(ME);
    expect(await screen.findByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /ব্যবহারকারী খুঁজুন/ })).not.toBeInTheDocument();
  });
});
