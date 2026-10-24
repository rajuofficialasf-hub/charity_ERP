import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { cloneTemplate } from './support/db';
import { expectSqlError, SQLSTATE } from './support/expect-sql';
import * as f from './support/fixtures';

// Forms outside projects: the ready forms PMs place, the one question library, and the source a
// placed copy names (D-125, D-129).
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
    await readyForm('srp_application');
    await readyForm('srp_survey', { kind: 'other' });
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
