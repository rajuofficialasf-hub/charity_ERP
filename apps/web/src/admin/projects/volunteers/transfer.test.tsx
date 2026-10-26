import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../lib/api';
import { ProjectVolunteersPage } from './ProjectVolunteersPage';
import { TransferPage } from './TransferPage';

// The application transfer: the official picks the volunteer, ticks their applications or all of
// them, picks the new volunteer or adds one, decides on the team where allowed, reads the limit
// warning before confirming and gives the reason. Test data only.
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const EXECUTIVE: Me = { ...ME, roles: ['project_executive'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const id = (n: number) => `01900000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`;
const assignment = (n: number, name: string, counted: number) => ({
  id: id(n),
  volunteerId: id(10 + n),
  displayName: name,
  type: 'general',
  regionLocationId: id(90),
  permissionSet: 'application_distribution',
  isPaid: false,
  consentStatus: 'accepted',
  consentAt: '2026-10-17T05:00:00Z',
  applicationsCounted: counted,
  assignedAt: '2026-10-17T05:00:00Z',
});
const OLD = assignment(1, 'করিম উদ্দিন', 3);
const NEW = assignment(2, 'রহিম মিয়া', 2);
const APPS = [
  { id: id(31), appNo: 'WC-2026-00011', beneficiaryName: 'প্রথম জন', status: 'submitted' },
  { id: id(32), appNo: 'WC-2026-00012', beneficiaryName: 'দ্বিতীয় জন', status: 'draft' },
];

let sent: { key: string | null; body: unknown }[];
function serve() {
  sent = [];
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
          perVolunteerLimit: 3,
          dawahEnabled: false,
        },
        meta: {},
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/volunteers`, () =>
      HttpResponse.json({ data: [OLD, NEW], meta: { nextCursor: null, prevCursor: null } }),
    ),
    http.get(`*/api/v1/projects/${ID}/volunteer-candidates`, () =>
      HttpResponse.json({
        data: [
          {
            volunteerId: id(50),
            displayName: 'ফাতেমা বেগম',
            type: 'general',
            divisionId: id(90),
            districtId: id(91),
            upazilaId: id(92),
            unionId: id(93),
            defaultPermissionSet: 'application_distribution',
          },
        ],
        meta: { nextCursor: null, prevCursor: null },
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/volunteers/${OLD.volunteerId}/applications`, () =>
      HttpResponse.json({ data: APPS, meta: {} }),
    ),
    http.post(`*/api/v1/projects/${ID}/transfers`, async ({ request }) => {
      sent.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      return HttpResponse.json({
        data: { batchId: id(70), moved: [id(31), id(32)], teamMoved: 0, overLimit: true },
        meta: {},
      });
    }),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [], meta: {} })),
    http.get(`*/api/v1/projects/${ID}/staff`, () => HttpResponse.json({ data: [], meta: {} })),
  );
}

beforeEach(() => {
  resetClientForTests();
});

const open = (me: Me, from = `?from=${OLD.volunteerId}`, locale: 'bn' | 'en' = 'bn') => {
  refreshAs(me);
  serve();
  return renderApp(<TransferPage />, locale, {
    path: '/admin/projects/:projectId/transfer',
    initialPath: `/admin/projects/${ID}/transfer${from}`,
  });
};

