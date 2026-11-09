import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedFormTemplates } from '../../seed/sets/base/forms';
import { cloneTemplate, MIGRATIONS_DIR } from './support/db';
import { expectSqlError, SQLSTATE } from './support/expect-sql';
import * as f from './support/fixtures';

// Forms outside projects: the ready forms PMs place, the one question library, and the source a
// placed copy names.
let db: Client;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ client: db, drop } = await cloneTemplate(inject('templateDb')));
});
afterAll(async () => drop());

const readyForm = (key: string, over: Record<string, unknown> = {}) =>
  f.insert(db, 'forms', {
    id: randomUUID(),
    project_id: null,
    key,
    title_bn: 'তৈরি ফর্ম',
    title_en: 'Ready form',
    ...over,
  });

describe('forms outside projects', () => {
  it('holds the one empty library with its open draft', async () => {
    const { rows } = await db.query(
      `SELECT f.kind, f.project_id, v.version_no, v.status
         FROM forms f JOIN form_versions v ON v.form_id = f.id WHERE f.kind = 'library'`,
    );
    expect(rows).toEqual([{ kind: 'library', project_id: null, version_no: 1, status: 'draft' }]);
  });

  it('stores a ready form of either kind with a unique key, and refuses a second with that key', async () => {
    const application = await readyForm('srp_application');
    const survey = await readyForm('srp_survey', { kind: 'other' });
    const { rows } = await db.query(
      `SELECT id, kind, project_id FROM forms WHERE id = ANY($1::uuid[]) ORDER BY key`,
      [[application, survey]],
    );
    expect(rows).toEqual([
      { id: application, kind: 'beneficiary_application', project_id: null },
      { id: survey, kind: 'other', project_id: null },
    ]);
    await expectSqlError(
      readyForm('srp_application'),
      SQLSTATE.uniqueViolation,
      /forms_ready_key_key/,
    );
  });

  it('refuses an unknown kind, a second library and a library inside a project', async () => {
    await expectSqlError(
      readyForm('odd', { kind: 'survey' }),
      SQLSTATE.checkViolation,
      /forms_kind_check/,
    );
    await expectSqlError(
      readyForm('library_two', { kind: 'library' }),
      SQLSTATE.uniqueViolation,
      /forms_one_library_key/,
    );
    const p = await f.project(db);
    await expectSqlError(
      f.insert(db, 'forms', {
        id: randomUUID(),
        project_id: p.id,
        key: 'project_library',
        title_bn: 'লাইব্রেরি',
        title_en: 'Library',
        kind: 'library',
      }),
      SQLSTATE.checkViolation,
      /forms_library_check/,
    );
  });

  it('lets a project form name the ready form and version it copied, and only together', async () => {
    const source = await readyForm('placed_source');
    const p = await f.project(db);
    const placed = await f.insert(db, 'forms', {
      id: randomUUID(),
      project_id: p.id,
      key: 'placed',
      title_bn: 'বসানো',
      title_en: 'Placed',
      source_form_id: source,
      source_version_no: 1,
    });
    const { rows } = await db.query(`SELECT kind, source_form_id FROM forms WHERE id = $1`, [
      placed,
    ]);
    expect(rows[0]).toEqual({ kind: 'beneficiary_application', source_form_id: source });
    await expectSqlError(
      f.insert(db, 'forms', {
        id: randomUUID(),
        project_id: p.id,
        key: 'half',
        title_bn: 'অর্ধেক',
        title_en: 'Half',
        source_form_id: source,
      }),
      SQLSTATE.checkViolation,
      /forms_source_check/,
    );
    // a ready form is never itself a copy
    await expectSqlError(
      readyForm('copy_outside', { source_form_id: source, source_version_no: 1 }),
      SQLSTATE.checkViolation,
      /forms_source_check/,
    );
  });

  it('keeps a project form of the old shape as a beneficiary application form', async () => {
    const p = await f.project(db);
    const { rows } = await db.query(`SELECT kind, source_form_id FROM forms WHERE id = $1`, [
      p.form,
    ]);
    expect(rows[0]).toEqual({ kind: 'beneficiary_application', source_form_id: null });
  });
});

describe('the reverse of the migration', () => {
  const down = readFileSync(join(MIGRATIONS_DIR, '20261024100000_ready_forms', 'down.sql'), 'utf8');
  /** A fresh clone of the template, the setup on it, then the reverse; the clone is dropped after. */
  async function reverseAfter(setup: (c: Client) => Promise<unknown>): Promise<Client> {
    const clone = await cloneTemplate(inject('templateDb'));
    try {
      await setup(clone.client);
      await clone.client.query(down);
      const { rows } = await clone.client.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'forms' AND column_name = 'project_id'`,
      );
      expect(rows[0].is_nullable).toBe('NO');
      return clone.client;
    } finally {
      await clone.drop();
    }
  }
  const refused = /ready_forms_down/;

  it('removes the empty library when nothing else needs the new columns', async () => {
    await reverseAfter(async () => undefined);
  });

  it('refuses while a ready form exists', async () => {
    await expect(
      reverseAfter((c) =>
        f.insert(c, 'forms', {
          id: randomUUID(),
          project_id: null,
          key: 'down_ready',
          title_bn: 'তৈরি',
          title_en: 'Ready',
        }),
      ),
    ).rejects.toThrow(refused);
  });

  it('refuses while the library holds a section', async () => {
    await expect(
      reverseAfter(async (c) => {
        const { rows } = await c.query(
          `SELECT v.id FROM form_versions v JOIN forms f ON f.id = v.form_id WHERE f.kind = 'library'`,
        );
        await f.insert(c, 'form_sections', {
          id: randomUUID(),
          form_version_id: rows[0].id,
          key: 'library_part',
          title_bn: 'অংশ',
          title_en: 'Part',
          sort_order: 1,
        });
      }),
    ).rejects.toThrow(refused);
  });
});

describe('the retirement of the seeded form templates', () => {
  const sql = (file: string) =>
    readFileSync(join(MIGRATIONS_DIR, '20261024110000_retire_seeded_forms', file), 'utf8');
  const active = async (c: Client) =>
    (
      await c.query<{ key: string; active: boolean }>(
        `SELECT key, active FROM project_templates WHERE definition->>'kind' = 'form_template' ORDER BY key`,
      )
    ).rows;

  it('makes the active templates inactive, and the reverse turns on only those it retired', async () => {
    const clone = await cloneTemplate(inject('templateDb'));
    try {
      await seedFormTemplates(new SeedContext(clone.client));
      // one template was switched off before the migration: the reverse must leave it off
      await clone.client.query(
        `UPDATE project_templates SET active = false WHERE key = 'form_self_reliance_construction'`,
      );
      await clone.client.query(sql('migration.sql'));
      expect(await active(clone.client)).toEqual([
        { key: 'form_distribution', active: false },
        { key: 'form_self_reliance_construction', active: false },
      ]);
      await clone.client.query(sql('down.sql'));
      expect(await active(clone.client)).toEqual([
        { key: 'form_distribution', active: true },
        { key: 'form_self_reliance_construction', active: false },
      ]);
      const marked = await clone.client.query(
        `SELECT count(*)::int AS n FROM project_templates WHERE definition ? 'retired_by'`,
      );
      expect(marked.rows[0].n).toBe(0);
    } finally {
      await clone.drop();
    }
  });
});
