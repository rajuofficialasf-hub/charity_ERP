import type { OwnStaffProfile, ProjectsWork } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ProfileView } from './ProfileView';

// An official's own profile: the sections, the projects by year with the figures of their work,
// and the one line of a person every project is open to (docs/DECISION_LOG.md, the official's
// own profile of 2026-11-02).
const PROJECT = '01900000-0000-7000-8000-0000000000e1';
const OLDER = '01900000-0000-7000-8000-0000000000e2';
const PROGRAM = '01900000-0000-7000-8000-0000000000e3';
const DIVISION = '01900000-0000-7000-8000-0000000000e4';

const official = (over: Partial<OwnStaffProfile> = {}): OwnStaffProfile => ({
  id: ME.id,
  displayName: 'রহিম উদ্দিন',
  jobId: 'CSS-0042',
  designation: 'আঞ্চলিক ব্যবস্থাপক',
  roles: [
    {
      key: 'regional_program_manager',
      name: { bn: 'আঞ্চলিক প্রোগ্রাম ম্যানেজার', en: 'Regional Program Manager' },
    },
  ],
  affiliation: 'department',
  affiliationUnit: null,
  program: { id: PROGRAM, name: { bn: 'মানবিক কার্যক্রম', en: 'Humanitarian Program' } },
  supervisor: { id: '01900000-0000-7000-8000-0000000000e5', name: 'করিম আহমেদ' },
  mobile: '01700000401',
  email: 'rahim@example.org',
  state: 'active',
  lastLoginAt: '2026-11-01T04:00:00.000Z',
  photoFileId: null,
  ...over,
});

const figures = (received: number, approved: number, medianDays: number | null) => ({
  area: { received, waiting: 3, approved, rejected: 1, waitlisted: 2, volunteers: 12 },
  mine: { reviewed: 5, approved, rejected: 1, waitlisted: 0, medianDays },
});

const WORK: ProjectsWork = {
  everyProject: false,
  years: [
    {
      year: 2026,
      projects: [
        {
          id: PROJECT,
          code: 'WC26',
          name: { bn: 'শীতবস্ত্র ২০২৬', en: 'Winter clothing 2026' },
          year: 2026,
          status: 'active',
          program: { id: PROGRAM, name: { bn: 'মানবিক কার্যক্রম', en: 'Humanitarian Program' } },
          applyFrom: '2026-11-01',
          applyTo: '2026-12-15',
          roles: [
            {
              key: 'regional_program_manager',
              name: { bn: 'আঞ্চলিক প্রোগ্রাম ম্যানেজার', en: 'Regional Program Manager' },
            },
          ],
          areas: [{ id: DIVISION, name: { bn: 'ঢাকা', en: 'Dhaka' } }],
          wholeProject: false,
          figures: figures(120, 80, 2.5),
        },
      ],
    },
    {
      year: 2025,
      projects: [
        {
          id: OLDER,
          code: 'IF25',
          name: { bn: 'ইফতার ২০২৫', en: 'Iftar 2025' },
          year: 2025,
          status: 'closed',
          program: { id: PROGRAM, name: { bn: 'মানবিক কার্যক্রম', en: 'Humanitarian Program' } },
          applyFrom: null,
          applyTo: null,
          roles: [
            {
              key: 'regional_program_manager',
              name: { bn: 'আঞ্চলিক প্রোগ্রাম ম্যানেজার', en: 'Regional Program Manager' },
            },
          ],
          areas: [{ id: DIVISION, name: { bn: 'ঢাকা', en: 'Dhaka' } }],
          wholeProject: false,
          figures: figures(40, 30, null),
        },
      ],
    },
  ],
};

let calls: { method: string; url: string; body: unknown }[] = [];

function serve(profile: OwnStaffProfile, work: ProjectsWork = WORK, requests: unknown[] = []) {
  server.use(
    http.get('*/api/v1/me/profile', () => HttpResponse.json({ data: profile })),
    http.get('*/api/v1/me/projects-work', () => HttpResponse.json({ data: work })),
    http.get('*/api/v1/me/change-requests', () =>
      HttpResponse.json({
        data: requests,
        meta: { requestId: 'r', limit: 50, nextCursor: null, prevCursor: null },
      }),
    ),
    http.post('*/api/v1/me/staff-change-requests*', async ({ request }) => {
      const body = await request.json().catch(() => null);
      calls.push({ method: 'POST', url: new URL(request.url).pathname, body });
      if (request.url.includes('/otp')) return new HttpResponse(null, { status: 204 });
      return HttpResponse.json(
        {
          data: {
            id: '01900000-0000-7000-8000-0000000000f1',
            userId: ME.id,
            volunteerId: null,
            kind: 'profile_edit',
            field: (body as { field: string }).field,
            note: null,
            status: 'submitted',
            decidedAt: null,
          },
        },
        { status: 201 },
      );
    }),
  );
}

beforeEach(() => {
  resetClientForTests();
  calls = [];
  refreshAs({ ...ME, kind: 'staff', roles: ['regional_program_manager'] });
});

