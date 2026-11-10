import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { AuditWriter } from '../../src/audit/audit-writer';
import { PrismaService } from '../../src/core/prisma.service';
import { runWithContext } from '../../src/core/request-context';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { testEnv } from '../support/env';
import { cloneTemplate } from './support/db';
import { insert, user } from './support/fixtures';

// The audit writer writes inside the caller's transaction; idempotency on sync_batches
// returns stored results for a repeated Idempotency-Key, also under concurrency.
let db: Client;
let drop: () => Promise<void>;
let prisma: PrismaService;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  db = clone.client;
  drop = clone.drop;
  prisma = new PrismaService(testEnv({ DATABASE_URL: clone.url }));
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('AuditWriter', () => {
  it('records actor, request facts and the change inside the transaction', async () => {
    const actor = await user(db);
    const writer = new AuditWriter();
    const ctx = {
      requestId: 'req_audit_1',
      locale: 'bn' as const,
      ip: '10.0.0.7',
      userId: actor,
      auditCount: 0,
    };
    await runWithContext(ctx, () =>
      prisma.$transaction((tx) =>
        writer.record(tx, {
          action: 'probe.update',
          entityType: 'probe',
          entityId: randomUUID(),
          old: { status: 'draft' },
          new: { status: 'submitted' },
          reason: 'sample',
        }),
      ),
    );
    expect(ctx.auditCount).toBe(1);
    const row = await db.query(
      "select actor_user_id, action, old, new, reason, host(ip) as ip, request_id from audit_log where request_id = 'req_audit_1'",
    );
    expect(row.rows[0]).toMatchObject({
      actor_user_id: actor,
      action: 'probe.update',
      old: { status: 'draft' },
      new: { status: 'submitted' },
      reason: 'sample',
      ip: '10.0.0.7',
    });
  });

  it('leaves no entry when the business transaction rolls back', async () => {
    const writer = new AuditWriter();
    await expect(
      prisma.$transaction(async (tx) => {
        await writer.record(tx, { action: 'probe.rollback', entityType: 'probe' });
        throw new Error('business guard failed');
      }),
    ).rejects.toThrow('business guard failed');
    const row = await db.query(
      "select count(*)::int as n from audit_log where action = 'probe.rollback'",
    );
    expect(row.rows[0].n).toBe(0);
  });
});

describe('IdempotencyService', () => {
  async function owner() {
    const userId = await user(db);
    const deviceSessionId = await insert(db, 'device_sessions', {
      id: randomUUID(),
      user_id: userId,
      refresh_token_hash: randomUUID(),
      expires_at: new Date(Date.now() + 86_400_000),
    });
    return { userId, deviceSessionId };
  }

  it('runs a batch once and replays the stored results for the same key', async () => {
    const service = new IdempotencyService(prisma);
    const who = await owner();
    let runs = 0;
    const run = async () => {
      runs += 1;
      return [{ clientUuid: 'c1', result: 'done' }];
    };
    const first = await service.runWithKey('batch-key-0001', who, 1, run);
    const second = await service.runWithKey('batch-key-0001', who, 1, run);
    expect(first).toEqual({ replay: false, results: [{ clientUuid: 'c1', result: 'done' }] });
    expect(second).toEqual({ replay: true, results: [{ clientUuid: 'c1', result: 'done' }] });
    expect(runs).toBe(1);
  });

  it('keeps one stored batch when the same key arrives twice at the same time', async () => {
    const service = new IdempotencyService(prisma);
    const who = await owner();
    const run = async () => [{ clientUuid: randomUUID(), result: 'done' }];
    const [a, b] = await Promise.all([
      service.runWithKey('batch-key-race1', who, 1, run),
      service.runWithKey('batch-key-race1', who, 1, run),
    ]);
    expect([a.replay, b.replay].sort()).toEqual([false, true]);
    expect(a.results).toEqual(b.results);
    const rows = await db.query(
      "select count(*)::int as n from sync_batches where idempotency_key = 'batch-key-race1'",
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('refuses a missing or malformed key', async () => {
    const service = new IdempotencyService(prisma);
    const who = await owner();
    await expect(service.runWithKey(undefined, who, 1, async () => [])).rejects.toMatchObject({
      code: 'validation.failed',
    });
    await expect(service.runWithKey('bad key!', who, 1, async () => [])).rejects.toMatchObject({
      code: 'validation.failed',
    });
  });
});
