import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { VolunteersPage } from './VolunteersPage';

// The volunteer tab (SCR-042; DECISION_LOG O-67): counts, state chips, search and filters, the
// filters in the URL and the search never. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const DAEE: Me = { ...ME, roles: ['official_daee'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const UPAZILA = '01900000-0000-7000-8000-0000000000d3';
const UNION = '01900000-0000-7000-8000-0000000000d4';

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
  volunteers: { total: 1250, active: 1100, pending: 75, blocked: 25, deactivated: 50 },
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
        meta: { requestId: 'req_test', limit: 25, nextCursor: null, prevCursor: null, total: 1 },
      });
    }),
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

beforeEach(() => {
  resetClientForTests();
});

describe('the volunteer tab', () => {
  it('shows the counts and the rows, in English digits, without accessibility violations', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    const counts = await screen.findByRole('region', { name: 'স্বেচ্ছাসেবকের হিসাব' });
    expect(await within(counts).findByText('1,250')).toBeInTheDocument();
    expect(within(counts).getByText('রিভিউ চলছে')).toBeInTheDocument();
    expect((await screen.findAllByText('নমুনা স্বেচ্ছাসেবক')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('সাভার উপজেলা, ঢাকা জেলা')).length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('keeps a state chip in the URL and asks the server with it', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { router } = open();
    await user.click(await screen.findByRole('button', { name: 'অপেক্ষমাণ', pressed: false }));
    await waitFor(() => expect(router.state.location.search).toBe('?state=pending'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('state')).toBe('pending'));
    expect(statUrls.at(-1)?.searchParams.get('state')).toBe('pending');
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
    open();
    expect(
      (await screen.findAllByRole('columnheader', { name: 'ক্যাটাগরি' })).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /ক্যাটাগরি/ }).length).toBeGreaterThan(0);
  });

  it('shows no category to an Official দায়ী, whose answer carries none', async () => {
    refreshAs(DAEE);
    serve();
    open();
    expect((await screen.findAllByText('নমুনা স্বেচ্ছাসেবক')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: 'ক্যাটাগরি' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ক্যাটাগরি/ })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('region', { name: 'স্বেচ্ছাসেবকের হিসাব' })).not.toBeInTheDocument();
  });

  it('shows the inactive count only when the answer has it', async () => {
    refreshAs(HEAD);
    serve([row()], { ...STATS, volunteers: { ...STATS.volunteers, inactive: 7 } });
    open();
    const counts = await screen.findByRole('region', { name: 'স্বেচ্ছাসেবকের হিসাব' });
    expect(await within(counts).findByText('নিষ্ক্রিয়')).toBeInTheDocument();
  });

  it('sets the type and the blocklist filters in the URL, and clearing keeps the state chip', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { router } = open('/admin/volunteers?state=pending');
    await user.click(await screen.findByRole('button', { name: /ধরন/ }));
    await user.click(await screen.findByRole('option', { name: 'স্থানীয় দায়ী' }));
    await waitFor(() => expect(router.state.location.search).toContain('type=local_daee'));
    await user.click(screen.getByRole('button', { name: /ব্লকলিস্ট/ }));
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
    await user.click(screen.getByRole('button', { name: 'ফিল্টার মুছুন' }));
    await waitFor(() => expect(router.state.location.search).toBe('?state=pending'));
  });

  it('starts at the first page when the URL changes from outside the tab', async () => {
    refreshAs(HEAD);
    serve();
    server.use(
      http.get('*/api/v1/volunteers', ({ request }) => {
        listUrls.push(new URL(request.url));
        return HttpResponse.json({
          data: [row()],
          meta: { requestId: 'req_test', limit: 25, nextCursor: 'next-page', prevCursor: null },
        });
      }),
    );
    const user = userEvent.setup();
    const { router } = open();
    const next = await screen.findAllByRole('button', { name: 'পরের পাতা' });
    await user.click(next[0]!);
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('cursor')).toBe('next-page'));
    await router.navigate('/admin/volunteers?state=active');
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('state')).toBe('active'));
    expect(listUrls.at(-1)?.searchParams.get('cursor')).toBeNull();
  });
});
