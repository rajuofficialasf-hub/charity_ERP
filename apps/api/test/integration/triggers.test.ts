import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { cloneTemplate } from './support/db';
import { expectSqlError, inTransaction, SQLSTATE } from './support/expect-sql';
import * as f from './support/fixtures';

// Database triggers of DATABASE_SCHEMA.md (the data-integrity tests).
let db: Client;
let drop: () => Promise<void>;
let loc: Awaited<ReturnType<typeof f.locationTree>>;

beforeAll(async () => {
  ({ client: db, drop } = await cloneTemplate(inject('templateDb')));
  loc = await f.locationTree(db);
});
afterAll(async () => drop());

describe('beneficiary mobile is not the submitting volunteer mobile', () => {
  async function setup() {
    const p = await f.project(db);
    const mobile = f.fakeMobile();
    const volUser = await f.volunteerUser(db, mobile);
    const vol = await f.volunteer(db, loc, volUser);
    return { p, mobile, volUser, vol };
  }

  it('refuses an application whose beneficiary uses the owner volunteer mobile (at commit)', async () => {
    const { p, mobile, vol } = await setup();
    const ben = await f.beneficiary(db, loc, { mobile });
    await expectSqlError(
      inTransaction(db, () =>
        f.application(db, { project: p, loc }, { beneficiary_id: ben, owner_volunteer_id: vol }),
      ),
      SQLSTATE.checkViolation,
      /beneficiary_mobile_is_volunteer_mobile/,
    );
  });

  it('refuses when the creating user has the beneficiary mobile', async () => {
    const { p, mobile, volUser } = await setup();
    const ben = await f.beneficiary(db, loc, { mobile });
    await expectSqlError(
      inTransaction(db, () =>
        f.application(
          db,
          { project: p, loc },
          { beneficiary_id: ben, created_by_user_id: volUser },
        ),
      ),
      SQLSTATE.checkViolation,
      /beneficiary_mobile_is_volunteer_mobile/,
    );
  });

  it('catches a later change of the beneficiary mobile and of the volunteer mobile', async () => {
    const { p, mobile, volUser, vol } = await setup();
    const ben = await f.beneficiary(db, loc);
    await inTransaction(db, () =>
      f.application(db, { project: p, loc }, { beneficiary_id: ben, owner_volunteer_id: vol }),
    );
    await expectSqlError(
      inTransaction(db, () =>
        db.query('UPDATE beneficiaries SET mobile = $1 WHERE id = $2', [mobile, ben]),
      ),
      SQLSTATE.checkViolation,
    );
    const benMobile = (await db.query('SELECT mobile FROM beneficiaries WHERE id = $1', [ben]))
      .rows[0].mobile;
    await expectSqlError(
      inTransaction(db, () =>
        db.query('UPDATE users SET mobile = $1 WHERE id = $2', [benMobile, volUser]),
      ),
      SQLSTATE.checkViolation,
    );
  });

  it('allows different mobiles and public-link applications without owner or creator', async () => {
    const { p, vol } = await setup();
    await expect(
      inTransaction(db, async () =>
        f.application(
          db,
          { project: p, loc },
          { beneficiary_id: await f.beneficiary(db, loc), owner_volunteer_id: vol },
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      inTransaction(db, async () =>
        f.application(db, { project: p, loc }, { beneficiary_id: await f.beneficiary(db, loc) }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('log tables', () => {
  it('strict append-only tables refuse UPDATE, DELETE and TRUNCATE', async () => {
    const p = await f.project(db);
    await f.insert(db, 'budget_ledger', {
      id: randomUUID(),
      project_id: p.id,
      bucket: 'allocated',
      amount: 1000,
      reference_type: 'project',
      reference_id: p.id,
    });
    await expectSqlError(
      db.query('UPDATE budget_ledger SET amount = 1'),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
    await expectSqlError(
      db.query('DELETE FROM budget_ledger'),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
    await expectSqlError(
      db.query('TRUNCATE budget_ledger'),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
  });

  it('audit_log (partitioned) accepts inserts and refuses changes', async () => {
    await f.insert(db, 'audit_log', {
      id: randomUUID(),
      action: 'test.insert',
      entity_type: 'test',
    });
    await expectSqlError(
      db.query(`UPDATE audit_log SET action = 'x'`),
      SQLSTATE.insufficientPrivilege,
    );
    await expectSqlError(db.query('DELETE FROM audit_log'), SQLSTATE.insufficientPrivilege);
  });

  it('status logs allow only the listed columns and refuse DELETE', async () => {
    const u = await f.user(db);
    const id = await f.insert(db, 'notifications', {
      id: randomUUID(),
      user_id: u,
      template_key: 'test',
    });
    await db.query('UPDATE notifications SET read_at = now() WHERE id = $1', [id]);
    await expectSqlError(
      db.query(`UPDATE notifications SET template_key = 'changed' WHERE id = $1`, [id]),
      SQLSTATE.insufficientPrivilege,
      /only read_at, count, params may change/,
    );
    await expectSqlError(
      db.query('DELETE FROM notifications WHERE id = $1', [id]),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('expired OTP rows are deleted only by the cleanup job setting (section 21)', async () => {
    const id = await f.insert(db, 'otp_codes', {
      id: randomUUID(),
      purpose: 'registration',
      channel: 'sms',
      address_hash: 'h',
      code_hash: 'c',
      expires_at: new Date(),
    });
    await expectSqlError(
      db.query('DELETE FROM otp_codes WHERE id = $1', [id]),
      SQLSTATE.insufficientPrivilege,
    );
    await inTransaction(db, async () => {
      await db.query(`SET LOCAL css.cleanup = 'on'`);
      await db.query('DELETE FROM otp_codes WHERE id = $1', [id]);
    });
    expect((await db.query('SELECT 1 FROM otp_codes WHERE id = $1', [id])).rowCount).toBe(0);
  });
});

describe('other triggers', () => {
  it('a published form version cannot change', async () => {
    const p = await f.project(db);
    const section = await f.insert(db, 'form_sections', {
      id: randomUUID(),
      form_version_id: p.formVersion,
      key: 'basic',
      title_bn: 'মৌলিক',
      title_en: 'Basic',
      sort_order: 1,
    });
    // the version guard lets a draft publish only with its stamp
    await db.query(
      `UPDATE form_versions SET status = 'published', published_at = now(), published_by = $2 WHERE id = $1`,
      [p.formVersion, await f.user(db)],
    );
    await expectSqlError(
      db.query(`UPDATE form_sections SET title_en = 'Changed' WHERE id = $1`, [section]),
      SQLSTATE.checkViolation,
      /form_version_not_draft/,
    );
    await expectSqlError(
      f.insert(db, 'form_sections', {
        id: randomUUID(),
        form_version_id: p.formVersion,
        key: 'extra',
        title_bn: 'অতিরিক্ত',
        title_en: 'Extra',
        sort_order: 2,
      }),
      SQLSTATE.checkViolation,
    );
  });

  it('keeps one open draft per form and lets a version only go draft → published → retired', async () => {
    const p = await f.project(db);
    const user = await f.user(db);
    // a second draft of the same form is refused
    await expectSqlError(
      f.insert(db, 'form_versions', { id: randomUUID(), form_id: p.form, version_no: 2 }),
      SQLSTATE.uniqueViolation,
      /form_versions_one_draft_key/,
    );
    // a publish without its stamp, and a title change on a published row, are refused
    await expectSqlError(
      db.query(`UPDATE form_versions SET status = 'published' WHERE id = $1`, [p.formVersion]),
      SQLSTATE.checkViolation,
      /form_version_transition/,
    );
    await db.query(
      `UPDATE form_versions SET status = 'published', published_at = now(), published_by = $2 WHERE id = $1`,
      [p.formVersion, user],
    );
    await expectSqlError(
      db.query(`UPDATE form_versions SET version_no = 7 WHERE id = $1`, [p.formVersion]),
      SQLSTATE.checkViolation,
      /form_version_transition/,
    );
    await expectSqlError(
      db.query(`UPDATE form_versions SET status = 'draft' WHERE id = $1`, [p.formVersion]),
      SQLSTATE.checkViolation,
      /form_version_transition/,
    );
    // once published, a new draft may open; retiring passes and is final
    const next = await f.insert(db, 'form_versions', {
      id: randomUUID(),
      form_id: p.form,
      version_no: 2,
    });
    await db.query(`UPDATE form_versions SET status = 'retired' WHERE id = $1`, [p.formVersion]);
    await expectSqlError(
      db.query(`UPDATE form_versions SET status = 'published' WHERE id = $1`, [p.formVersion]),
      SQLSTATE.checkViolation,
      /form_version_transition/,
    );
    await expectSqlError(
      db.query(`UPDATE form_versions SET status = 'retired' WHERE id = $1`, [next]),
      SQLSTATE.checkViolation,
      /form_version_transition/,
    );
    const rows = await db.query(
      `SELECT status FROM form_versions WHERE form_id = $1 ORDER BY version_no`,
      [p.form],
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['retired', 'draft']);
  });

  it('a verified voucher is locked', async () => {
    const p = await f.project(db);
    const u = await f.user(db);
    const ben = await f.beneficiary(db, loc);
    const app = await f.application(db, { project: p, loc }, { beneficiary_id: ben });
    const voucher = await f.insert(db, 'vouchers', {
      id: randomUUID(),
      project_id: p.id,
      application_id: app,
      kind: 'purchase',
      amount: 100,
      submitted_by: u,
    });
    await db.query(
      `UPDATE vouchers SET status = 'verified', verified_by = $2, verified_at = now(), locked_at = now() WHERE id = $1`,
      [voucher, u],
    );
    await expectSqlError(
      db.query('UPDATE vouchers SET amount = 1 WHERE id = $1', [voucher]),
      SQLSTATE.checkViolation,
      /voucher_locked/,
    );
  });

  it('an allocated animal cannot move to another volunteer directly; shares fill the animal', async () => {
    const p = await f.project(db);
    const v1 = await f.volunteer(db, loc, await f.volunteerUser(db));
    const v2 = await f.volunteer(db, loc, await f.volunteerUser(db));
    const cow = await f.insert(db, 'animals', {
      id: randomUUID(),
      project_id: p.id,
      type: 'cow',
      number: 1,
      total_shares: 7,
    });
    const donor = await f.insert(db, 'donors', {
      id: randomUUID(),
      project_id: p.id,
      source: 'manual',
      name: 'নমুনা দাতা',
      mobile: f.fakeMobile(),
      amount: 0,
    });
    const donor2 = await f.insert(db, 'donors', {
      id: randomUUID(),
      project_id: p.id,
      source: 'manual',
      name: 'নমুনা দাতা ২',
      email: 'donor2@example.org',
      amount: 0,
    });
    await f.insert(db, 'animal_shares', {
      id: randomUUID(),
      animal_id: cow,
      donor_id: donor,
      shares: 7,
    });
    expect((await db.query('SELECT status FROM animals WHERE id = $1', [cow])).rows[0].status).toBe(
      'full',
    );
    await expectSqlError(
      f.insert(db, 'animal_shares', {
        id: randomUUID(),
        animal_id: cow,
        donor_id: donor2,
        shares: 1,
      }),
      SQLSTATE.checkViolation,
      /animal_shares_exceeded/,
    );
    await db.query(
      `UPDATE animals SET assigned_volunteer_id = $2, status = 'allocated' WHERE id = $1`,
      [cow, v1],
    );
    await expectSqlError(
      db.query('UPDATE animals SET assigned_volunteer_id = $2 WHERE id = $1', [cow, v2]),
      SQLSTATE.checkViolation,
      /animal_already_allocated/,
    );
    await db.query(
      `UPDATE animals SET assigned_volunteer_id = NULL, status = 'full' WHERE id = $1`,
      [cow],
    );
    await expect(
      db.query(
        `UPDATE animals SET assigned_volunteer_id = $2, status = 'allocated' WHERE id = $1`,
        [cow, v2],
      ),
    ).resolves.toBeTruthy();
  });

  it('the blocklist checks its subject and keeps the mirror flags in sync', async () => {
    const u = await f.user(db);
    const ben = await f.beneficiary(db, loc);
    await expectSqlError(
      f.insert(db, 'blocklist', {
        id: randomUUID(),
        subject_type: 'beneficiary',
        subject_id: randomUUID(),
        reason: 'পরীক্ষা',
        blocked_by: u,
      }),
      SQLSTATE.foreignKeyViolation,
    );
    const block = await f.insert(db, 'blocklist', {
      id: randomUUID(),
      subject_type: 'beneficiary',
      subject_id: ben,
      reason: 'পরীক্ষা',
      blocked_by: u,
    });
    expect(
      (await db.query('SELECT is_blocked FROM beneficiaries WHERE id = $1', [ben])).rows[0]
        .is_blocked,
    ).toBe(true);
    await db.query(
      'UPDATE blocklist SET active = false, released_at = now(), released_by = $2 WHERE id = $1',
      [block, u],
    );
    expect(
      (await db.query('SELECT is_blocked FROM beneficiaries WHERE id = $1', [ben])).rows[0]
        .is_blocked,
    ).toBe(false);

    const volUser = await f.volunteerUser(db);
    const vol = await f.volunteer(db, loc, volUser);
    await f.insert(db, 'blocklist', {
      id: randomUUID(),
      subject_type: 'volunteer',
      subject_id: vol,
      reason: 'পরীক্ষা',
      blocked_by: u,
    });
    expect((await db.query('SELECT state FROM users WHERE id = $1', [volUser])).rows[0].state).toBe(
      'blocked',
    );
  });

  it('media consent channels must be reference codes', async () => {
    const u = await f.user(db);
    const ben = await f.beneficiary(db, loc);
    await f.referenceCode(db, 'consent_channel', 'website');
    await expect(
      f.insert(db, 'media_consents', {
        id: randomUUID(),
        beneficiary_id: ben,
        granted: true,
        channels: ['website'],
        recorded_by: u,
      }),
    ).resolves.toBeTruthy();
    await expectSqlError(
      f.insert(db, 'media_consents', {
        id: randomUUID(),
        beneficiary_id: ben,
        granted: true,
        channels: ['tv'],
        recorded_by: u,
      }),
      SQLSTATE.foreignKeyViolation,
      /unknown_consent_channel/,
    );
  });

  it('the system owner flag cannot be removed while no other owner exists (AUTH.md section 11)', async () => {
    const existing = (await db.query('SELECT id FROM users WHERE is_system_owner')).rows[0]?.id as
      string | undefined;
    const owner = existing ?? (await f.user(db, { is_system_owner: true }));
    await expectSqlError(
      inTransaction(db, () =>
        db.query('UPDATE users SET is_system_owner = false WHERE id = $1', [owner]),
      ),
      SQLSTATE.checkViolation,
      /system_owner_required/,
    );
  });

  it('updated_at is set on every update (section 3)', async () => {
    const id = await f.user(db);
    await db.query(`UPDATE users SET updated_at = '2000-01-01' WHERE id = $1`, [id]);
    const { rows } = await db.query(
      "SELECT updated_at > now() - interval '1 minute' AS fresh FROM users WHERE id = $1",
      [id],
    );
    expect(rows[0].fresh).toBe(true);
  });

  it('generated columns compute the documented values', async () => {
    const p = await f.project(db, { cost_per_beneficiary: 1500, target_beneficiaries: 200 });
    expect(
      (await db.query('SELECT budget_planned FROM projects WHERE id = $1', [p.id])).rows[0]
        .budget_planned,
    ).toBe('300000.00');
    const ben = await f.beneficiary(db, loc, { members_14_plus: 3, children_under_14: 2 });
    expect(
      (await db.query('SELECT total_members FROM beneficiaries WHERE id = $1', [ben])).rows[0]
        .total_members,
    ).toBe(5);
    const u = await f.user(db);
    const act = await f.insert(db, 'activities', {
      id: randomUUID(),
      project_id: p.id,
      type: 'visit',
      done_by: u,
      done_at: '2026-10-11T19:30:00Z',
    });
    const { rows } = await db.query(
      `SELECT to_char(done_on, 'YYYY-MM-DD') AS d FROM activities WHERE id = $1`,
      [act],
    );
    expect(rows[0].d).toBe('2026-10-12'); // 01:30 next day in Asia/Dhaka
  });

  it('the stock balance view applies sent = distributed + remaining + damaged', async () => {
    const p = await f.project(db);
    const vol = await f.volunteer(db, loc, await f.volunteerUser(db));
    for (const [kind, quantity] of [
      ['sent', 10],
      ['distributed', 7],
      ['remaining', 2],
      ['damaged', 1],
    ] as const) {
      await f.insert(db, 'stock_movements', {
        id: randomUUID(),
        project_id: p.id,
        volunteer_id: vol,
        item: 'package',
        kind,
        quantity,
      });
    }
    const { rows } = await db.query(
      'SELECT sent, balanced FROM stock_balances WHERE project_id = $1',
      [p.id],
    );
    expect(rows[0]).toEqual({ sent: '10', balanced: true });
  });
});
