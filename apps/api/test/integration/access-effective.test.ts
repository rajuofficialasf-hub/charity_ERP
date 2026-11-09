import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  effectivePermissions,
  type EffectiveGrant,
  loadAccessFacts,
} from '../../src/access/effective';
import { loadAccessRegistry } from '../../src/access/registry';
import { PrismaService } from '../../src/core/prisma.service';
import { testEnv } from '../support/env';
import { accessWorld } from './support/access-fixtures';
import { cloneTemplate } from './support/db';

// Effective permissions read from real rows (RBAC.md 1 and 6).
let db: Client;
let drop: () => Promise<void>;
let prisma: PrismaService;
let world: Awaited<ReturnType<typeof accessWorld>>;
const registry = loadAccessRegistry();
const NOW = new Date('2026-10-12T06:00:00Z');

const grantsOf = async (userId: string): Promise<EffectiveGrant[]> =>
  effectivePermissions(registry, await loadAccessFacts(prisma, userId), NOW);

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  db = clone.client;
  drop = clone.drop;
  prisma = new PrismaService(testEnv({ DATABASE_URL: clone.url }));
  world = await accessWorld(db);
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('effective permissions from the database', () => {
  it('gives the Dhaka RPM the session revocation of own region from the role default', async () => {
    expect(await grantsOf(world.users.rpmDhaka)).toContainEqual(
      expect.objectContaining({
        permission: 'session.revoke_user',
        scopeType: 'REGION',
        condition: 'own_region',
        source: 'role_default',
      }),
    );
  });

  it('gives the Project Executive the RPM-granted approval on project A1 only', async () => {
    const grants = await grantsOf(world.users.executive);
    const approve = grants.filter((g) => g.permission === 'application.approve');
    expect(approve).toEqual([
      expect.objectContaining({
        scopeType: 'REGION',
        source: 'project_grant',
        projectId: world.a1.id,
      }),
    ]);
  });

  it('gives the volunteer different permissions on its two projects', async () => {
    const grants = await grantsOf(world.users.general);
    const on = (projectId: string) =>
      new Set(grants.filter((g) => g.projectId === projectId).map((g) => g.permission));
    expect(on(world.a1.id)).toContain('stock.receive');
    expect(on(world.a1.id)).not.toContain('class.record');
    expect(on(world.a2.id)).toContain('class.record');
    expect(on(world.b1.id).size).toBe(0);
    expect(grants.filter((g) => g.permission === 'stock.receive' && g.projectId === null)).toEqual(
      [],
    );
  });

  it('gives the Local দায়ী exam.record through the extra and the team member own records only', async () => {
    expect(await grantsOf(world.users.daee)).toContainEqual(
      expect.objectContaining({
        permission: 'exam.record',
        source: 'project_grant',
        projectId: world.a1.id,
      }),
    );
    expect(await grantsOf(world.users.team)).toContainEqual(
      expect.objectContaining({
        permission: 'application.view',
        scopeType: 'SELF',
        condition: 'own_created',
      }),
    );
  });

  it('gives the Department Head the owner transfer and the Monitoring Team everything else', async () => {
    const head = new Set((await grantsOf(world.users.head)).map((g) => g.permission));
    const monitoring = new Set((await grantsOf(world.users.monitoring)).map((g) => g.permission));
    expect(head).toContain('system.owner.transfer');
    expect(monitoring).not.toContain('system.owner.transfer');
    expect(monitoring).toContain('permission.panel.manage');
  });

  it('applies a panel revoke and ignores revoked or expired overrides', async () => {
    expect((await grantsOf(world.users.pm)).some((g) => g.permission === 'permission.view')).toBe(
      true,
    );
    const override = (effect: string, extra: Record<string, unknown> = {}) =>
      db.query(
        `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by, expires_at, revoked_at)
         VALUES ($1, $2, 'permission.view', $3, 'GLOBAL', 'Test override', $4, $5, $6)`,
        [
          randomUUID(),
          world.users.pm,
          effect,
          world.users.head,
          extra.expiresAt ?? null,
          extra.revokedAt ?? null,
        ],
      );
    await override('revoke', { revokedAt: new Date('2026-10-12T05:00:00Z') });
    await override('revoke', { expiresAt: new Date('2026-10-12T05:59:00Z') });
    expect((await grantsOf(world.users.pm)).some((g) => g.permission === 'permission.view')).toBe(
      true,
    );
    await override('revoke');
    expect((await grantsOf(world.users.pm)).some((g) => g.permission === 'permission.view')).toBe(
      false,
    );
  });
});
