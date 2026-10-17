import { randomUUID } from 'node:crypto';
import { isoDateInDhaka } from '@css/shared/format';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';

// The audit viewer: the Department Head and the Monitoring Team read the log by actor, entity,
// action and dates, page by page; no secret leaves the server (plan
// docs/plans/2026-10-17-1800-feat-admin-settings-core-plan.md).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

const entity = randomUUID();
const other = randomUUID();
const batch = randomUUID();

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const insert = (
    action: string,
    entityId: string,
    actor: string | null,
    old: unknown,
    next: unknown,
    at = 'now()',
  ) =>
    h.db.query(
      `INSERT INTO audit_log (id, created_at, action, entity_type, entity_id, actor_user_id, old, new, reason, ip)
       VALUES ($1, ${at}, $2, 'test_entity', $3, $4, $5, $6, 'checking', '10.1.2.3')`,
      [randomUUID(), action, entityId, actor, JSON.stringify(old), JSON.stringify(next)],
    );
  for (let i = 0; i < 5; i++)
    await insert('test.change', entity, world.users.pm, { step: i }, { step: i + 1 });
  await insert('test.other', other, world.users.head, null, { done: true });
  await insert(
    'test.secret',
    other,
    world.users.head,
    { passwordHash: 'argon2id$abc', nested: { refreshToken: 'x', kept: 1 }, apiKey: 'k-123' },
    { name: 'kept', smtpPassword: 'p-456' },
  );
  // seven entries of one transaction share one time to the microsecond
  await h.db.query(
    `INSERT INTO audit_log (id, created_at, action, entity_type, entity_id, new)
     SELECT gen_random_uuid(), '2026-10-16 10:00:00.123456+00', 'test.batch', 'test_entity', $1, jsonb_build_object('n', n)
     FROM generate_series(1, 7) AS n`,
    [batch],
  );
  // two days ago: inside the default window, outside a range of today only
  await insert(
    'test.old',
    other,
    world.users.pm,
    null,
    { early: true },
    "now() - interval '2 days'",
  );
});
afterAll(async () => h.close());

const list = (s: Session, query: Record<string, string | number>) =>
  api().get('/api/v1/audit-log').query(query).set(bearer(s));

describe('the audit viewer', () => {
  it('filters by entity, newest first, and pages without gaps or repeats', async () => {
    const head = await as(world.users.head);
    const first = await list(head, { entityType: 'test_entity', entityId: entity, limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.data.map((e: { new: { step: number } }) => e.new.step)).toEqual([5, 4]);
    expect(first.body.data[0]).toMatchObject({
      action: 'test.change',
      actor: { id: world.users.pm },
      reason: 'checking',
      ip: '10.1.2.3',
      old: { step: 4 },
    });
    const steps: number[] = [];
    let cursor: string | null = null;
    do {
      const res = await list(head, {
        entityType: 'test_entity',
        entityId: entity,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      steps.push(...res.body.data.map((e: { new: { step: number } }) => e.new.step));
      cursor = res.body.meta.nextCursor;
    } while (cursor);
    expect(steps).toEqual([5, 4, 3, 2, 1]);
  });

  it('pages through entries written at the same microsecond without losing one', async () => {
    const head = await as(world.users.head);
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const res = await list(head, {
        entityType: 'test_entity',
        entityId: batch,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((e: { new: { n: number } }) => e.new.n));
      cursor = res.body.meta.nextCursor;
    } while (cursor);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows the last 30 days by default and the last year for one entity', async () => {
    const head = await as(world.users.head);
    const today = isoDateInDhaka(h.clock.now());
    const plain = await list(head, { action: 'test.old' });
    expect(plain.body.meta).toMatchObject({
      from: isoDateInDhaka(new Date(h.clock.now().getTime() - 30 * 86_400_000)),
      to: today,
    });
    expect(plain.body.data).toHaveLength(1);
    const history = await list(head, { entityType: 'test_entity', entityId: other });
    expect(history.body.meta.from).toBe(
      isoDateInDhaka(new Date(h.clock.now().getTime() - 365 * 86_400_000)),
    );
    // the entries of today count when the range ends today
    const todayOnly = await list(head, { action: 'test.other', from: today, to: today });
    expect(todayOnly.body.data).toHaveLength(1);
  });

  it('combines actor, action and dates', async () => {
    const monitoring = await as(world.users.monitoring);
    const byActor = await list(monitoring, { actorUserId: world.users.head, action: 'test.other' });
    expect(byActor.body.data).toHaveLength(1);
    expect(byActor.body.data[0].entityId).toBe(other);
    const today = isoDateInDhaka(h.clock.now());
    const early = isoDateInDhaka(new Date(h.clock.now().getTime() - 3 * 86_400_000));
    expect(
      (await list(monitoring, { action: 'test.old', from: today, to: today })).body.data,
    ).toEqual([]);
    const old = await list(monitoring, { action: 'test.old', from: early, to: today });
    expect(old.body.data).toHaveLength(1);
    expect(old.body.meta).toMatchObject({ from: early, to: today });
  });

  it('drops every secret-looking key from old and new', async () => {
    const head = await as(world.users.head);
    const res = await list(head, { action: 'test.secret' });
    expect(res.body.data[0].old).toEqual({ nested: { kept: 1 } });
    expect(res.body.data[0].new).toEqual({ name: 'kept' });
    expect(JSON.stringify(res.body)).not.toMatch(/argon2id|refreshToken|passwordHash|k-123|p-456/);
  });

  it('refuses a range over a year, a reversed range and an impossible date', async () => {
    const head = await as(world.users.head);
    const wide = await list(head, { from: '2025-01-01', to: '2026-06-01' });
    expect(wide.status).toBe(422);
    expect(wide.body.error.details[0]).toMatchObject({
      path: 'from',
      code: 'audit.range_required',
    });
    expect((await list(head, { from: '2026-06-02', to: '2026-06-01' })).status).toBe(422);
    expect((await list(head, { from: '2026-02-31' })).status).toBe(422);
  });

  it('refuses a PM and an RPM holding their own audit defaults, and a volunteer', async () => {
    for (const userId of [world.users.pm, world.users.rpmDhaka, world.users.general]) {
      const s = await as(userId);
      expect((await list(s, {})).status).toBe(403);
    }
    expect((await api().get('/api/v1/audit-log')).status).toBe(401);
  });
});
