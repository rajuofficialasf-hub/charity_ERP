import type { Me } from '@css/shared/auth';
import { isoDateInDhaka } from '@css/shared/format';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { NisabPage } from './NisabPage';

// The nisab page: the version in force, the versions with their effective dates, add and
// withdraw. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const DAY = 86_400_000;
/** A fixed noon in Dhaka, so the dates never cross a day boundary while the test runs. */
const NOW = new Date('2026-10-17T06:00:00Z');
const day = (offset: number) => isoDateInDhaka(new Date(NOW.getTime() + offset * DAY));
const person = { id: '01900000-0000-7000-8000-0000000000c1', name: 'নমুনা পিএম' };

const VERSIONS = [
  {
    id: '01900000-0000-7000-8000-0000000000a3',
    value: '102000.00',
    effectiveFrom: day(30),
    basisNote: null,
    setBy: person,
    createdAt: '2026-10-17T05:00:00.000Z',
    inForce: false,
    withdrawn: null,
  },
  {
    id: '01900000-0000-7000-8000-0000000000a2',
    value: '98500.50',
    effectiveFrom: day(-10),
    basisNote: 'রুপার দাম',
    setBy: person,
    createdAt: '2026-10-07T05:00:00.000Z',
    inForce: true,
    withdrawn: null,
  },
];

let added: unknown[];
let withdrawn: { id: string; body: unknown }[];
let listed: number;

function serve() {
  added = [];
  withdrawn = [];
  listed = 0;
  server.use(
    http.get('*/api/v1/nisab-versions', () => {
      listed += 1;
      return HttpResponse.json({ data: VERSIONS, meta: {} });
    }),
    http.post('*/api/v1/nisab-versions', async ({ request }) => {
      const body = (await request.json()) as { effectiveFrom: string };
      added.push(body);
      if (body.effectiveFrom === day(31))
        return HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              requestId: 'req_x',
              details: [
                {
                  path: 'effectiveFrom',
                  code: 'nisab.effective_date',
                  message: 'কার্যকর তারিখ আজ বা পরের হতে হবে।',
                },
              ],
            },
          },
          { status: 422 },
        );
      return HttpResponse.json({ data: { ...VERSIONS[0], ...body }, meta: {} }, { status: 201 });
    }),
    http.post('*/api/v1/nisab-versions/:id/withdraw', async ({ params, request }) => {
      withdrawn.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json({
        data: { ...VERSIONS[0], withdrawn: { at: '', by: person, reason: 'ভুল' } },
        meta: {},
      });
    }),
  );
}

const open = () => renderApp(<NisabPage />, 'bn', { path: '/admin/nisab' });

beforeEach(() => {
  resetClientForTests();
  // only the date is fixed; timers stay real for the user events
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the nisab page', () => {
  it('shows the nisab in force and the versions with their effective dates', async () => {
    refreshAs(PM);
    serve();
    const { container } = open();
    const table = await screen.findByRole('table', { name: 'নিসাবের ভার্সন' });
    expect(screen.getByText('নীতিমালা ও সীমা')).toBeInTheDocument();
    const counts = within(await screen.findByRole('region', { name: 'নিসাবের হিসাব' }));
    expect(counts.getByText('আজ কার্যকর নিসাব')).toBeInTheDocument();
    expect(counts.getByText('সংরক্ষিত ভার্সন')).toBeInTheDocument();
    // the versions kept: every row of the table but its header
    expect(
      counts.getByText(String(within(table).getAllByRole('row').length - 1), { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'পরিবর্তনের ইতিহাস' }),
    ).toBeInTheDocument();
    const [d, m, y] = [day(-10).slice(8), day(-10).slice(5, 7), day(-10).slice(0, 4)];
    expect(within(table).getByText(`${d}-${m}-${y}`)).toBeInTheDocument();
    expect(within(table).getByText('কার্যকর')).toBeInTheDocument();
    expect(within(table).getByText('আসন্ন')).toBeInTheDocument();
    // only the version not yet in effect can be withdrawn
    expect(within(table).getAllByRole('button', { name: /প্রত্যাহার$/ })).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it('adds a version and shows the server message on the date it refuses', async () => {
    refreshAs(PM);
    serve();
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'নতুন নিসাব' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন নিসাব' });
    await user.type(within(dialog).getByRole('textbox', { name: /^পরিমাণ/ }), '105000');
    const [y, m, d] = day(31).split('-');
    const date = within(dialog).getByRole('group', { name: /^কার্যকর তারিখ/ });
    await user.click(within(date).getAllByRole('spinbutton')[0]!);
    await user.keyboard(`${d}${m}${y}`);
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText('কার্যকর তারিখ আজ বা পরের হতে হবে।'),
    ).toBeInTheDocument();
    expect(added[0]).toEqual({ value: '105000', effectiveFrom: day(31) });
  });

  it('withdraws a version not yet in effect with a reason', async () => {
    refreshAs(PM);
    serve();
    open();
    const user = userEvent.setup();
    const [button] = await screen.findAllByRole('button', { name: /প্রত্যাহার$/ });
    await user.click(button!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'ভুল তারিখ লেখা হয়েছিল');
    await user.click(within(dialog).getByRole('button', { name: 'প্রত্যাহার' }));
    await waitFor(() =>
      expect(withdrawn[0]).toEqual({
        id: VERSIONS[0]!.id,
        body: { reason: 'ভুল তারিখ লেখা হয়েছিল' },
      }),
    );
  });

  it('shows the forbidden content to an RPM', async () => {
    refreshAs(RPM);
    serve();
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('নিসাব');
    expect(listed).toBe(0);
  });
});
