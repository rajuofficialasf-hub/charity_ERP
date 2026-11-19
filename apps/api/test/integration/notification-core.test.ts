import { NOTIFICATION_TEMPLATES, TEMPLATE_SAMPLES } from '@css/shared';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountEvents } from '../../src/notifications/account-events.js';
import { NOTIFICATION_CATALOGUE } from '../../src/notifications/catalogue.js';
import { MONITORING } from '../../src/notifications/recipients.js';
import type { NotificationInput } from '../../src/notifications/service.js';
import { accessWorld } from './support/access-fixtures.js';
import { account, type AuthHarness, authHarness } from './support/auth-app.js';
import * as f from './support/fixtures.js';

// Publishing an event: in-app rows and the email outbox are written in the event's transaction, for
// the people the rules reach and nobody else.
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
    const { rows: ids } = await h.db.query<{ id: string }>(
      `SELECT id FROM outbound_messages WHERE template_key = 'handover_items_assigned'`,
    );
    const { rows: jobs } = await h.db.query(
      `SELECT data FROM pgboss.job WHERE name = 'notify' AND data->>'messageId' = $1`,
      [ids[0]!.id],
    );
    expect(jobs).toHaveLength(1);
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

  it('tells the Admins, the Department Head and the Monitoring Team what the whole department must know', async () => {
    await publish({
      key: 'staff_registration_pending',
      recipients: [{ roles: MONITORING }],
      params: { applicant_name: 'নমুনা কর্মী' },
      about: 'staff-registrations:everyone',
    });
    const told = new Set((await rowsOf('staff_registration_pending')).map((r) => r.user_id));
    for (const userId of [world.users.admin, world.users.head, world.users.monitoring])
      expect(told.has(userId), userId).toBe(true);
    expect(told.has(world.users.pm)).toBe(false);
  });

  it('sends the email about another record, and never twice for one event', async () => {
    const about = (record: string, eventId?: string): NotificationInput => ({
      key: 'security_refresh_reuse',
      recipients: [{ user: world.users.monitoring }],
      params: { device_name: 'Phone' },
      about: record,
      eventId,
    });
    await publish(about('session-a'));
    await publish(about('session-b'));
    const emails = (await outboxOf('security_refresh_reuse')).filter(
      (m) => m.recipient_user_id === world.users.monitoring,
    );
    expect(emails).toHaveLength(2);
    // the same event id never queues a second email, even when nothing else would stop it
    const eventId = '01900000-0000-7000-8000-00000000000c';
    await publish(about('session-c', eventId));
    await publish(about('session-d', eventId));
    expect(
      (await outboxOf('security_refresh_reuse')).filter(
        (m) => m.recipient_user_id === world.users.monitoring,
      ),
    ).toHaveLength(3);
  });

  it('refuses an event that names a record without saying which one it is about', async () => {
    await expect(
      publish({
        key: 'registration_approved',
        recipients: [{ user: world.users.general }],
        params: { userId: world.users.general },
      }),
    ).rejects.toThrow(/about/);
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
      about: world.a1.id,
      actorId: world.users.rpmDhaka,
    });
    const people = (await rowsOf('project_activated')).map((r) => r.user_id);
    expect(people).toContain(world.users.rpmRangpur);
    expect(people).toContain(world.users.executive);
    expect(people).toContain(world.users.general);
    expect(people).not.toContain(world.users.rpmDhaka);
    expect(people).not.toContain(world.users.outsider);
  });

  it('walks every event and reaches staff and volunteers only, never a beneficiary', async () => {
    const ben = await f.beneficiary(h.db, world.dhaka);
    const contact = (
      await h.db.query<{ mobile: string }>('SELECT mobile FROM beneficiaries WHERE id = $1', [ben])
    ).rows[0]!.mobile;
    for (const key of Object.keys(NOTIFICATION_CATALOGUE)) {
      const template = NOTIFICATION_TEMPLATES.find((t) => t.key === key)!;
      await publish({
        key,
        recipients: [
          { roles: MONITORING },
          { project: { projectId: world.a1.id, rpms: true, staff: true, volunteers: true } },
        ],
        params: Object.fromEntries(
          template.variables.map((v) => [
            v,
            Object.hasOwn(TEMPLATE_SAMPLES, v) ? TEMPLATE_SAMPLES[v]! : 'x',
          ]),
        ),
        about: `walk:${key}`,
      });
    }
    const inApp = await h.db.query<{ kind: string }>(
      'SELECT DISTINCT u.kind FROM notifications n JOIN users u ON u.id = n.user_id',
    );
    expect(inApp.rows.map((r) => r.kind).sort()).toEqual(['staff', 'volunteer']);
    const outbox = await h.db.query<{
      kind: string;
      channel: string;
      address: string;
      donor: string | null;
    }>(
      `SELECT u.kind, o.channel, o.address, o.recipient_donor_id AS donor
         FROM outbound_messages o JOIN users u ON u.id = o.recipient_user_id`,
    );
    expect(outbox.rows.length).toBeGreaterThan(0);
    for (const m of outbox.rows) {
      expect(m).toMatchObject({ kind: 'staff', channel: 'email', donor: null });
      expect(m.address).not.toBe(contact);
    }
    const all = await h.db.query('SELECT count(*)::int AS n FROM outbound_messages');
    expect(all.rows[0].n).toBe(outbox.rows.length);
  });

  it('never undoes a security write when its notice cannot be written', async () => {
    const failing = new AccountEvents(
      {
        publish: async () => {
          throw new Error('notifications down');
        },
      } as never,
      pino({ level: 'silent' }),
    );
    const person = await account(h.db);
    await h.container.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: person.id }, data: { failedLoginCount: 5 } });
      await failing.accountLocked(tx, person.id, 15, new Date());
      await failing.refreshReused(tx, person.id, person.id);
    });
    const { rows } = await h.db.query('SELECT failed_login_count FROM users WHERE id = $1', [
      person.id,
    ]);
    expect(rows[0].failed_login_count).toBe(5);
  });

  it('refuses a key that is not in the catalogue', async () => {
    await expect(publish({ key: 'no_such_event', recipients: [], params: {} })).rejects.toThrow(
      /catalogue/,
    );
  });
});