describe('the transfer', () => {
  it('is opened beside a volunteer of the project', async () => {
    refreshAs(RPM);
    serve();
    renderApp(<ProjectVolunteersPage />, 'bn', {
      path: '/admin/projects/:projectId/volunteers',
      initialPath: `/admin/projects/${ID}/volunteers`,
    });
    // the table and the phone's card each draw the row
    const [link] = await screen.findAllByRole('link', { name: 'আবেদন হস্তান্তর: করিম উদ্দিন' });
    expect(link).toHaveAttribute('href', `/admin/projects/${ID}/transfer?from=${OLD.volunteerId}`);
  });

  it('ticks all, warns over the limit before confirming, needs a reason, and names the moved count', async () => {
    const user = userEvent.setup();
    const view = open(RPM);
    await user.click(await screen.findByRole('checkbox', { name: 'সব বাছুন' }));
    expect(screen.getByText('2টি বাছাই করা')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /নতুন স্বেচ্ছাসেবক$/ }));
    await user.click(await screen.findByRole('option', { name: 'রহিম মিয়া' }));
    // the new volunteer holds two; two more go over the limit of three
    expect(
      screen.getByText(/হস্তান্তরের পর নতুন স্বেচ্ছাসেবকের আবেদন হবে 4টি, প্রকল্পের সীমা 3টি।/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'টিমও নতুন স্বেচ্ছাসেবকের অধীনে যাবে' }),
    ).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'হস্তান্তর করুন' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /হস্তান্তরের কারণ/ }), 'এলাকা বদল');
    await expectNoAxeViolations(view.container);
    await user.click(confirm);
    expect(await screen.findByText(/2টি আবেদন হস্তান্তর হয়েছে।/)).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.key).toBeTruthy();
    expect(sent[0]!.body).toEqual({
      fromVolunteerId: OLD.volunteerId,
      toVolunteerId: NEW.volunteerId,
      applicationIds: [id(31), id(32)],
      reason: 'এলাকা বদল',
      moveTeam: false,
      assign: false,
    });
  });

  it('adds a volunteer to the project with the handover, and offers no team move without the right', async () => {
    const user = userEvent.setup();
    open(EXECUTIVE);
    await user.click(await screen.findByRole('checkbox', { name: /প্রথম জন/ }));
    expect(screen.getByText('1টি বাছাই করা')).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'টিমও নতুন স্বেচ্ছাসেবকের অধীনে যাবে' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: /নতুন স্বেচ্ছাসেবক$/ }));
    await user.click(
      await screen.findByRole('option', { name: 'ফাতেমা বেগম · প্রকল্পে নতুন যুক্ত করে দিন' }),
    );
    await user.type(screen.getByRole('textbox', { name: /হস্তান্তরের কারণ/ }), 'নতুন দায়িত্ব');
    await user.click(screen.getByRole('button', { name: 'হস্তান্তর করুন' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({
      toVolunteerId: id(50),
      applicationIds: [id(31)],
      assign: true,
    });
  });

  it('shows a refused transfer and a failed list of applications', async () => {
    const user = userEvent.setup();
    open(RPM);
    server.use(
      http.post(`*/api/v1/projects/${ID}/transfers`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'নতুন স্বেচ্ছাসেবক সক্রিয় নন বা ব্লক করা আছেন।',
              requestId: 'req_test',
            },
          },
          { status: 422 },
        ),
      ),
    );
    await user.click(await screen.findByRole('checkbox', { name: /প্রথম জন/ }));
    await user.click(screen.getByRole('button', { name: /নতুন স্বেচ্ছাসেবক$/ }));
    await user.click(await screen.findByRole('option', { name: 'রহিম মিয়া' }));
    await user.type(screen.getByRole('textbox', { name: /হস্তান্তরের কারণ/ }), 'এলাকা বদল');
    await user.click(screen.getByRole('button', { name: 'হস্তান্তর করুন' }));
    expect(
      await screen.findByText('নতুন স্বেচ্ছাসেবক সক্রিয় নন বা ব্লক করা আছেন।'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/আবেদন হস্তান্তর হয়েছে/)).toBeNull();
  });

  it('offers a retry when the applications of the volunteer cannot be read', async () => {
    open(RPM);
    server.use(
      http.get(`*/api/v1/projects/${ID}/volunteers/${OLD.volunteerId}/applications`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'permission.denied',
              messageKey: 'errors.permission.denied',
              message: 'অনুমতি নেই',
              requestId: 'req_test',
            },
          },
          { status: 403 },
        ),
      ),
    );
    expect(await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeInTheDocument();
  });

  it('reads in English too', async () => {
    const view = open(RPM, `?from=${OLD.volunteerId}`, 'en');
    expect(await screen.findByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hand over' })).toBeDisabled();
    await expectNoAxeViolations(view.container);
  });
});
