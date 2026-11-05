import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../lib/api';
import { ProjectVolunteersPage } from './ProjectVolunteersPage';

// The volunteers of a project: the assignments with set, paid flag and consent; assigning several
// at once; changing and ending one; the RPM's grant to an executive. Test data only.
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const EXECUTIVE: Me = { ...ME, roles: ['project_executive'] };
const PM: Me = { ...ME, roles: ['program_manager'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const id = (n: number) => `01900000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;
const ASSIGNED = {
  id: id(1),
  volunteerId: id(2),
  displayName: 'করিম উদ্দিন',
  type: 'both',
  regionLocationId: id(3),
  permissionSet: 'application_distribution_dawah',
  isPaid: false,
  consentStatus: 'pending',
  consentAt: null,
  applicationsCounted: 0,
  assignedAt: '2026-10-17T05:00:00Z',
};
const candidate = (n: number, name: string, type = 'general') => ({
  volunteerId: id(10 + n),
  displayName: name,
  type,
  divisionId: id(3),
  districtId: id(4),
  upazilaId: id(5),
  unionId: id(6),
  defaultPermissionSet:
    type === 'general' ? 'application_distribution' : 'application_distribution_dawah',
});

let writes: { path: string; body: unknown }[];

function serve() {
  writes = [];
  server.use(
    http.get(`*/api/v1/projects/${ID}`, () =>
      HttpResponse.json({
        data: {
          id: ID,
          code: 'WC',
          year: 2026,
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          status: 'active',
          workflowKey: 'distribution',
          applyFrom: null,
          applyTo: null,
          perVolunteerLimit: 50,
          dawahEnabled: false,
        },
        meta: {},
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/volunteers`, () =>
      HttpResponse.json({ data: [ASSIGNED], meta: { nextCursor: null, prevCursor: null } }),
    ),
    http.get(`*/api/v1/projects/${ID}/volunteer-candidates`, () =>
      HttpResponse.json({
        data: [candidate(1, 'রহিম মিয়া'), candidate(2, 'ফাতেমা বেগম', 'local_daee')],
        meta: { nextCursor: null, prevCursor: null },
      }),
    ),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [], meta: {} })),
    http.get(`*/api/v1/projects/${ID}/staff`, () =>
      HttpResponse.json({
        data: [
          {
            id: id(20),
            userId: id(21),
            displayName: 'নমুনা এক্সিকিউটিভ',
            roleKey: 'project_executive',
            areaLocationId: id(3),
            canView: true,
            canEdit: true,
            canDelete: false,
            extraPermissions: ['application.approve'],
            endedAt: null,
          },
        ],
        meta: {},
      }),
    ),
    http.post(`*/api/v1/projects/${ID}/volunteers`, async ({ request }) => {
      const body = (await request.json()) as { volunteers: { volunteerId: string }[] };
      writes.push({ path: 'assign', body });
      return HttpResponse.json(
        { data: body.volunteers.map((v) => ({ ...ASSIGNED, ...v })), meta: {} },
        { status: 201 },
      );
    }),
    http.patch('*/api/v1/project-volunteers/:id', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      writes.push({ path: 'change', body });
      return HttpResponse.json({ data: { ...ASSIGNED, ...body }, meta: {} });
    }),
    http.post('*/api/v1/project-volunteers/:id/end', async ({ request }) => {
      writes.push({ path: 'end', body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`*/api/v1/projects/${ID}/grants`, async ({ request }) => {
      writes.push({ path: 'grant', body: await request.json() });
      return HttpResponse.json({ data: [], meta: {} });
    }),
  );
}
const open = () =>
  renderApp(<ProjectVolunteersPage />, 'bn', {
    path: '/admin/projects/:projectId/volunteers',
    initialPath: `/admin/projects/${ID}/volunteers`,
  });
const assigned = () => screen.findByRole('table', { name: 'প্রকল্পে অ্যাসাইন করা স্বেচ্ছাসেবক' });

beforeEach(() => {
  resetClientForTests();
});

describe('the volunteers of a project', () => {
  it('lists the assignments with set, paid flag and consent, without accessibility violations', async () => {
    refreshAs(RPM);
    serve();
    const { container } = open();
    const table = await assigned();
    expect(await within(table).findByText('করিম উদ্দিন')).toBeInTheDocument();
    expect(within(table).getByText('আবেদন, বিতরণ ও দাওয়াহ')).toBeInTheDocument();
    expect(within(table).getByText('সম্মতির অপেক্ষায়')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('assigns the chosen volunteers with the set of their type and the paid flag', async () => {
    refreshAs(RPM);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'স্বেচ্ছাসেবক অ্যাসাইন করুন' }));
    const dialog = await screen.findByRole('dialog');
    const list = within(dialog).getByRole('table', { name: 'অ্যাসাইন করা যায় এমন স্বেচ্ছাসেবক' });
    await user.click(await within(list).findByRole('checkbox', { name: /রহিম মিয়া/ }));
    await user.click(within(list).getByRole('checkbox', { name: /ফাতেমা বেগম/ }));
    expect(within(dialog).getByText('2 জন বাছাই করা হয়েছে')).toBeInTheDocument();
    await user.click(within(dialog).getByText('পেইড স্বেচ্ছাসেবক হিসেবে চিহ্নিত করুন'));
    await user.click(within(dialog).getByRole('button', { name: 'অ্যাসাইন করুন' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      path: 'assign',
      body: {
        volunteers: [
          { volunteerId: id(11), isPaid: true },
          { volunteerId: id(12), isPaid: true },
        ],
      },
    });
    expect(await screen.findByText(/2 জন স্বেচ্ছাসেবক অ্যাসাইন হয়েছেন/)).toBeInTheDocument();
  });

  it('offers an executive no paid flag and a PM no assignment', async () => {
    refreshAs(EXECUTIVE);
    serve();
    const user = userEvent.setup();
    const first = open();
    await user.click(await screen.findByRole('button', { name: 'স্বেচ্ছাসেবক অ্যাসাইন করুন' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).queryByText('পেইড স্বেচ্ছাসেবক হিসেবে চিহ্নিত করুন'),
    ).not.toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    refreshAs(PM);
    open();
    await assigned();
    expect(
      screen.queryByRole('button', { name: 'স্বেচ্ছাসেবক অ্যাসাইন করুন' }),
    ).not.toBeInTheDocument();
  });

  it('changes the set among those of the type, and ends an assignment with a reason', async () => {
    refreshAs(RPM);
    serve();
    const user = userEvent.setup();
    open();
    const table = await assigned();
    await user.click(
      await within(table).findByRole('button', { name: 'করিম উদ্দিন-এর সেট বা পেইড বদলান' }),
    );
    const change = await screen.findByRole('dialog');
    await user.click(within(change).getByRole('combobox', { name: /অনুমতির সেট/ }));
    // a দাঈ-স্বেচ্ছাসেবক holds the two application sets, never work progress
    expect(screen.queryByRole('option', { name: 'কাজের অগ্রগতি' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'আবেদন ও বিতরণ' }));
    await user.click(within(change).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      path: 'change',
      body: { permissionSet: 'application_distribution' },
    });

    await user.click(
      await within(await assigned()).findByRole('button', {
        name: 'করিম উদ্দিন-এর অ্যাসাইনমেন্ট শেষ করুন',
      }),
    );
    const end = await screen.findByRole('dialog');
    await user.type(within(end).getByRole('textbox', { name: /কারণ/ }), 'কাজ শেষ হয়েছে');
    await user.click(within(end).getByRole('button', { name: 'শেষ করুন' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({ path: 'end', body: { reason: 'কাজ শেষ হয়েছে' } });
  });

  it('lets the RPM grant an executive the right to assign, with a reason', async () => {
    refreshAs(RPM);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(
      await screen.findByText('নমুনা এক্সিকিউটিভ: স্বেচ্ছাসেবক অ্যাসাইন করতে পারবেন'),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'মাঠের কাজে সহায়তা');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      path: 'grant',
      body: {
        userId: id(21),
        permissions: ['application.approve', 'volunteer.assign_project'],
        reason: 'মাঠের কাজে সহায়তা',
      },
    });
  });

  it('is closed to a volunteer', async () => {
    refreshAs({ ...ME, kind: 'volunteer', roles: ['volunteer_general'] });
    serve();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
