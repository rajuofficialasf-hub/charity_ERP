import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { AdminLayout } from '../AdminLayout';
import { DashboardPage } from '../DashboardPage';
import { HandoverPage } from './HandoverPage';

// The handover page (SCR-105, BD-08, BR-034; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U14). Test data only.
const HEAD: Me = { ...ME, displayName: 'ডিপার্টমেন্ট হেড (নমুনা)', roles: ['department_head'] };
const OFFICIAL = {
  id: '01900000-0000-7000-8000-0000000000b1',
  displayName: 'বিদায়ী আরপিএম (নমুনা)',
  designation: 'Regional Program Manager',
  roles: ['regional_program_manager'],
};
const RECEIVER = {
  id: '01900000-0000-7000-8000-0000000000b2',
  displayName: 'নতুন আরপিএম (নমুনা)',
  designation: 'Regional Program Manager',
  roles: ['regional_program_manager'],
};
const AREA = '01900000-0000-7000-8000-0000000000c1';
const PROGRAM = '01900000-0000-7000-8000-0000000000c2';
const meta = { requestId: 'req_test', limit: 20, nextCursor: null, prevCursor: null };

type Item = {
  category: string;
  itemType: string;
  itemId: string;
  projectId: string | null;
  label: string;
};
let pending: Item[];
let completedAt: string | null;
let state: string;
/** The account row's version: every handover step bumps it (permission version, D-088). */
let version: number;
let calls: { method: string; url: string; body: unknown; ifMatch: string | null }[];

const view = () => ({
  id: completedAt || pending.length < 2 ? '01900000-0000-7000-8000-0000000000e1' : null,
  fromUserId: OFFICIAL.id,
  pending,
  scope: { items: [] },
  outstandingCount: pending.length,
  completedAt,
});

async function record(request: Request) {
  const body = await request.json().catch(() => null);
  calls.push({
    method: request.method,
    url: new URL(request.url).pathname,
    body,
    ifMatch: request.headers.get('if-match'),
  });
  return body as Record<string, unknown> | null;
}

function serve() {
  server.use(
    http.get('*/api/v1/users', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      const data = q.includes('নতুন') ? [RECEIVER] : q.includes('বিদায়ী') ? [OFFICIAL] : [];
      return HttpResponse.json({ data, meta });
    }),
    http.get('*/api/v1/users/:userId', () =>
      HttpResponse.json({
        data: { ...OFFICIAL, kind: 'staff', state, isSystemOwner: false },
        meta: { requestId: 'r', etag: `"v${version}"` },
      }),
    ),
    http.get('*/api/v1/users/:userId/handover', () => HttpResponse.json({ data: view() })),
    http.post('*/api/v1/users/:userId/handover', async ({ request }) => {
      const body = await record(request);
      version += 1;
      const items = body?.items as { itemId: string }[] | undefined;
      pending = items ? pending.filter((p) => !items.some((i) => i.itemId === p.itemId)) : [];
      return HttpResponse.json({ data: view() });
    }),
    http.post('*/api/v1/users/:userId/handover/complete', async ({ request }) => {
      await record(request);
      version += 1;
      completedAt = '2026-10-12T06:00:00.000Z';
      return HttpResponse.json({ data: view() });
    }),
    http.post('*/api/v1/users/:userId/state', async ({ request }) => {
      await record(request);
      if (!completedAt)
        return HttpResponse.json(
          {
            error: {
              code: 'user.handover_required',
              message: 'অ্যাকাউন্ট বন্ধের আগে ব্যবহারকারীর অপেক্ষমাণ কাজ হস্তান্তর করুন।',
              requestId: 'r',
            },
          },
          { status: 409 },
        );
      state = 'deactivated';
      return HttpResponse.json({ data: { ...OFFICIAL, state }, meta: { etag: '"v2"' } });
    }),
  );
}

const renderPage = (me: Me, locale: 'bn' | 'en' = 'bn') => {
  refreshAs(me);
  return renderApp(<AdminLayout />, locale, {
    path: '/admin',
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'handover', element: <HandoverPage /> },
    ],
    initialPath: '/admin/handover',
  });
};

async function pick(user: ReturnType<typeof userEvent.setup>, label: RegExp, text: string) {
  await user.click(await screen.findByRole('combobox', { name: label }));
  await user.paste(text);
  await user.click(await screen.findByRole('option', { name: new RegExp(text) }));
}

beforeEach(() => {
  resetClientForTests();
  calls = [];
  completedAt = null;
  state = 'active';
  version = 1;
  pending = [
    {
      category: 'projects',
      itemType: 'project_area',
      itemId: AREA,
      projectId: null,
      label: 'WNT · ঢাকা',
    },
    {
      category: 'projects',
      itemType: 'program',
      itemId: PROGRAM,
      projectId: null,
      label: 'UCD · স্বাবলম্বী',
    },
  ];
  serve();
});

