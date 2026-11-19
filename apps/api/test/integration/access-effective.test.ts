import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  effectivePermissions,
  type EffectiveGrant,
  loadAccessFacts,
} from '../../src/access/effective.js';
import { loadAccessRegistry } from '../../src/access/registry.js';
import { PrismaService } from '../../src/core/prisma.service.js';
import { testEnv } from '../support/env.js';
import { accessWorld } from './support/access-fixtures.js';
import { cloneTemplate } from './support/db.js';

// Effective permissions read from real rows (docs/security/RBAC.md, "Model" and "Volunteer
// permission sets and RPM-granted extras").
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

  it('gives an Admin the owner transfer, the Head the rest, and the Monitoring Team no administration', async () => {
    const of = async (userId: string) => new Set((await grantsOf(userId)).map((g) => g.permission));
    const admin = await of(world.users.admin);
    const head = await of(world.users.head);
    const monitoring = await of(world.users.monitoring);
    expect(admin).toContain('system.owner.transfer');
    expect(head).not.toContain('system.owner.transfer');
    expect(head).toContain('permission.panel.manage');
    expect(monitoring).not.toContain('system.owner.transfer');
    expect(monitoring).not.toContain('permission.panel.manage');
    expect(monitoring).toContain('audit.view');
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
