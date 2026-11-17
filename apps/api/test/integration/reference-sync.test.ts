import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { runSeed } from '../../seed/run.js';
import { syncAccessCatalogue } from '../../src/access/catalogue-sync.js';
import { prismaClientFor } from '../../src/core/prisma.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { REFERENCE_LISTS, syncReferenceLists } from '../../src/services/reference-lists-sync.js';
import {
  shippedWorkflowDefinitions,
  syncWorkflowTemplates,
} from '../../src/workflow/template-sync.js';
import { cloneTemplate } from './support/db.js';

// The shipped roles and permissions, workflow templates and reference lists reach a database with
// real data through
// `pnpm db:migrate` (docs/ops/DEPLOYMENT.md, the start-up order): what is missing is inserted, a
// stored row is never changed, and a stored template that differs from the shipped one is named.

let db: Client;
let url: string;
let drop: () => Promise<void>;
let prisma: PrismaClient;

const sync = () =>
  prisma.$transaction(async (tx) => ({
    access: await syncAccessCatalogue(tx),
    workflows: await syncWorkflowTemplates(tx),
    lists: await syncReferenceLists(tx),
  }));
const entries = Object.values(REFERENCE_LISTS).reduce((n, list) => n + list.length, 0);

beforeAll(async () => {
  ({ client: db, url, drop } = await cloneTemplate(inject('templateDb')));
  prisma = prismaClientFor(url);
}, 60_000);
afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('the sync of the shipped templates and lists', () => {
  it('loads every template and list entry into an empty database, and a second run changes nothing', async () => {
    const shipped = shippedWorkflowDefinitions();
    const first = await sync();
    expect(first.workflows.inserted).toHaveLength(shipped.length);
    expect(first.workflows.differing).toEqual([]);
    expect(first.lists).toEqual({ inserted: entries, present: 0 });
    expect(first.access.permissions).toBeGreaterThan(100);
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM workflow_transitions',
    );
    expect(rows[0]!.n).toBeGreaterThan(shipped.length);
    const second = await sync();
    expect(second.workflows).toEqual({ inserted: [], present: shipped.length, differing: [] });
    expect(second.lists).toEqual({ inserted: 0, present: entries });
    expect(second.access).toEqual({ roles: 0, permissions: 0 });
  });

  it('keeps an edited list entry and a changed stored template, naming the template', async () => {
    await db.query(
      `UPDATE reference_lists SET label_bn = 'পুরুষ (সম্পাদিত)', active = false
        WHERE list_key = 'gender' AND code = 'male'`,
    );
    await db.query(
      `UPDATE workflow_definitions SET definition = jsonb_set(definition, '{title_en}', '"Edited"')
        WHERE key = 'distribution'`,
    );
    const { workflows } = await sync();
    expect(workflows.inserted).toEqual([]);
    expect(workflows.differing).toEqual([expect.stringMatching(/^distribution v\d+$/)]);
    const { rows } = await db.query(
      `SELECT label_bn, active FROM reference_lists WHERE list_key = 'gender' AND code = 'male'`,
    );
    expect(rows).toEqual([{ label_bn: 'পুরুষ (সম্পাদিত)', active: false }]);
    const stored = await db.query(
      `SELECT definition ->> 'title_en' AS title FROM workflow_definitions WHERE key = 'distribution'`,
    );
    expect(stored.rows).toEqual([{ title: 'Edited' }]);
  });

  it('lets the development seed run after the sync on the same rows', async () => {
    const report = await runSeed(prisma, ['base'], { NODE_ENV: 'test', DATABASE_URL: url });
    expect(report.totals.inserted).toBeGreaterThan(0);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM workflow_definitions GROUP BY key, version HAVING count(*) > 1`,
    );
    expect(rows).toEqual([]);
  }, 180_000);
});
