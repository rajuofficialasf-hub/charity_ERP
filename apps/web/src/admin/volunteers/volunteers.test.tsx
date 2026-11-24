import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { VolunteersPage } from './VolunteersPage';
import type { MessageKey } from '@css/shared/i18n';
import { expectOnScreenColumns, serveExports } from '../../../test/msw/exports';

// The volunteer tab: counts that filter, search, filters that
// open in place with their chips, the row menu, numbered pages; the filters in the URL and the
// search never. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const DAEE: Me = { ...ME, roles: ['official_daee'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const UPAZILA = '01900000-0000-7000-8000-0000000000d3';
const UNION = '01900000-0000-7000-8000-0000000000d4';
const PROJECT_ID = '01900000-0000-7000-8000-0000000000c1';

const row = (over: Record<string, unknown> = {}) => ({
  id: '01900000-0000-7000-8000-0000000000a1',
  userId: '01900000-0000-7000-8000-0000000000a2',
  displayName: 'নমুনা স্বেচ্ছাসেবক',
  type: 'general',
  state: 'active',
  divisionId: DIVISION,
  districtId: DISTRICT,
  upazilaId: UPAZILA,
  photoFileId: null,
  blocked: false,
  projects: [],
  ...over,
});
const STATS = {
  volunteers: {
    total: 1250,
    active: 1100,
    pending: 75,
    blocked: 25,
    deactivated: 40,
    rejected: 10,
  },
  applications: { total: 3400, approved: 2100, underReview: 800 },
};

const failure = (status: number) =>
  HttpResponse.json(
    {
      error: {
        code: status === 429 ? 'rate_limit.exceeded' : 'server.internal',
        messageKey: 'errors.server.internal',
        message: 'Something went wrong.',
        requestId: 'req_failed',
      },
    },
    { status },
  );

let listUrls: URL[];
let statUrls: URL[];

