import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { MyProjectPage } from './MyProjectPage';
import { MyProjectsPage } from './MyProjectsPage';
import { TeamPage } from './TeamPage';

// A volunteer's own projects: the list, the consent to the rules part by part, the work facts
// after it, and the team. Test data only.
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const member = '01900000-0000-7000-8000-0000000000f1';
const candidate = '01900000-0000-7000-8000-0000000000f2';

const base = {
  projectId: ID,
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  status: 'active',
  applyFrom: '2026-11-01',
  applyTo: '2026-12-31',
  perVolunteerLimit: 50,
  dawahEnabled: false,
  via: 'assignment',
  permissionSet: 'application_distribution',
  isPaid: false,
  consentStatus: 'pending',
  rulesVersion: 2,
  applicationsCounted: 7,
  applicationsLeft: 43,
  leadsTeam: true,
};
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
const PARTS = [
  { part: 'volunteer_duties', text: text('সময়মতো উপস্থিত থাকুন') },
  { part: 'implementation_process', text: text('তালিকা মিলিয়ে বিতরণ') },
  { part: 'misconduct', text: text('অনিয়মে অ্যাসাইনমেন্ট শেষ') },
];

let state: Record<string, unknown>;
let answers: unknown[];
let consentStatus: number;

function serve(over: Record<string, unknown> = {}, parts = PARTS) {
  state = { ...base, ...over };
  answers = [];
  consentStatus = 200;
  server.use(
    http.get('*/api/v1/me/projects', () => HttpResponse.json({ data: [state], meta: {} })),
    http.get(`*/api/v1/me/projects/${ID}`, () =>
      HttpResponse.json({
        data: { ...state, rules: { version: state.rulesVersion, parts } },
        meta: {},
      }),
    ),
    http.post(`*/api/v1/me/projects/${ID}/consent`, async ({ request }) => {
      const body = (await request.json()) as { decision: string };
      answers.push(body);
      if (consentStatus === 409)
        return HttpResponse.json(
          {
            error: {
              code: 'project.rules_changed',
              messageKey: 'errors.project.rules_changed',
              message: 'বদলেছে',
              requestId: 'req_x',
            },
          },
          { status: 409 },
        );
      if (body.decision === 'accepted') state = { ...state, consentStatus: 'accepted' };
      return HttpResponse.json({ data: state, meta: {} });
    }),
  );
}
const openProject = () =>
  renderApp(<MyProjectPage />, 'bn', {
    path: '/my-projects/:projectId',
    initialPath: `/my-projects/${ID}`,
  });

beforeEach(() => {
  resetClientForTests();
  refreshAs(VOLUNTEER);
});

describe('my projects', () => {
  it('lists a waiting project with the way to its rules, without accessibility violations', async () => {
    serve();
    const { container } = renderApp(<MyProjectsPage />, 'bn', {
      path: '/my-projects',
      initialPath: '/my-projects',
    });
    const list = await screen.findByRole('list', { name: 'আমার প্রকল্পের তালিকা' });
    expect(within(list).getByText('শীতবস্ত্র বিতরণ (WC)')).toBeInTheDocument();
    expect(within(list).getByText('নিয়মাবলিতে সম্মতির অপেক্ষায়')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'নিয়মাবলি পড়ুন' })).toHaveAttribute(
      'href',
      `/my-projects/${ID}`,
    );
    await expectNoAxeViolations(container);
  });
});