describe("an official's own profile", () => {
  it('shows the person and their workplace, then the contact and account, one section at a time', async () => {
    const user = userEvent.setup();
    serve(official());
    const { container } = renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'রহিম উদ্দিন' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Profile sections' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Identity and workplace', 'Contact and account', 'My projects']);
    const identity = screen.getByRole('region', { name: 'Identity and workplace' });
    for (const text of [
      'CSS-0042',
      'Regional Program Manager',
      'Humanitarian Program',
      'করিম আহমেদ',
    ])
      expect(within(identity).getByText(text)).toBeInTheDocument();
    // the account names no area: the projects section shows where the person works
    expect(within(identity).queryByText(/division/i)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(within(nav).getByRole('button', { name: 'Contact and account' }));
    const contact = screen.getByRole('region', { name: 'Contact and account' });
    expect(within(contact).getByText('01700000401')).toBeInTheDocument();
    expect(within(contact).getByText('rahim@example.org')).toBeInTheDocument();
    expect(within(contact).getByRole('link', { name: 'Change password' })).toHaveAttribute(
      'href',
      '/account/password',
    );
    expect(within(contact).getByRole('link', { name: 'My devices' })).toHaveAttribute(
      'href',
      '/account/sessions',
    );
  });

  it('lays out the projects by year, newest first, with the figures of the area and the own decisions', async () => {
    const user = userEvent.setup();
    serve(official());
    const { container } = renderApp(<ProfileView />, 'bn', { path: '/account/profile' });
    await screen.findByRole('heading', { level: 2, name: 'রহিম উদ্দিন' });
    await user.click(screen.getByRole('button', { name: 'আমার প্রকল্প' }));
    const years = await screen.findAllByRole('heading', { level: 3 });
    expect(years.map((h) => h.textContent)).toEqual(['2026 সাল', '2025 সাল']);
    const card = screen.getByRole('article', { name: 'শীতবস্ত্র ২০২৬' });
    // the project opens from its name for an official who may see projects
    expect(within(card).getByRole('link', { name: 'শীতবস্ত্র ২০২৬' })).toHaveAttribute(
      'href',
      `/admin/projects/${PROJECT}`,
    );
    const received = within(card).getByText('এসেছে').closest('div')!;
    expect(within(received).getByText('120')).toBeInTheDocument();
    const median = within(card).getByText('সিদ্ধান্তে সময় (মধ্যমা)').closest('div')!;
    expect(within(median).getByText('2.5 দিন')).toBeInTheDocument();
    // English digits in both languages, and an older project without a decision says so
    const older = screen.getByRole('article', { name: 'ইফতার ২০২৫' });
    expect(within(older).getByText('ঠিক করা হয়নি')).toBeInTheDocument();
    expect(
      within(within(older).getByText('সিদ্ধান্তে সময় (মধ্যমা)').closest('div')!).getByText('—'),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('gives a person every project is open to one line and the project list', async () => {
    const user = userEvent.setup();
    refreshAs({ ...ME, kind: 'staff', roles: ['department_head'] });
    serve(official({ roles: [] }), { everyProject: true, years: [] });
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('heading', { level: 2, name: 'রহিম উদ্দিন' });
    await user.click(screen.getByRole('button', { name: 'My projects' }));
    expect(
      await screen.findByText('Every project is open to you, so there is no separate list here.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Project list' })).toHaveAttribute(
      'href',
      '/admin/projects',
    );
  });

  it('says so when the official works on no project yet', async () => {
    const user = userEvent.setup();
    serve(official(), { everyProject: false, years: [] });
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('heading', { level: 2, name: 'রহিম উদ্দিন' });
    await user.click(screen.getByRole('button', { name: 'My projects' }));
    expect(await screen.findByText('You do not work on any project yet.')).toBeInTheDocument();
  });
});

describe("an official's own change request", () => {
  it('asks for a new designation from the edit mode and says who decides', async () => {
    const user = userEvent.setup();
    serve(official());
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('heading', { level: 2, name: 'রহিম উদ্দিন' });
    await user.click(await screen.findByRole('button', { name: 'Edit Identity and workplace' }));
    await user.click(screen.getByRole('checkbox', { name: 'Change Designation' }));
    const field = screen.getByRole('textbox', { name: 'Designation' });
    await user.clear(field);
    await user.type(field, 'প্রোগ্রাম অফিসার');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByText(
        'Request sent. The Department Head or the Monitoring Team will decide.',
      ),
    ).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/me/staff-change-requests',
        body: { field: 'designation', newValue: 'প্রোগ্রাম অফিসার' },
      },
    ]);
  });

  it("sends a new mobile's code through the official's own route, its section marked", async () => {
    const user = userEvent.setup();
    serve(official(), WORK, [
      {
        id: '01900000-0000-7000-8000-0000000000f2',
        userId: ME.id,
        volunteerId: null,
        kind: 'profile_edit',
        field: 'mobile',
        newValue: '01700000499',
        note: null,
        status: 'open',
        decidedAt: null,
      },
    ]);
    const { container } = renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('heading', { level: 2, name: 'রহিম উদ্দিন' });
    const nav = screen.getByRole('navigation', { name: 'Profile sections' });
    const contact = within(nav).getByRole('button', { name: 'Contact and account' });
    await waitFor(() => expect(contact).toHaveAttribute('aria-describedby'));
    await user.click(contact);
    await user.click(await screen.findByRole('button', { name: 'Send code' }));
    await waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'POST',
          url: '/api/v1/me/staff-change-requests/01900000-0000-7000-8000-0000000000f2/otp',
          body: null,
        },
      ]),
    );
    await expectNoAxeViolations(container);
  });
});
