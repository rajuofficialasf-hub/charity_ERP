import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { OrganogramPage } from './OrganogramPage';

// The department's organogram (DECISION_LOG D-097): leadership, programs with their reporting
// lines, and the officials without a place. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };

const node = (userId: string, displayName: string, jobId: string, reports: unknown[] = []) => ({
  userId,
  displayName,
  jobId,
  designation: null,
  roles: [],
  state: 'active',
  homeDivisionId: null,
  reports,
});
const CHART = {
  leadership: [node('h', 'ডিপার্টমেন্ট হেড', 'CSS-001')],
  programs: [
    {
      programId: 'p1',
      code: 'HUM',
      name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' },
      active: true,
      members: [
        node('pm', 'প্রোগ্রাম ম্যানেজার', 'CSS-102', [
          node('rpm', 'আরপিএম ঢাকা', 'CSS-201', [node('ex', 'প্রজেক্ট এক্সিকিউটিভ', 'CSS-301')]),
        ]),
      ],
    },
  ],
  unplaced: [{ ...node('x', 'অবস্থানহীন', 'CSS-399'), state: 'pending' }],
};

let asked: number;
function serve() {
  asked = 0;
  server.use(
    http.get('*/api/v1/organogram', () => {
      asked += 1;
      return HttpResponse.json({ data: CHART, meta: {} });
    }),
    http.get('*/api/v1/roles', () => HttpResponse.json({ data: [], meta: {} })),
  );
}

const open = () => renderApp(<OrganogramPage />, 'bn', { path: '/admin/staff/organogram' });

beforeEach(() => {
  resetClientForTests();
});

describe('the organogram', () => {
  it('nests each official under the supervisor inside the program card', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'অর্গানোগ্রাম' }),
    ).toBeInTheDocument();
    const program = await screen.findByRole('list', { name: 'মানবিক সহায়তা (HUM)' });
    const underPm = within(program).getByRole('list', {
      name: 'প্রোগ্রাম ম্যানেজার-এর অধীনের অফিসিয়াল',
    });
    const underRpm = within(underPm).getByRole('list', {
      name: 'আরপিএম ঢাকা-এর অধীনের অফিসিয়াল',
    });
    expect(within(underRpm).getByText('প্রজেক্ট এক্সিকিউটিভ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ডিপার্টমেন্টের নেতৃত্ব' })).toBeInTheDocument();
    const unplaced = screen.getByRole('list', { name: 'এখনও স্থান নির্ধারিত হয়নি' });
    expect(within(unplaced).getByText('পাসওয়ার্ডের অপেক্ষায়')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows the forbidden content to a volunteer and asks nothing', async () => {
    refreshAs(VOLUNTEER);
    serve();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(asked).toBe(0);
  });
});