describe('handover page', () => {
  it('shows the pending work by category, with empty states for the others', async () => {
    const user = userEvent.setup();
    const { container } = renderPage(HEAD);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'হ্যান্ডওভার' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'অ্যাডমিন মেনু' });
    expect(within(nav).getByRole('link', { name: 'হ্যান্ডওভার' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await pick(user, /কর্মকর্তা খুঁজুন/, 'বিদায়ী');
    const projects = await screen.findByRole('region', { name: 'প্রজেক্ট' });
    expect(within(projects).getByText('WNT · ঢাকা')).toBeInTheDocument();
    expect(within(projects).getByText('UCD · স্বাবলম্বী')).toBeInTheDocument();
    for (const name of ['রিভিউ ও অনুমোদন', 'ডকুমেন্ট', 'ইস্যু', 'ফলোআপ'])
      expect(
        within(screen.getByRole('region', { name })).getByText('এখানে অপেক্ষমাণ কিছু নেই।'),
      ).toBeInTheDocument();
    expect(screen.getByText('সক্রিয়')).toBeInTheDocument();
    // nothing can be handed over before a receiver is chosen; completion waits for the items
    expect(screen.getByRole('button', { name: 'সব হস্তান্তর করুন' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'হ্যান্ডওভার শেষ করুন' })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it('hands one item over to the chosen official', async () => {
    const user = userEvent.setup();
    renderPage(HEAD);
    await pick(user, /কর্মকর্তা খুঁজুন/, 'বিদায়ী');
    await pick(user, /যাঁকে দেবেন/, 'নতুন');
    await user.click(await screen.findByRole('button', { name: 'WNT · ঢাকা হস্তান্তর করুন' }));
    expect(await screen.findByText('কাজ হস্তান্তর করা হয়েছে')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `/api/v1/users/${OFFICIAL.id}/handover`,
        body: { toUserId: RECEIVER.id, items: [{ itemType: 'project_area', itemId: AREA }] },
        ifMatch: null,
      },
    ]);
    expect(screen.queryByText('WNT · ঢাকা')).not.toBeInTheDocument();
    expect(screen.getByText('UCD · স্বাবলম্বী')).toBeInTheDocument();
  });

  it('deactivation is refused before the handover; after handing all over and completing it succeeds', async () => {
    const user = userEvent.setup();
    renderPage(HEAD);
    await pick(user, /কর্মকর্তা খুঁজুন/, 'বিদায়ী');

    // refused by the server while work is pending
    await user.click(await screen.findByRole('button', { name: 'নিষ্ক্রিয় করুন' }));
    let dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'চাকরি ছেড়েছেন');
    await user.click(within(dialog).getByRole('button', { name: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন' }));
    expect(
      await within(dialog).findByText(
        'অ্যাকাউন্ট বন্ধের আগে ব্যবহারকারীর অপেক্ষমাণ কাজ হস্তান্তর করুন।',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল' }));

    // everything in one action, then the completion
    await pick(user, /যাঁকে দেবেন/, 'নতুন');
    await user.click(screen.getByRole('button', { name: 'সব হস্তান্তর করুন' }));
    expect(await screen.findByText('কাজ হস্তান্তর করা হয়েছে')).toBeInTheDocument();
    const complete = screen.getByRole('button', { name: 'হ্যান্ডওভার শেষ করুন' });
    expect(complete).toBeEnabled();
    await user.click(complete);
    expect(await screen.findByText('হ্যান্ডওভার শেষ হয়েছে')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'নিষ্ক্রিয় করুন' }));
    dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'চাকরি ছেড়েছেন');
    await user.click(within(dialog).getByRole('button', { name: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন' }));
    expect(await screen.findByText('অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে')).toBeInTheDocument();
    expect(await screen.findByText('এই অ্যাকাউন্ট নিষ্ক্রিয়।')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নিষ্ক্রিয় করুন' })).not.toBeInTheDocument();

    expect(calls.map((c) => [c.url.replace(`/api/v1/users/${OFFICIAL.id}`, ''), c.body])).toEqual([
      ['/state', { state: 'deactivated', reason: 'চাকরি ছেড়েছেন' }],
      ['/handover', { toUserId: RECEIVER.id }],
      ['/handover/complete', null],
      ['/state', { state: 'deactivated', reason: 'চাকরি ছেড়েছেন' }],
    ]);
    // the deactivation carries the version after the handover steps, not the one first read
    expect(calls.at(-1)!.ifMatch).toBe('"v3"');
  }, 15_000);

  it('reads the account again after a refused deactivation, so a retry carries the new version', async () => {
    const user = userEvent.setup();
    renderPage(HEAD);
    await pick(user, /কর্মকর্তা খুঁজুন/, 'বিদায়ী');
    await user.click(await screen.findByRole('button', { name: 'নিষ্ক্রিয় করুন' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'চাকরি ছেড়েছেন');
    // another administrator changed the account meanwhile
    version = 7;
    await user.click(within(dialog).getByRole('button', { name: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন' }));
    await within(dialog).findByText(/অপেক্ষমাণ কাজ হস্তান্তর করুন/);
    completedAt = '2026-10-12T06:00:00.000Z';
    pending = [];
    await user.click(
      await within(dialog).findByRole('button', { name: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন' }),
    );
    expect(await screen.findByText('অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে')).toBeInTheDocument();
    expect(calls.at(-1)!.ifMatch).toBe('"v7"');
  });

  it('is accessible in English', async () => {
    const user = userEvent.setup();
    const { container } = renderPage(HEAD, 'en');
    await user.click(await screen.findByRole('combobox', { name: /Find the official/ }));
    await user.paste('বিদায়ী');
    await user.click(await screen.findByRole('option', { name: /বিদায়ী/ }));
    await screen.findByRole('region', { name: 'Projects' });
    await expectNoAxeViolations(container);
  });

  it('is only for the Department Head and the Monitoring Team', async () => {
    renderPage({ ...ME, roles: ['regional_program_manager'] });
    expect(await screen.findByRole('heading', { name: 'প্রবেশাধিকার নেই' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'অ্যাডমিন মেনু' });
    expect(within(nav).queryByRole('link', { name: 'হ্যান্ডওভার' })).not.toBeInTheDocument();
  });
});
