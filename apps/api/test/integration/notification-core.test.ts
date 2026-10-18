import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MONITORING } from '../../src/notifications/recipients';
import type { NotificationInput } from '../../src/notifications/service';
import { accessWorld } from './support/access-fixtures';
import { account, type AuthHarness, authHarness } from './support/auth-app';

// Publishing an event: in-app rows and the email outbox are written in the event's transaction,
// for the people the rules reach and nobody else (plan
// docs/plans/2026-10-18-0911-feat-notifications-plan.md).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) =>
    (await account(h.db, { kind, role })).id;
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

const publish = (input: NotificationInput) =>
  h.container.prisma.$transaction((tx) => h.container.notifications.publish(tx, input));

const rowsOf = async (key: string) =>
  (
    await h.db.query<{
      user_id: string;
      count: number;
      params: Record<string, unknown>;
      template_version: number;
    }>(
      'SELECT user_id, count, params, template_version FROM notifications WHERE template_key = $1',
      [key],
    )
  ).rows;

const outboxOf = async (key: string) =>
  (
    await h.db.query<{
      recipient_user_id: string;
      status: string;
      address: string;
      params: Record<string, unknown>;
    }>(
      'SELECT recipient_user_id, status, address, params FROM outbound_messages WHERE template_key = $1',
      [key],
    )
  ).rows;

describe('publishing an event', () => {
  it('reaches the officials whose scope covers the record, and nobody outside it', async () => {
    await publish({
      key: 'registration_pending',
      recipients: [
        {
          holders: {
            permission: 'registration.approve',
            entity: 'user',
            target: { userId: world.users.general },
          },
        },
      ],
      params: { region_name: { bn: 'ঢাকা', en: 'Dhaka' }, userId: world.users.general },
      about: world.users.general,
    });
    const people = (await rowsOf('registration_pending')).map((r) => r.user_id);
    expect(people).toContain(world.users.rpmDhaka);
    expect(people).toContain(world.users.head);
    expect(people).not.toContain(world.users.rpmRangpur);
    expect(people).not.toContain(world.users.general);
    // an in-app only event queues no email
    expect(await outboxOf('registration_pending')).toEqual([]);
  });

  it('keeps no person value on the in-app row, and queues the email with it for officials only', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    await publish({
      key: 'handover_items_assigned',
      recipients: [{ user: world.users.rpmDhaka }, { user: volunteer.id }],
      params: { from_name: 'নমুনা অফিসিয়াল', count: 3 },
      about: 'handover-1',
    });
    const rows = await rowsOf('handover_items_assigned');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.params).toEqual({ count: 3 });
      expect(row.template_version).toBe(1);
    }
    const outbox = await outboxOf('handover_items_assigned');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ recipient_user_id: world.users.rpmDhaka, status: 'queued' });
    expect(outbox[0]!.params).toMatchObject({ from_name: 'নমুনা অফিসিয়াল' });
    const { rows: jobs } = await h.db.query(`SELECT data FROM pgboss.job WHERE name = 'notify'`);
    expect(jobs.map((j) => j.data.messageId)).toHaveLength(1);
  });

  it('collapses the same event within 15 minutes into one entry and one email', async () => {
    const input: NotificationInput = {
      key: 'staff_registration_pending',
      recipients: [{ roles: MONITORING }],
      params: { applicant_name: 'নমুনা কর্মী' },
      about: 'staff-registrations',
    };
    await publish(input);
    await publish(input);
    const rows = (await rowsOf('staff_registration_pending')).filter(
      (r) => r.user_id === world.users.monitoring,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(2);
    const emails = (await outboxOf('staff_registration_pending')).filter(
      (m) => m.recipient_user_id === world.users.monitoring,
    );
    expect(emails).toHaveLength(1);
  });

  it('writes nothing when the event transaction rolls back', async () => {
    await expect(
      h.container.prisma.$transaction(async (tx) => {
        await h.container.notifications.publish(tx, {
          key: 'account_blocked',
          recipients: [{ user: world.users.rpmRangpur }],
          params: {},
        });
        throw new Error('the business write failed');
      }),
    ).rejects.toThrow(/business write/);
    expect(await rowsOf('account_blocked')).toEqual([]);
  });

  it('never sends the actor a copy, and reaches the people of a project', async () => {
    await publish({
      key: 'project_activated',
      recipients: [
        { project: { projectId: world.a1.id, rpms: true, staff: true, volunteers: true } },
      ],
      params: { project_name: { bn: 'প্রকল্প', en: 'Project' }, projectId: world.a1.id },
      actorId: world.users.rpmDhaka,
    });
    const people = (await rowsOf('project_activated')).map((r) => r.user_id);
    expect(people).toContain(world.users.rpmRangpur);
    expect(people).toContain(world.users.executive);
    expect(people).toContain(world.users.general);
    expect(people).not.toContain(world.users.rpmDhaka);
    expect(people).not.toContain(world.users.outsider);
  });

  it('refuses a key that is not in the catalogue', async () => {
    await expect(publish({ key: 'no_such_event', recipients: [], params: {} })).rejects.toThrow(
      /catalogue/,
    );
  });
});
