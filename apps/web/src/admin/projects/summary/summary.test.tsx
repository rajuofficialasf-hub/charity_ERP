import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../api/client';
import { ProjectFrame } from '../frame/ProjectFrame';
import { ProjectOverviewPage } from '../ProjectOverviewPage';

// The summary tab of a session: the stat cards, the facts said once, the whole session's counts
// for the holders of the overview, and the strip of the session's stages. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const PROCUREMENT: Me = { ...ME, roles: ['procurement_team'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const SERIES = '01900000-0000-7000-8000-0000000000d1';
const PROGRAM = '01900000-0000-7000-8000-0000000000b1';

const COUNTS = {
  applications: 1240,
  approved: 860,
  waiting: 37,
  waitlisted: 12,
  volunteers: 48,
  districts: 6,
  target: 2000,
  daysLeft: 45,
};

let summaryReads: number;

function serve(over: Record<string, unknown> = {}, counts: Record<string, unknown> = COUNTS) {
  summaryReads = 0;
  server.use(
    http.get(`*/api/v1/projects/${ID}`, () =>
      HttpResponse.json({
        data: {
          id: ID,
          code: 'WNT',
          year: 2026,
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          status: 'active',
          workflowKey: 'distribution',
          // a window that holds today whenever the test runs
          applyFrom: '2020-01-01',
          applyTo: '2099-12-31',
          perVolunteerLimit: 50,
          dawahEnabled: false,
          programId: PROGRAM,
          seriesId: SERIES,
          periodFrom: '2026-06',
          periodTo: '2027-07',
          sessionLabel: '2026-27',
          targetBeneficiaries: 2000,
          budgetPlanned: '3000000.00',
          activatedAt: '2026-06-02T04:00:00Z',
          ...over,
        },
        meta: { etag: '"p1"' },
      }),
    ),
    http.get(`*/api/v1/project-series/${SERIES}`, () =>
      HttpResponse.json({
        data: {
          id: SERIES,
          programId: PROGRAM,
          code: 'WNT',
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          description: null,
          coverFileId: null,
          sessionCount: 1,
          beneficiaries: 0,
          current: null,
          canCreate: true,
          program: { id: PROGRAM, name: { bn: 'হিউম্যানিটেরিয়ান প্রোগ্রাম', en: 'Humanitarian' } },
          sessions: [],
        },
        meta: {},
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/summary`, () => {
      summaryReads += 1;
      return HttpResponse.json({ data: counts, meta: {} });
    }),
    http.get('*/api/v1/program-cards', () => HttpResponse.json({ data: [], meta: {} })),
  );
}

const open = () =>
  renderApp(<ProjectFrame />, 'bn', {
    path: '/admin/projects/:projectId',
    initialPath: `/admin/projects/${ID}`,
    children: [{ index: true, element: <ProjectOverviewPage /> }],
  });

/** The figure of a stat card, found by its label. */
async function stat(label: string) {
  const card = (await screen.findByText(label)).closest('[class*="MuiCard"], a, div')!;
  return card.parentElement!.textContent;
}

beforeEach(() => {
  resetClientForTests();
});

describe('the summary of a session', () => {
  it('shows the period, the limit, the budget and the program as stat cards, without accessibility violations', async () => {
    refreshAs(PM);
    serve();
    const { container } = open();
    expect(await stat('প্রকল্পের মেয়াদ')).toContain('06-2026 – 07-2027');
    expect(await stat('প্রতি স্বেচ্ছাসেবকের আবেদন সীমা')).toContain('50');
    expect(await stat('পরিকল্পিত বাজেট')).toContain('৳ 30,00,000');
    expect(
      await screen.findByRole('heading', { name: 'প্রকল্পের সারসংক্ষেপ' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('puts the target in the budget’s place for a caller who may not see the budget', async () => {
    refreshAs(RPM);
    serve({ budgetPlanned: undefined });
    open();
    expect(await stat('লক্ষ্য (জন)')).toContain('2,000');
    expect(screen.queryByText('পরিকল্পিত বাজেট')).not.toBeInTheDocument();
  });

  it('says each fact once: the facts card leaves out what the stat cards show', async () => {
    refreshAs(PM);
    serve();
    open();
    const facts = (await screen.findByRole('heading', { name: 'প্রকল্পের মূল তথ্য' })).closest(
      '.MuiCard-root',
    ) as HTMLElement;
    expect(within(facts).getByText('কোড')).toBeInTheDocument();
    expect(within(facts).getByText('ওয়ার্কফ্লো')).toBeInTheDocument();
    expect(within(facts).getByText('আবেদনের সময়সীমা')).toBeInTheDocument();
    for (const shown of ['সময়কাল', 'প্রতি স্বেচ্ছাসেবকের আবেদন সীমা', 'পরিকল্পিত বাজেট'])
      expect(within(facts).queryByText(shown)).not.toBeInTheDocument();
  });

  it('counts the whole session in English digits, the applications leading to their list', async () => {
    refreshAs(RPM);
    serve();
    open();
    const counts = (await screen.findByRole('heading', { name: 'প্রকল্পের সারসংক্ষেপ' })).closest(
      '.MuiCard-root',
    ) as HTMLElement;
    expect(await within(counts).findByText('1,240')).toBeInTheDocument();
    for (const [label, value] of [
      ['অনুমোদিত', '860'],
      ['পর্যালোচনার অপেক্ষায়', '37'],
      ['অপেক্ষমাণ তালিকা', '12'],
      ['স্বেচ্ছাসেবক', '48'],
      ['জেলা', '6'],
    ]) {
      expect(within(counts).getByText(label!)).toBeInTheDocument();
      expect(within(counts).getByText(value!)).toBeInTheDocument();
    }
    expect(within(counts).getByRole('link', { name: /মোট আবেদন/ })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/applications`,
    );
  });

  it('shows the Procurement Team no counts and reads none', async () => {
    refreshAs(PROCUREMENT);
    serve();
    open();
    expect(await screen.findByRole('heading', { name: 'বাস্তবায়ন অগ্রগতি' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'প্রকল্পের সারসংক্ষেপ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(summaryReads).toBe(0);
  });

  it('marks the stage of an active session inside its window, with the approved against the target and the days left', async () => {
    refreshAs(PM);
    serve();
    open();
    const strip = await screen.findByRole('list', { name: 'সেশনের ধাপ' });
    const stages = within(strip).getAllByRole('listitem');
    expect(stages.map((li) => li.firstChild?.textContent)).toEqual([
      'খসড়া',
      'আবেদন গ্রহণ',
      'আবেদন শেষ',
      'বন্ধ হচ্ছে',
      'বন্ধ',
    ]);
    expect(stages[1]).toHaveAttribute('aria-current', 'step');
    expect(stages[1]).toHaveTextContent('01-01-2020 – 31-12-2099');
    const bar = await screen.findByRole('progressbar', { name: 'লক্ষ্যের বিপরীতে অনুমোদিত' });
    expect(bar).toHaveAttribute('aria-valuenow', '860');
    expect(bar).toHaveAttribute('aria-valuemax', '2000');
    expect(screen.getByText('আবেদনের আর 45 দিন বাকি')).toBeInTheDocument();
  });

  it('says when the window has not opened yet, and shows no bar without a target', async () => {
    refreshAs(PM);
    serve({ applyFrom: '2099-01-01', targetBeneficiaries: null }, { ...COUNTS, target: null });
    open();
    const strip = await screen.findByRole('list', { name: 'সেশনের ধাপ' });
    expect(within(strip).getAllByRole('listitem')[1]).toHaveTextContent('শুরু হবে 01-01-2099');
    expect(await screen.findByText('1,240')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('marks a session past its window and a closed one, with its close date', async () => {
    refreshAs(PM);
    serve({ applyTo: '2020-12-31' }, { ...COUNTS, daysLeft: null });
    const first = open();
    let strip = await screen.findByRole('list', { name: 'সেশনের ধাপ' });
    expect(within(strip).getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText(/দিন বাকি/)).not.toBeInTheDocument();
    first.unmount();
    serve(
      { status: 'closed', applyTo: '2020-12-31', closedAt: '2027-07-31T10:00:00Z' },
      { ...COUNTS, daysLeft: null },
    );
    open();
    strip = await screen.findByRole('list', { name: 'সেশনের ধাপ' });
    const closed = within(strip).getAllByRole('listitem')[4]!;
    expect(closed).toHaveAttribute('aria-current', 'step');
    expect(closed).toHaveTextContent('31-07-2027');
  });

  it('says a cancelled session has no stages', async () => {
    refreshAs(PM);
    serve({ status: 'cancelled' });
    open();
    expect(
      await screen.findByText('এই সেশন বাতিল হয়েছে, তাই এর কোনো ধাপ নেই।'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'সেশনের ধাপ' })).not.toBeInTheDocument();
  });
});