describe('the consent to the rules', () => {
  it('walks every part, then accepts with the version and the parts, and opens the project', async () => {
    serve();
    const user = userEvent.setup();
    const { container } = openProject();
    expect(await screen.findByText('সময়মতো উপস্থিত থাকুন')).toBeInTheDocument();
    const next = () => screen.getByRole('button', { name: 'পরের ধাপ' });
    // each part is confirmed before the next one opens
    expect(next()).toBeDisabled();
    await expectNoAxeViolations(container);
    for (const words of [
      'সময়মতো উপস্থিত থাকুন',
      'তালিকা মিলিয়ে বিতরণ',
      'অনিয়মে অ্যাসাইনমেন্ট শেষ',
    ]) {
      expect(screen.getByText(words)).toBeInTheDocument();
      await user.click(screen.getByText('আমি পড়েছি এবং মেনে চলব'));
      await user.click(next());
    }
    const accept = screen.getByRole('button', { name: 'সম্মতি দিন' });
    expect(accept).toBeDisabled();
    await user.click(screen.getByText('আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী'));
    await user.click(accept);
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(answers[0]).toEqual({
      rulesVersion: 2,
      decision: 'accepted',
      parts: ['volunteer_duties', 'implementation_process', 'misconduct'],
    });
    // the project now shows its work facts and the applications counted against the limit
    expect(
      await screen.findByText('7 টি দেওয়া হয়েছে, আরও 43 টি দেওয়া যাবে'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'আমার টিম' })).toHaveAttribute(
      'href',
      `/my-projects/${ID}/team`,
    );
  }, 20_000);

  it('offers no team to a volunteer who cannot lead one', async () => {
    serve({ consentStatus: 'accepted', leadsTeam: false });
    openProject();
    expect(
      await screen.findByText('7 টি দেওয়া হয়েছে, আরও 43 টি দেওয়া যাবে'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'আমার টিম' })).not.toBeInTheDocument();
  });

  it('asks the Local দায়ী part while dawah is on', async () => {
    serve({ dawahEnabled: true }, [
      PARTS[0]!,
      PARTS[1]!,
      { part: 'daee_duties', text: text('প্রতিদিন ক্লাস নিন') },
      PARTS[2]!,
    ]);
    openProject();
    const steps = await screen.findByRole('list', { name: 'নিয়মাবলির ধাপ' });
    expect(within(steps).getByText('স্থানীয় দায়ীর দায়িত্ব')).toBeInTheDocument();
  });

  it('keeps the project waiting on a refusal', async () => {
    serve();
    const user = userEvent.setup();
    openProject();
    await user.click(await screen.findByRole('button', { name: 'প্রত্যাখ্যান করুন' }));
    await waitFor(() =>
      expect(answers).toEqual([{ rulesVersion: 2, decision: 'refused', parts: [] }]),
    );
    expect(
      await screen.findByText(
        'আপনি নিয়মাবলি প্রত্যাখ্যান করেছেন; প্রকল্পটি সম্মতির অপেক্ষায় থাকবে।',
      ),
    ).toBeInTheDocument();
  });

  it('says so when the rules changed meanwhile', async () => {
    serve({}, [PARTS[0]!]);
    consentStatus = 409;
    const user = userEvent.setup();
    openProject();
    await user.click(await screen.findByText('আমি পড়েছি এবং মেনে চলব'));
    await user.click(screen.getByRole('button', { name: 'পরের ধাপ' }));
    await user.click(screen.getByText('আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী'));
    consentStatus = 409;
    await user.click(screen.getByRole('button', { name: 'সম্মতি দিন' }));
    expect(
      await screen.findByText('নিয়মাবলি বদলেছে। নতুন নিয়মাবলি আবার পড়ুন।'),
    ).toBeInTheDocument();
  });
});

describe('the team', () => {
  it('adds a volunteer registered under the main volunteer', async () => {
    serve({ consentStatus: 'accepted' });
    const writes: { path: string; body: unknown }[] = [];
    server.use(
      http.get(`*/api/v1/me/projects/${ID}/team`, () =>
        HttpResponse.json({
          data: {
            members: [
              {
                volunteerId: member,
                displayName: 'সাকিব হাসান',
                type: 'general',
                consentStatus: 'pending',
                addedAt: '2026-10-17T05:00:00Z',
              },
            ],
            candidates: [{ volunteerId: candidate, displayName: 'নাঈম ইসলাম', type: 'general' }],
          },
          meta: {},
        }),
      ),
      http.post(`*/api/v1/me/projects/${ID}/team`, async ({ request }) => {
        writes.push({ path: 'add', body: await request.json() });
        return HttpResponse.json(
          { data: { members: [], candidates: [] }, meta: {} },
          { status: 201 },
        );
      }),
      http.post(`*/api/v1/me/projects/${ID}/team/:volunteerId/remove`, ({ params }) => {
        writes.push({ path: 'remove', body: params.volunteerId });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { container } = renderApp(<TeamPage />, 'bn', {
      path: '/my-projects/:projectId/team',
      initialPath: `/my-projects/${ID}/team`,
    });
    expect(await screen.findByText('সাকিব হাসান')).toBeInTheDocument();
    expect(screen.getByText('সম্মতির অপেক্ষায়')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByText('নাঈম ইসলাম'));
    await user.click(screen.getByRole('button', { name: 'টিমে যোগ করুন' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: 'add', body: { memberVolunteerIds: [candidate] } });
    expect(
      await screen.findByText(
        'টিমে যোগ করা হয়েছে। প্রত্যেকে নিয়মাবলিতে সম্মতি দিলে কাজ শুরু করবেন।',
      ),
    ).toBeInTheDocument();
  });

  it('removes a member from the team', async () => {
    serve({ consentStatus: 'accepted' });
    const removed: unknown[] = [];
    server.use(
      http.get(`*/api/v1/me/projects/${ID}/team`, () =>
        HttpResponse.json({
          data: {
            members: [
              {
                volunteerId: member,
                displayName: 'সাকিব হাসান',
                type: 'general',
                consentStatus: 'accepted',
                addedAt: '2026-10-17T05:00:00Z',
              },
            ],
            candidates: [],
          },
          meta: {},
        }),
      ),
      http.post(`*/api/v1/me/projects/${ID}/team/:volunteerId/remove`, ({ params }) => {
        removed.push(params.volunteerId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp(<TeamPage />, 'bn', {
      path: '/my-projects/:projectId/team',
      initialPath: `/my-projects/${ID}/team`,
    });
    await user.click(await screen.findByRole('button', { name: 'সাকিব হাসান-কে টিম থেকে সরান' }));
    await waitFor(() => expect(removed).toEqual([member]));
    expect(await screen.findByText('সাকিব হাসান-কে টিম থেকে সরানো হয়েছে।')).toBeInTheDocument();
  });
});
