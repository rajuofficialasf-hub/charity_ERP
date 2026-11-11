import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { DeliveriesPage } from './DeliveriesPage';
import { NotificationTemplatesPage } from './NotificationTemplatesPage';
import type { Delivery, NotificationTemplate } from './notifications-admin-api';

// The notification texts and the delivery page of the global roles. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const PM: Me = { ...ME, roles: ['program_manager'] };

const HANDOVER: NotificationTemplate = {
  key: 'handover_items_assigned',
  category: 'work',
  variables: ['from_name', 'count'],
  channels: {
    in_app: {
      version: 1,
      bn: {
        subject: null,
        title: 'হস্তান্তরের কাজ',
        body: '{{count}}টি কাজ আপনাকে দেওয়া হয়েছে।',
      },
      en: {
        subject: null,
        title: 'Handed-over work',
        body: '{{count}} items have been handed over to you.',
      },
    },
    email: {
      version: 2,
      bn: { subject: 'কাজ হস্তান্তর', title: null, body: '{{from_name}}-এর {{count}}টি কাজ।' },
      en: { subject: 'Work handed over', title: null, body: '{{count}} items of {{from_name}}.' },
    },
  },
};

const FAILED: Delivery = {
  id: '01900000-0000-7000-8000-0000000000d1',
  createdAt: '2026-10-18T05:00:00.000Z',
  channel: 'email',
  templateKey: 'handover_items_assigned',
  status: 'failed',
  recipient: { id: '01900000-0000-7000-8000-0000000000d2', name: 'নমুনা অফিসিয়াল' },
  address: 'r***@example.org',
  attempts: 3,
  lastError: 'permanent: 550 [address] unknown',
  nextAttemptAt: null,
  sentAt: null,
};

beforeEach(() => {
  resetClientForTests();
});