function serve(
  rows: unknown[] = [row()],
  stats: unknown = STATS,
  fail: { list?: number; stats?: number } = {},
) {
  listUrls = [];
  statUrls = [];
  server.use(
    http.get('*/api/v1/volunteers', ({ request }) => {
      listUrls.push(new URL(request.url));
      if (fail.list) return failure(fail.list);
      return HttpResponse.json({
        data: rows,
        meta: { requestId: 'req_test', limit: 10, nextCursor: null, prevCursor: null, total: 1 },
      });
    }),
    http.get('*/api/v1/projects', () =>
      HttpResponse.json({
        data: [
          {
            id: PROJECT_ID,
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
    http.get('*/api/v1/volunteers/statistics', ({ request }) => {
      statUrls.push(new URL(request.url));
      if (fail.stats) return failure(fail.stats);
      return HttpResponse.json({ data: stats, meta: { requestId: 'req_test' } });
    }),
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const [id, name] =
        parent === null
          ? [DIVISION, 'ঢাকা বিভাগ']
          : parent === DIVISION
            ? [DISTRICT, 'ঢাকা জেলা']
            : parent === DISTRICT
              ? [UPAZILA, 'সাভার উপজেলা']
              : [UNION, 'সাভার ইউনিয়ন'];
      return HttpResponse.json({
        data: [{ id, parentId: parent, level: 'x', code: 'x', name: { bn: name, en: name } }],
      });
    }),
  );
}

const open = (initialPath = '/admin/volunteers') =>
  renderApp(<VolunteersPage />, 'bn', { path: '/admin/volunteers', initialPath });

/** Opens the filters in place, under the search. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^ফিল্টার/, expanded: false }));
}

beforeEach(() => {
  resetClientForTests();
});

describe('the volunteer tab', () => {
  it('offers the export, with the table’s own columns ticked first, in its order', async () => {
    refreshAs(HEAD);
    // the head sees the category, so the page shows its column
    serve([row({ category: 'A', inactiveFlag: false })]);
    serveExports('volunteers');
    const user = userEvent.setup();
    open();
    await expectOnScreenColumns(
      user,
      'volunteers',
      (id) => `admin.volunteers.column.${id}` as MessageKey,
    );
  });

  it('offers no export to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serve();
    serveExports('volunteers');
    open();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'এক্সপোর্ট' })).toBeNull());
  });

  it('shows the counts and the rows, in English digits, without accessibility violations', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    expect(screen.getByText('মানবসম্পদ ও মাঠপর্যায়ের সমন্বয়')).toBeInTheDocument();
    expect(
      screen.getByText('নিয়োগ, দক্ষতা, প্রাপ্যতা এবং কর্মসূচিতে দায়িত্ব বণ্টন করুন।'),
    ).toBeInTheDocument();
    const counts = await screen.findByRole('group', { name: 'স্বেচ্ছাসেবকের হিসাব' });
    expect(await within(counts).findByRole('button', { name: 'সব 1,250' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // the application counts sit behind the last card, with a rejected registration told apart
    expect(within(counts).getByRole('button', { name: /^আরও অবস্থা/ })).toHaveTextContent('4টি');
    expect((await screen.findAllByText('নমুনা স্বেচ্ছাসেবক')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('সাভার উপজেলা, ঢাকা জেলা')).length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('filters by a count card, keeps it in the URL and asks the list, not the counts, with it', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { router } = open();
    await user.click(
      await screen.findByRole('button', { name: 'অনুমোদনের অপেক্ষায় 75', pressed: false }),
    );
    await waitFor(() => expect(router.state.location.search).toBe('?state=pending'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('state')).toBe('pending'));
    // the other cards keep their numbers
    expect(statUrls.at(-1)?.searchParams.get('state')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'সক্রিয় 1,100', pressed: false }),
    ).toBeInTheDocument();
  });

  it('restores the filters from the URL of a reload or a shared link', async () => {
    refreshAs(HEAD);
    serve();
    open(`/admin/volunteers?districtId=${DISTRICT}&type=both&blocked=true`);
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(0));
    const first = listUrls[0]!.searchParams;
    expect(first.get('districtId')).toBe(DISTRICT);
    expect(first.get('type')).toBe('both');
    expect(first.get('blocked')).toBe('true');
  });

  it('filters by a project picked by its name and sends its id', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { router } = open();
    await openFilters(user);
    const [picker] = await screen.findAllByRole('combobox', { name: /প্রকল্প/ });
    await user.click(picker!);
    await user.click(await screen.findByRole('option', { name: 'শীতবস্ত্র বিতরণ · 2026 (WC)' }));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('projectId')).toBe(PROJECT_ID));
    expect(router.state.location.search).toBe(`?projectId=${PROJECT_ID}`);
    // the active filter shows as a chip that removes it
    await user.click(await screen.findByRole('button', { name: 'প্রকল্প: শীতবস্ত্র বিতরণ সরান' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('sends a search to the server and never puts it in the URL', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { router } = open();
    await user.type(await screen.findByRole('searchbox'), '01712345678');
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('q')).toBe('01712345678'));
    expect(router.state.location.search).not.toContain('01712345678');
  });

  it('offers the category filter and column only to roles that see categories', async () => {
    refreshAs(HEAD);
    serve([row({ category: 'A', inactiveFlag: false })]);
    const user = userEvent.setup();
    open();
    expect(
      (await screen.findAllByRole('columnheader', { name: 'ক্যাটাগরি' })).length,
    ).toBeGreaterThan(0);
    await openFilters(user);
    expect(screen.getAllByRole('combobox', { name: /ক্যাটাগরি/ }).length).toBeGreaterThan(0);
  });

  it('shows no category to an Official দায়ী, whose answer carries none', async () => {
    refreshAs(DAEE);
    serve();
    open();
    expect((await screen.findAllByText('নমুনা স্বেচ্ছাসেবক')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: 'ক্যাটাগরি' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ক্যাটাগরি/ })).not.toBeInTheDocument();
  });

  it('tells a person who sees by area why the tab is empty, and a global role nothing more', async () => {
    refreshAs(DAEE);
    serve([]);
    const first = open();
    expect(
      await screen.findByText('এই ফিল্টারে কোনো স্বেচ্ছাসেবক পাওয়া যায়নি।'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/আপনি শুধু নিজের চলমান প্রকল্পের এলাকার স্বেচ্ছাসেবকদের দেখতে পান।/),
    ).toBeInTheDocument();
    expect(screen.getByText(/বাড়তি এলাকা যোগ করতে বলুন/)).toBeInTheDocument();
    first.unmount();

    resetClientForTests();
    refreshAs(HEAD);
    serve([]);
    open();
    expect(
      await screen.findByText('এই ফিল্টারে কোনো স্বেচ্ছাসেবক পাওয়া যায়নি।'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/বাড়তি এলাকা যোগ করতে বলুন/)).not.toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serve();
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('স্বেচ্ছাসেবক');
    expect(listUrls).toEqual([]);
  });

  // 429 is not retried by the query client, so the error shows at once (5xx is retried with backoff)
  it('shows an error with a retry when the list fails, and asks again on retry', async () => {
    refreshAs(HEAD);
    serve([row()], STATS, { list: 429 });
    const user = userEvent.setup();
    open();
    const retry = await screen.findByRole('button', { name: /আবার চেষ্টা করুন/ });
    const before = listUrls.length;
    await user.click(retry);
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(before));
  });

  it('keeps the rows when only the counts fail, and says so', async () => {
    refreshAs(HEAD);
    serve([row()], STATS, { stats: 429 });
    open();
    expect((await screen.findAllByText('নমুনা স্বেচ্ছাসেবক')).length).toBeGreaterThan(0);
    expect(await screen.findByText('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'স্বেচ্ছাসেবকের হিসাব' })).not.toBeInTheDocument();
  });

  it('shows the inactive count only when the answer has it', async () => {
    refreshAs(HEAD);
    serve([row()], { ...STATS, volunteers: { ...STATS.volunteers, inactive: 7 } });
    const user = userEvent.setup();
    const { router } = open();
    const counts = await screen.findByRole('group', { name: 'স্বেচ্ছাসেবকের হিসাব' });
    await user.click(await within(counts).findByRole('button', { name: /^আরও অবস্থা/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'নিষ্ক্রিয় 7' }));
    await waitFor(() => expect(router.state.location.search).toBe('?category=inactive'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('category')).toBe('inactive'));
    expect(statUrls.at(-1)?.searchParams.get('category')).toBeNull();
    // the card is not a filter of the panel: no count on the button, and clearing keeps it
    await openFilters(user);
    await user.click(await screen.findByRole('combobox', { name: /ধরন/ }));
    await user.click(await screen.findByRole('option', { name: 'স্থানীয় দায়ী' }));
    await waitFor(() => expect(router.state.location.search).toContain('type=local_daee'));
    await user.click(screen.getByRole('button', { name: 'সব মুছুন' }));
    await waitFor(() => expect(router.state.location.search).toBe('?category=inactive'));
  });

  it('sets the type and the blocklist filters in the URL, and clearing keeps the chosen count', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { router } = open('/admin/volunteers?state=pending');
    await openFilters(user);
    await user.click(await screen.findByRole('combobox', { name: /ধরন/ }));
    await user.click(await screen.findByRole('option', { name: 'স্থানীয় দায়ী' }));
    await waitFor(() => expect(router.state.location.search).toContain('type=local_daee'));
    await user.click(screen.getByRole('combobox', { name: /ব্লকলিস্ট/ }));
    await user.click(await screen.findByRole('option', { name: 'ব্লকলিস্টে আছে' }));
    await waitFor(() => expect(router.state.location.search).toContain('blocked=true'));
    await waitFor(() => {
      const last = listUrls.at(-1)!.searchParams;
      expect([last.get('state'), last.get('type'), last.get('blocked')]).toEqual([
        'pending',
        'local_daee',
        'true',
      ]);
    });
    expect(screen.getByRole('button', { name: 'ধরন: স্থানীয় দায়ী সরান' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'সব মুছুন' }));
    await waitFor(() => expect(router.state.location.search).toBe('?state=pending'));
  });

  it('opens a page by its number, says what it shows, and starts again at the first page when the URL changes', async () => {
    refreshAs(HEAD);
    serve();
    server.use(
      http.get('*/api/v1/volunteers', ({ request }) => {
        listUrls.push(new URL(request.url));
        return HttpResponse.json({
          data: [row()],
          meta: {
            requestId: 'req_test',
            limit: 10,
            nextCursor: 'next-page',
            prevCursor: null,
            total: 23,
          },
        });
      }),
    );
    const user = userEvent.setup();
    const { router } = open();
    expect(await screen.findByText('1–1 দেখানো হচ্ছে · মোট 23 জন')).toBeInTheDocument();
    const pager = screen.getByRole('navigation', { name: 'স্বেচ্ছাসেবক: পাতা বদল' });
    expect(listUrls.at(-1)?.searchParams.get('limit')).toBe('10');
    await user.click(within(pager).getByRole('button', { name: 'পাতা 3' }));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('page')).toBe('3'));
    expect(listUrls.at(-1)?.searchParams.get('cursor')).toBeNull();
    await router.navigate('/admin/volunteers?state=active');
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('state')).toBe('active'));
    expect(listUrls.at(-1)?.searchParams.get('page')).toBeNull();
  });

  it('offers the row actions each role may use, and opens the block and device dialogs', async () => {
    refreshAs(HEAD);
    serve([
      row(),
      row({ id: '01900000-0000-7000-8000-0000000000a3', displayName: 'নতুন জন', state: 'pending' }),
    ]);
    server.use(
      http.get('*/api/v1/users/:userId/sessions', () =>
        HttpResponse.json({ data: [], meta: { requestId: 'req_test' } }),
      ),
    );
    const user = userEvent.setup();
    open();
    const table = await screen.findByRole('table', { name: 'স্বেচ্ছাসেবক' });
    await user.click(await within(table).findByRole('button', { name: 'নতুন জন-এর কাজ' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['প্রোফাইল দেখুন', 'নিবন্ধন রিভিউ করুন', 'ব্লক করুন', 'ডিভাইস ও সেশন']);
    await user.click(within(menu).getByRole('menuitem', { name: 'ব্লক করুন' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'বাতিল' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(
      await within(table).findByRole('button', { name: 'নমুনা স্বেচ্ছাসেবক-এর কাজ' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'ডিভাইস ও সেশন' }));
    expect(
      await screen.findByRole('dialog', { name: 'নমুনা স্বেচ্ছাসেবক-এর ডিভাইস' }),
    ).toBeInTheDocument();
  });

  it('offers only the profile to a role without the other actions', async () => {
    refreshAs(DAEE);
    serve();
    const user = userEvent.setup();
    open();
    const table = await screen.findByRole('table', { name: 'স্বেচ্ছাসেবক' });
    await user.click(
      await within(table).findByRole('button', { name: 'নমুনা স্বেচ্ছাসেবক-এর কাজ' }),
    );
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['প্রোফাইল দেখুন']);
  });
});
