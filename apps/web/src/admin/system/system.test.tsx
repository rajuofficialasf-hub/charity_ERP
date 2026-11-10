import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { HealthPage } from './HealthPage';
import { SessionsPage } from './SessionsPage';

// The active sessions and the system health of the global roles. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };

const OFFICIAL_SESSION = {
  id: '01900000-0000-7000-8000-0000000000f1',
  person: {
    id: '01900000-0000-7000-8000-0000000000f2',
    name: 'নমুনা অফিসিয়াল',
    kind: 'staff',
    systemOwner: false,
  },
  deviceName: 'Pixel 7',
  platform: 'android',
  appVersion: '0.4.0',
  createdAt: '2026-10-17T03:00:00.000Z',
  lastSeenAt: '2026-10-17T05:00:00.000Z',
};
const OWNER_SESSION = {
  ...OFFICIAL_SESSION,
  id: '01900000-0000-7000-8000-0000000000f3',
  person: {
    id: '01900000-0000-7000-8000-0000000000f4',
    name: 'মেইন অ্যাডমিন (নমুনা)',
    kind: 'staff',
    systemOwner: true,
  },
};

const HEALTH = {
  ready: false,
  checks: { database: 'up', storage: 'down', queue: 'up' },
  version: '0.4.0',
  environment: 'development',
  otpDummy: true,
  auditPartitionsUntil: '2027-12',
  storage: {
    total: { count: 5, bytes: 5000 },
    byKind: [
      { kind: 'profile_photo', count: 2, bytes: 3000 },
      { kind: 'nid_photo', count: 3, bytes: 2000 },
    ],
    byBucket: [
      { bucket: 'photos', count: 4, bytes: 2_621_440, monthGrowth: 1_048_576 },
      { bucket: 'profiles', count: 1, bytes: 1000, monthGrowth: null },
    ],
    byMonth: [{ month: '2026-10', count: 3, bytes: 3500 }],
    measuredAt: '2026-10-17T05:00:00.000Z',
  },
};

let sessionRequests: URLSearchParams[];
let revoked: { path: string; body: unknown }[];
let healthReads: number;

function serve() {
  sessionRequests = [];
  revoked = [];
  healthReads = 0;
  server.use(
    http.get('*/api/v1/sessions/active', ({ request }) => {
      sessionRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: [OFFICIAL_SESSION, OWNER_SESSION],
        meta: { nextCursor: null, prevCursor: null },
      });
    }),
    http.post('*/api/v1/users/:userId/sessions/:sessionId/revoke', async ({ params, request }) => {
      const body = await request.json();
      revoked.push({ path: `${String(params.userId)}/${String(params.sessionId)}`, body });
      if (params.userId === OWNER_SESSION.person.id)
        return HttpResponse.json(
          {
            error: {
              code: 'user.system_owner_protected',
              message: 'সিস্টেম মালিকের অ্যাকাউন্ট এভাবে বদলানো যায় না।',
              requestId: 'req_x',
            },
          },
          { status: 409 },
        );
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('*/api/v1/admin/health', () => {
      healthReads += 1;
      return HttpResponse.json({ data: HEALTH, meta: {} });
    }),
  );
}

beforeEach(() => {
  resetClientForTests();
});

describe('the active sessions', () => {
  it('lists the sessions, filters by kind and ends one with a reason', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = renderApp(<SessionsPage />, 'bn', { path: '/admin/sessions' });
    const table = await screen.findByRole('table', { name: 'সক্রিয় সেশন' });
    expect(screen.getByText('নিরাপত্তা')).toBeInTheDocument();
    // the kind of each person, and the main admin marked beside it
    // the table stands while its rows load
    expect((await within(table).findAllByText('অফিসিয়াল · মেইন অ্যাডমিন')).length).toBeGreaterThan(
      0,
    );
    await expectNoAxeViolations(container);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'স্বেচ্ছাসেবক' }));
    await waitFor(() => expect(sessionRequests.at(-1)?.get('kind')).toBe('volunteer'));
    const [end] = await screen.findAllByRole('button', {
      name: 'নমুনা অফিসিয়াল-এর Pixel 7 · android সেশন বন্ধ করুন',
    });
    await user.click(end!);
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox'), 'ফোন হারিয়েছে');
    await user.click(within(dialog).getByRole('button', { name: 'সেশন বন্ধ করুন' }));
    expect(await screen.findByText('নমুনা অফিসিয়াল-এর সেশন বন্ধ করা হয়েছে।')).toBeInTheDocument();
    expect(revoked[0]).toEqual({
      path: `${OFFICIAL_SESSION.person.id}/${OFFICIAL_SESSION.id}`,
      body: { reason: 'ফোন হারিয়েছে' },
    });
  });

  it("shows the server's refusal for the Main Admin's session", async () => {
    refreshAs(HEAD);
    serve();
    renderApp(<SessionsPage />, 'bn', { path: '/admin/sessions' });
    await screen.findByRole('table', { name: 'সক্রিয় সেশন' });
    const user = userEvent.setup();
    const [end] = await screen.findAllByRole('button', {
      name: 'মেইন অ্যাডমিন (নমুনা)-এর Pixel 7 · android সেশন বন্ধ করুন',
    });
    await user.click(end!);
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox'), 'পরীক্ষা');
    await user.click(within(dialog).getByRole('button', { name: 'সেশন বন্ধ করুন' }));
    expect(
      await within(dialog).findByText('সিস্টেম মালিকের অ্যাকাউন্ট এভাবে বদলানো যায় না।'),
    ).toBeInTheDocument();
  });

  it('shows the forbidden content to an RPM and asks for nothing', async () => {
    refreshAs(RPM);
    serve();
    renderApp(<SessionsPage />, 'bn', { path: '/admin/sessions' });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('সক্রিয় সেশন');
    expect(sessionRequests).toHaveLength(0);
  });
});

