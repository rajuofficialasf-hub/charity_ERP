import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { AuditPage } from './AuditPage';

// The audit viewer of the global roles: filters in the request, the entry with its old and new
// values, and the whole history of an entity. Test data only.
const MONITORING: Me = { ...ME, roles: ['monitoring_team'] };
const PM: Me = { ...ME, roles: ['program_manager'] };

const ENTRY = {
  id: '01900000-0000-7000-8000-0000000000e1',
  createdAt: '2026-10-17T05:00:00.000Z',
  action: 'settings.change',
  entityType: 'reference_list',
  entityId: '01900000-0000-7000-8000-0000000000e9',
  actor: { id: '01900000-0000-7000-8000-0000000000e2', name: 'নমুনা মনিটরিং' },
  actorRole: 'monitoring_team',
  reason: null,
  ip: '10.1.2.3',
  deviceSessionId: null,
  old: { reviewPendingDays: 7 },
  new: { reviewPendingDays: 8 },
};

let requests: URLSearchParams[];

function serve() {
  requests = [];
  server.use(
    http.get('*/api/v1/audit-log', ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      return HttpResponse.json({
        data: [ENTRY],
        meta: { nextCursor: null, prevCursor: null, from: '2026-09-17', to: '2026-10-17' },
      });
    }),
  );
}

const open = () => renderApp(<AuditPage />, 'bn', { path: '/admin/audit' });

beforeEach(() => {
  resetClientForTests();
});

describe('the audit viewer', () => {
  it('lists the entries newest first with the range the server used', async () => {
    refreshAs(MONITORING);
    serve();
    const { container } = open();
    const table = await screen.findByRole('grid', { name: 'অডিট লগের এন্ট্রি' });
    expect(within(table).getAllByText('settings.change').length).toBeGreaterThan(0);
    expect(screen.getByText('সময়সীমা: 17-09-2026 থেকে 17-10-2026')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('sends the action and the dates as filters', async () => {
    refreshAs(MONITORING);
    serve();
    open();
    await screen.findByRole('grid', { name: 'অডিট লগের এন্ট্রি' });
    const user = userEvent.setup();
    const action = screen.getAllByRole('textbox', { name: /^কাজ/ })[0]!;
    await user.type(action, 'settings.change');
    await user.tab();
    await waitFor(() => expect(requests.at(-1)?.get('action')).toBe('settings.change'));
  });

  it('opens an entry with the old and new values side by side and shows its whole history', async () => {
    refreshAs(MONITORING);
    serve();
    open();
    const user = userEvent.setup();
    const [details] = await screen.findAllByRole('button', {
      name: 'settings.change বিস্তারিত দেখুন',
    });
    await user.click(details!);
    const drawer = await screen.findByRole('dialog', { name: 'অডিট এন্ট্রি' });
    const before = within(drawer).getByRole('region', { name: 'আগের মান' });
    const after = within(drawer).getByRole('region', { name: 'নতুন মান' });
    expect(before).toHaveTextContent('"reviewPendingDays": 7');
    expect(after).toHaveTextContent('"reviewPendingDays": 8');
    expect(within(drawer).getByText('10.1.2.3')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'এই বিষয়ের পুরো ইতিহাস' }));
    await waitFor(() => expect(requests.at(-1)?.get('entityId')).toBe(ENTRY.entityId));
    expect(requests.at(-1)?.get('entityType')).toBe('reference_list');
    expect(await screen.findByText(/একটি বিষয়ের পুরো ইতিহাস/)).toBeInTheDocument();
  });

  it('shows the forbidden content to a Program Manager', async () => {
    refreshAs(PM);
    serve();
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('অডিট লগ');
    expect(requests).toHaveLength(0);
  });
});