describe('NotificationTemplatesPage', () => {
  it('previews a channel in both languages and shows the server’s message for an unknown value', async () => {
    refreshAs(HEAD);
    const user = userEvent.setup();
    const previews: unknown[] = [];
    server.use(
      http.get('*/api/v1/admin/notification-templates', () =>
        HttpResponse.json({ data: [HANDOVER], meta: {} }),
      ),
      http.post(
        '*/api/v1/admin/notification-templates/:key/:channel/preview',
        async ({ request, params }) => {
          previews.push({ ...params, body: await request.json() });
          return HttpResponse.json({
            data: {
              bn: { title: 'হস্তান্তরের কাজ', body: '3টি কাজ আপনাকে দেওয়া হয়েছে।' },
              en: { title: 'Handed-over work', body: '3 items have been handed over to you.' },
            },
            meta: {},
          });
        },
      ),
      http.put('*/api/v1/admin/notification-templates/:key/:channel', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'Check the highlighted fields.',
              requestId: 'req_test',
              details: [
                {
                  path: 'en.body',
                  code: 'notification.placeholder_unknown',
                  message: 'This placeholder is not available for this notification.',
                },
              ],
            },
          },
          { status: 422 },
        ),
      ),
    );
    const { container } = renderApp(<NotificationTemplatesPage />, 'en');
    expect((await screen.findAllByText('handover_items_assigned')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Email, version 2').length).toBeGreaterThan(0);
    expect(screen.getByText('Messages')).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getAllByRole('button', { name: 'Edit handover_items_assigned' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Edit handover_items_assigned' });
    expect(within(dialog).getByText('Values you can use: {{from_name}}, {{count}}')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    const shown = await within(dialog).findByRole('region', { name: 'Preview with sample values' });
    expect(within(shown).getByText('3টি কাজ আপনাকে দেওয়া হয়েছে।')).toBeVisible();
    expect(within(shown).getByText('3 items have been handed over to you.')).toBeVisible();
    expect(previews).toEqual([
      expect.objectContaining({ key: 'handover_items_assigned', channel: 'in_app' }),
    ]);

    const bodies = within(dialog).getAllByRole('textbox', { name: /Text/ });
    await user.clear(bodies[1]!);
    await user.type(bodies[1]!, 'Hello {{{{nid}}');
    // a changed text makes the preview out of date
    expect(within(dialog).queryByRole('region', { name: 'Preview with sample values' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save as new version' }));
    expect(
      await within(dialog).findByText('This placeholder is not available for this notification.'),
    ).toBeVisible();
    // the next change makes the refusal out of date too
    await user.type(bodies[1]!, '!');
    expect(
      within(dialog).queryByText('This placeholder is not available for this notification.'),
    ).toBeNull();
    // a preview and two saves typed through: slow when the whole suite shares the machine
  }, 20_000);

  it('saves a new version, closes the editor and says which version was saved', async () => {
    refreshAs(HEAD);
    const user = userEvent.setup();
    const saved: unknown[] = [];
    server.use(
      http.get('*/api/v1/admin/notification-templates', () =>
        HttpResponse.json({ data: [HANDOVER], meta: {} }),
      ),
      http.put('*/api/v1/admin/notification-templates/:key/:channel', async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({
          data: {
            ...HANDOVER,
            channels: {
              ...HANDOVER.channels,
              in_app: { ...HANDOVER.channels.in_app!, version: 2 },
            },
          },
          meta: {},
        });
      }),
    );
    renderApp(<NotificationTemplatesPage />, 'en');
    await user.click(
      (await screen.findAllByRole('button', { name: 'Edit handover_items_assigned' }))[0]!,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit handover_items_assigned' });
    await user.click(within(dialog).getByRole('button', { name: 'Save as new version' }));
    expect(await screen.findByText('handover_items_assigned saved as version 2.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saved).toEqual([
      {
        bn: { title: 'হস্তান্তরের কাজ', body: '{{count}}টি কাজ আপনাকে দেওয়া হয়েছে।' },
        en: { title: 'Handed-over work', body: '{{count}} items have been handed over to you.' },
      },
    ]);
  });

  it('edits the email channel with its subject, and shows a refusal that names no field', async () => {
    refreshAs(HEAD);
    const user = userEvent.setup();
    const saved: { channel: unknown; body: unknown }[] = [];
    server.use(
      http.get('*/api/v1/admin/notification-templates', () =>
        HttpResponse.json({ data: [HANDOVER], meta: {} }),
      ),
      http.put(
        '*/api/v1/admin/notification-templates/:key/:channel',
        async ({ request, params }) => {
          saved.push({ channel: params.channel, body: await request.json() });
          return HttpResponse.json(
            {
              error: {
                code: 'conflict.busy',
                message: 'Someone is saving this text right now.',
                requestId: 'req_test',
              },
            },
            { status: 409 },
          );
        },
      ),
    );
    renderApp(<NotificationTemplatesPage />, 'en');
    await user.click(
      (await screen.findAllByRole('button', { name: 'Edit handover_items_assigned' }))[0]!,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit handover_items_assigned' });
    await user.click(within(dialog).getByRole('radio', { name: 'Email' }));
    const subjects = within(dialog).getAllByRole('textbox', { name: /Subject/ });
    expect(subjects[1]).toHaveValue('Work handed over');
    await user.type(subjects[1]!, ' today');
    await user.click(within(dialog).getByRole('button', { name: 'Save as new version' }));
    expect(await within(dialog).findByText('Someone is saving this text right now.')).toBeVisible();
    expect(saved).toEqual([
      {
        channel: 'email',
        body: {
          bn: { subject: 'কাজ হস্তান্তর', body: '{{from_name}}-এর {{count}}টি কাজ।' },
          en: { subject: 'Work handed over today', body: '{{count}} items of {{from_name}}.' },
        },
      },
    ]);
  });

  it('shows the forbidden content to a PM', async () => {
    refreshAs(PM);
    renderApp(<NotificationTemplatesPage />, 'en');
    expect(await screen.findByRole('heading', { level: 1, name: 'No access' })).toBeVisible();
  });
});

describe('DeliveriesPage', () => {
  it('lists the deliveries with the hidden address and sends the filters', async () => {
    refreshAs(HEAD);
    const user = userEvent.setup();
    const requests: URLSearchParams[] = [];
    server.use(
      http.get('*/api/v1/admin/deliveries', ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [FAILED],
          meta: { nextCursor: null, prevCursor: null },
        });
      }),
    );
    const { container } = renderApp(<DeliveriesPage />, 'en', { path: '/admin/deliveries' });
    expect(await screen.findAllByText('r***@example.org')).not.toHaveLength(0);
    expect(screen.getByText('Delivery audit')).toBeInTheDocument();
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Failed', pressed: false }));
    await waitFor(() => expect(requests.at(-1)?.get('status')).toBe('failed'));
  });

  it('shows the error state when the list cannot be loaded', async () => {
    refreshAs(HEAD);
    server.use(
      http.get('*/api/v1/admin/deliveries', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'x',
              requestId: 'req_test',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp(<DeliveriesPage />, 'en');
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeVisible();
  });

  it('shows the forbidden content to a PM', async () => {
    refreshAs(PM);
    renderApp(<DeliveriesPage />, 'en');
    expect(await screen.findByRole('heading', { level: 1, name: 'No access' })).toBeVisible();
  });
});