const refused = (requestId: string) =>
  HttpResponse.json(
    { error: { code: 'permission.denied', message: 'অনুমতি নেই।', requestId } },
    { status: 403 },
  );

describe('when a read fails', () => {
  it('shows the error state of the sessions list', async () => {
    refreshAs(HEAD);
    serve();
    server.use(http.get('*/api/v1/sessions/active', () => refused('req_s')));
    renderApp(<SessionsPage />, 'bn', { path: '/admin/sessions' });
    expect(await screen.findByText('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')).toBeInTheDocument();
  });

  it('shows the error state of the health page', async () => {
    refreshAs(HEAD);
    serve();
    server.use(http.get('*/api/v1/admin/health', () => refused('req_h')));
    renderApp(<HealthPage />, 'bn', { path: '/admin/health' });
    expect(await screen.findByText('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')).toBeInTheDocument();
  });
});

describe('the system health', () => {
  it('says so when the database did not answer for the figures', async () => {
    refreshAs(HEAD);
    serve();
    server.use(
      http.get('*/api/v1/admin/health', () =>
        HttpResponse.json({
          data: { ...HEALTH, auditPartitionsUntil: null, storage: null },
          meta: {},
        }),
      ),
    );
    renderApp(<HealthPage />, 'bn', { path: '/admin/health' });
    expect(
      await screen.findByText('ডাটাবেস সাড়া দেয়নি, তাই স্টোরেজের হিসাব দেখানো যাচ্ছে না।'),
    ).toBeInTheDocument();
    expect(screen.getByText('জানা যায়নি')).toBeInTheDocument();
  });

  it('shows the forbidden content to an RPM and asks for nothing', async () => {
    refreshAs(RPM);
    serve();
    renderApp(<HealthPage />, 'bn', { path: '/admin/health' });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent(
      'সিস্টেমের অবস্থা',
    );
    expect(healthReads).toBe(0);
  });

  it('shows a failed check, the dummy OTP warning and the storage figures in English digits', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = renderApp(<HealthPage />, 'bn', { path: '/admin/health' });
    expect(await screen.findByText('ডামি OTP চালু আছে')).toBeInTheDocument();
    expect(screen.getByText('প্রশাসনিক পর্যবেক্ষণ')).toBeInTheDocument();
    // a tile per service, and the environment with its version
    const checks = within(screen.getByRole('list', { name: 'সেবাগুলোর অবস্থা' }));
    expect(checks.getAllByRole('listitem')).toHaveLength(4);
    expect(checks.getByText(/^ভার্সন /)).toBeInTheDocument();
    const storage = screen.getByText('ফাইল স্টোরেজ').closest('li') as HTMLElement;
    expect(within(storage).getByText('বন্ধ')).toBeInTheDocument();
    const database = screen.getByText('ডাটাবেস').closest('li') as HTMLElement;
    expect(within(database).getByText('চালু')).toBeInTheDocument();
    expect(screen.getByText('2027-12')).toBeInTheDocument();
    expect(screen.getByText(/^5টি ফাইল, মোট /)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'ধরন অনুযায়ী ফাইল' })).toHaveTextContent(
      'profile_photo',
    );
    // each bucket with its growth since a month ago, in English digits
    const buckets = screen.getByRole('table', { name: 'বাকেট অনুযায়ী স্টোরেজ' });
    const photos = within(buckets).getByRole('row', { name: /photos/ });
    expect(photos).toHaveTextContent('+1');
    expect(photos).toHaveTextContent(/2\.5/);
    expect(within(buckets).getByRole('row', { name: /profiles/ })).toHaveTextContent(
      'এখনো জানা নেই',
    );
    await expectNoAxeViolations(container);
  });
});
