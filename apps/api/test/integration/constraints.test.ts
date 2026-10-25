import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { cloneTemplate } from './support/db';
import { expectSqlError, SQLSTATE } from './support/expect-sql';
import * as f from './support/fixtures';

// Unique, check and soft-delete constraints of DATABASE_SCHEMA.md (T1.2 data-integrity tests).
let db: Client;
let drop: () => Promise<void>;
let loc: Awaited<ReturnType<typeof f.locationTree>>;

beforeAll(async () => {
  ({ client: db, drop } = await cloneTemplate(inject('templateDb')));
  loc = await f.locationTree(db);
});
afterAll(async () => drop());

describe('beneficiary identity (BR-001, BR-002, BR-003)', () => {
  it('BR-003 NID is unique', async () => {
    const nid = f.fakeNid();
    await f.beneficiary(db, loc, { nid });
    await expectSqlError(
      f.beneficiary(db, loc, { nid }),
      SQLSTATE.uniqueViolation,
      /beneficiaries_nid_key/,
    );
  });

  it('BR-003 birth registration number is unique', async () => {
    const birthReg = '20261011000000001';
    await f.beneficiary(db, loc, { nid: null, birth_reg: birthReg });
    await expectSqlError(
      f.beneficiary(db, loc, { nid: null, birth_reg: birthReg }),
      SQLSTATE.uniqueViolation,
      /beneficiaries_birth_reg_key/,
    );
  });

  it('BR-001 NID or birth registration is mandatory', async () => {
    await expectSqlError(
      f.beneficiary(db, loc, { nid: null, birth_reg: null }),
      SQLSTATE.checkViolation,
      /beneficiaries_identity_check/,
    );
  });

  it('BR-002 NID must have 10, 13 or 17 digits', async () => {
    await expectSqlError(
      f.beneficiary(db, loc, { nid: '12345' }),
      SQLSTATE.checkViolation,
      /beneficiaries_nid_format/,
    );
    await expect(f.beneficiary(db, loc, { nid: '1000000000123' })).resolves.toBeTruthy();
  });

  it('mobile must be an 11-digit Bangladesh number (O-39) and is not unique (O-02)', async () => {
    await expectSqlError(
      f.beneficiary(db, loc, { mobile: '12345' }),
      SQLSTATE.checkViolation,
      /beneficiaries_mobile_format/,
    );
    const mobile = f.fakeMobile();
    await f.beneficiary(db, loc, { mobile });
    await expect(f.beneficiary(db, loc, { mobile })).resolves.toBeTruthy();
  });

  it('gender must be a code of the reference list (composite FK, section 5.2)', async () => {
    await expectSqlError(
      f.beneficiary(db, loc, { gender_code: 'unknown' }),
      SQLSTATE.foreignKeyViolation,
    );
  });
});

describe('BEN numbers and duplicate dismissals', () => {
  const benNo = async (id: string) =>
    (await db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [id])).rows[0]
      .ben_no as number;

  it('gives each new profile the next BEN number', async () => {
    const first = await benNo(await f.beneficiary(db, loc));
    const second = await benNo(await f.beneficiary(db, loc));
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it('refuses a BEN number another profile holds', async () => {
    const taken = await benNo(await f.beneficiary(db, loc));
    await expectSqlError(
      f.beneficiary(db, loc, { ben_no: taken }),
      SQLSTATE.uniqueViolation,
      /beneficiaries_ben_no_key/,
    );
  });

  it('never changes a BEN number once given', async () => {
    const id = await f.beneficiary(db, loc);
    await expectSqlError(
      db.query('UPDATE beneficiaries SET ben_no = ben_no + 1000000 WHERE id = $1', [id]),
      SQLSTATE.checkViolation,
      /ben_no/,
    );
  });

  const dismiss = (
    low: string,
    high: string,
    by: string,
    reason = 'আলাদা মানুষ, বাবার নাম ভিন্ন',
  ) =>
    db.query(
      `INSERT INTO beneficiary_merge_dismissals (id, low_id, high_id, reason, dismissed_by) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), low, high, reason, by],
    );
  const marks = async (low: string, high: string) =>
    (
      await db.query(
        'SELECT low_id, high_id, lifted_at FROM beneficiary_merge_dismissals WHERE low_id = $1 AND high_id = $2 ORDER BY dismissed_at, id',
        [low, high],
      )
    ).rows;
  const pair = async () => {
    const ids = [await f.beneficiary(db, loc), await f.beneficiary(db, loc)].sort();
    return { low: ids[0]!, high: ids[1]! };
  };

  it('keeps a dismissed pair in one order, the lower id first', async () => {
    const by = await f.user(db);
    const { low, high } = await pair();
    await expectSqlError(dismiss(high, low, by), SQLSTATE.checkViolation, /dismissals_pair_check/);
    await expectSqlError(dismiss(low, low, by), SQLSTATE.checkViolation, /dismissals_pair_check/);
    await dismiss(low, high, by);
    expect(await marks(low, high)).toEqual([{ low_id: low, high_id: high, lifted_at: null }]);
  });

  it('holds one active dismissal per pair, and a new one after the mark is lifted', async () => {
    const by = await f.user(db);
    const { low, high } = await pair();
    await dismiss(low, high, by);
    await expectSqlError(
      dismiss(low, high, by),
      SQLSTATE.uniqueViolation,
      /beneficiary_merge_dismissals_active_key/,
    );
    await db.query(
      `UPDATE beneficiary_merge_dismissals SET lifted_by = $1, lifted_at = now(), lift_reason = 'আবার যাচাই করা হবে' WHERE low_id = $2 AND high_id = $3`,
      [by, low, high],
    );
    await dismiss(low, high, by);
    const rows = await marks(low, high);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.lifted_at === null)).toHaveLength(1);
  });

  it('needs a reason of 3 to 1,000 characters, and lifts only with who, when and why', async () => {
    const by = await f.user(db);
    const { low, high } = await pair();
    await expectSqlError(dismiss(low, high, by, 'না'), SQLSTATE.checkViolation, /reason/);
    await expectSqlError(
      dismiss(low, high, by, 'ক'.repeat(1001)),
      SQLSTATE.checkViolation,
      /reason/,
    );
    await dismiss(low, high, by);
    await expectSqlError(
      db.query(
        'UPDATE beneficiary_merge_dismissals SET lifted_at = now() WHERE low_id = $1 AND high_id = $2',
        [low, high],
      ),
      SQLSTATE.checkViolation,
      /lift/,
    );
  });

  it('lifts a mark once and changes nothing else of it', async () => {
    const by = await f.user(db);
    const { low, high } = await pair();
    await dismiss(low, high, by);
    const where = 'WHERE low_id = $1 AND high_id = $2';
    await expectSqlError(
      db.query(`UPDATE beneficiary_merge_dismissals SET reason = 'অন্য কারণ লেখা হলো' ${where}`, [
        low,
        high,
      ]),
      SQLSTATE.insufficientPrivilege,
      /merge_dismissal_is_fixed/,
    );
    await db.query(
      `UPDATE beneficiary_merge_dismissals SET lifted_by = $3, lifted_at = now(), lift_reason = 'আবার যাচাই করা হবে' ${where}`,
      [low, high, by],
    );
    await expectSqlError(
      db.query(
        `UPDATE beneficiary_merge_dismissals SET lifted_by = NULL, lifted_at = NULL, lift_reason = NULL ${where}`,
        [low, high],
      ),
      SQLSTATE.insufficientPrivilege,
      /merge_dismissal_is_fixed/,
    );
  });

  it('refuses a reason of white space only', async () => {
    const by = await f.user(db);
    const { low, high } = await pair();
    await expectSqlError(dismiss(low, high, by, '     '), SQLSTATE.checkViolation, /reason/);
  });

  it('compares names with tabs, line breaks and extra spaces as the same name', async () => {
    const { rows } = await db.query(
      `SELECT person_name_key($1) = person_name_key($2) AND person_name_key($1) = 'মোছাঃ রহিমা খাতুন' AS same`,
      ['\tমোছাঃ  রহিমা\nখাতুন \n', 'মোছাঃ রহিমা খাতুন'],
    );
    expect(rows[0].same).toBe(true);
  });

  it('never deletes a dismissal', async () => {
    const by = await f.user(db);
    const { low, high } = await pair();
    await dismiss(low, high, by);
    await expectSqlError(
      db.query('DELETE FROM beneficiary_merge_dismissals WHERE low_id = $1', [low]),
      SQLSTATE.insufficientPrivilege,
      /append_only_table beneficiary_merge_dismissals/,
    );
    expect(await marks(low, high)).toHaveLength(1);
  });
});

describe('applications', () => {
  it('BR-016 one live application per beneficiary per project; allowed again after soft delete', async () => {
    const p = await f.project(db);
    const ben = await f.beneficiary(db, loc);
    const first = await f.application(db, { project: p, loc }, { beneficiary_id: ben });
    await expectSqlError(
      f.application(db, { project: p, loc }, { beneficiary_id: ben }),
      SQLSTATE.uniqueViolation,
      /applications_project_id_beneficiary_id_key/,
    );
    await db.query(`UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`, [
      first,
    ]);
    await expect(
      f.application(db, { project: p, loc }, { beneficiary_id: ben }),
    ).resolves.toBeTruthy();
  });

  it('soft delete: status deleted and deleted_at go together (BR-091)', async () => {
    const p = await f.project(db);
    const ben = await f.beneficiary(db, loc);
    await expectSqlError(
      f.application(db, { project: p, loc }, { beneficiary_id: ben, status: 'deleted' }),
      SQLSTATE.checkViolation,
      /applications_deleted_check/,
    );
    await expectSqlError(
      f.application(db, { project: p, loc }, { beneficiary_id: ben, deleted_at: new Date() }),
      SQLSTATE.checkViolation,
      /applications_deleted_check/,
    );
  });

  it('a submitted application has its person; a draft, a public entry, a rejected one and a deleted one may lack it', async () => {
    const p = await f.project(db);
    await expectSqlError(
      f.application(db, { project: p, loc }),
      SQLSTATE.checkViolation,
      /applications_beneficiary_check/,
    );
    for (const status of ['draft', 'needs_verification', 'rejected'])
      await expect(f.application(db, { project: p, loc }, { status })).resolves.toBeTruthy();
    await expect(
      f.application(db, { project: p, loc }, { status: 'deleted', deleted_at: new Date() }),
    ).resolves.toBeTruthy();
  });

  it('BR-194 client_uuid is unique (offline idempotency)', async () => {
    const p = await f.project(db);
    const clientUuid = randomUUID();
    await f.application(
      db,
      { project: p, loc },
      { status: 'needs_verification', client_uuid: clientUuid },
    );
    await expectSqlError(
      f.application(
        db,
        { project: p, loc },
        { status: 'needs_verification', client_uuid: clientUuid },
      ),
      SQLSTATE.uniqueViolation,
      /applications_client_uuid_key/,
    );
  });

  it('status must be a common workflow state (BD-11)', async () => {
    const p = await f.project(db);
    const ben = await f.beneficiary(db, loc);
    await expectSqlError(
      f.application(db, { project: p, loc }, { beneficiary_id: ben, status: 'invented' }),
      SQLSTATE.checkViolation,
      /applications_status_check/,
    );
  });
});

describe('client_uuid uniqueness on every offline record (BR-194)', () => {
  it.each(['activities', 'issues', 'expense_claims', 'dawah_classes', 'followup_evaluations'])(
    '%s.client_uuid is unique',
    async (table) => {
      const p = await f.project(db);
      const u = await f.user(db);
      const clientUuid = randomUUID();
      const ben = await f.beneficiary(db, loc);
      const vUser = await f.volunteerUser(db);
      const vol = await f.volunteer(db, loc, vUser);
      const row = () => {
        switch (table) {
          case 'activities':
            return {
              id: randomUUID(),
              project_id: p.id,
              type: 'visit',
              done_by: u,
              done_at: new Date(),
              client_uuid: clientUuid,
            };
          case 'issues':
            return {
              id: randomUUID(),
              project_id: p.id,
              type_code: 'other',
              description: 'নমুনা',
              raised_by: u,
              client_uuid: clientUuid,
            };
          case 'expense_claims':
            return {
              id: randomUUID(),
              project_id: p.id,
              volunteer_id: vol,
              client_uuid: clientUuid,
            };
          case 'dawah_classes':
            return {
              id: randomUUID(),
              project_id: p.id,
              daee_user_id: u,
              held_on: '2026-10-11',
              client_uuid: clientUuid,
            };
          default:
            return {
              id: randomUUID(),
              beneficiary_id: ben,
              evaluated_by: u,
              evaluated_at: new Date(),
              method: 'phone',
              client_uuid: clientUuid,
            };
        }
      };
      await f.insert(db, table, row());
      await expectSqlError(
        f.insert(db, table, row()),
        SQLSTATE.uniqueViolation,
        new RegExp(`${table}_client_uuid_key`),
      );
    },
  );

  it('stock_movements.client_uuid is unique', async () => {
    const p = await f.project(db);
    const vol = await f.volunteer(db, loc, await f.volunteerUser(db));
    const clientUuid = randomUUID();
    const row = () => ({
      id: randomUUID(),
      project_id: p.id,
      volunteer_id: vol,
      item: 'package',
      kind: 'sent',
      quantity: 10,
      client_uuid: clientUuid,
    });
    await f.insert(db, 'stock_movements', row());
    await expectSqlError(
      f.insert(db, 'stock_movements', row()),
      SQLSTATE.uniqueViolation,
      /stock_movements_client_uuid_key/,
    );
  });
});

describe('payments (BR-134)', () => {
  async function claim() {
    const p = await f.project(db);
    const vol = await f.volunteer(db, loc, await f.volunteerUser(db));
    const claimId = await f.insert(db, 'expense_claims', {
      id: randomUUID(),
      project_id: p.id,
      volunteer_id: vol,
    });
    await f.referenceCode(db, 'payment_method', 'bkash');
    return { p, claimId };
  }
  const payment = (projectId: string, over: Record<string, unknown>) =>
    f.insert(db, 'payments', {
      id: randomUUID(),
      project_id: projectId,
      type: 'volunteer_reimbursement',
      paid_on: '2026-10-11',
      amount: 500,
      method_code: 'bkash',
      transaction_id: randomUUID(),
      recorded_by: null,
      ...over,
    });

  it('BR-134 transaction_id is unique', async () => {
    const { p, claimId } = await claim();
    const u = await f.user(db);
    const tx = 'TRX-' + randomUUID();
    await payment(p.id, { expense_claim_id: claimId, transaction_id: tx, recorded_by: u });
    const other = await claim();
    await expectSqlError(
      payment(other.p.id, { expense_claim_id: other.claimId, transaction_id: tx, recorded_by: u }),
      SQLSTATE.uniqueViolation,
      /payments_transaction_id_key/,
    );
  });

  it('BR-134 a claim is paid only once', async () => {
    const { p, claimId } = await claim();
    const u = await f.user(db);
    await payment(p.id, { expense_claim_id: claimId, recorded_by: u });
    await expectSqlError(
      payment(p.id, { expense_claim_id: claimId, recorded_by: u }),
      SQLSTATE.uniqueViolation,
      /payments_expense_claim_id_key/,
    );
  });

  it('amount must be positive and the method a reference code', async () => {
    const { p, claimId } = await claim();
    const u = await f.user(db);
    await expectSqlError(
      payment(p.id, { expense_claim_id: claimId, recorded_by: u, amount: 0 }),
      SQLSTATE.checkViolation,
      /payments_amount_check/,
    );
    await expectSqlError(
      payment(p.id, { expense_claim_id: claimId, recorded_by: u, method_code: 'cheque' }),
      SQLSTATE.foreignKeyViolation,
    );
  });
});

describe('Qurbani animals (BR-145, O-19)', () => {
  it('a cow has 7 shares, a goat 1', async () => {
    const p = await f.project(db);
    await expectSqlError(
      f.insert(db, 'animals', {
        id: randomUUID(),
        project_id: p.id,
        type: 'cow',
        number: 1,
        total_shares: 5,
      }),
      SQLSTATE.checkViolation,
      /animals_total_shares_check/,
    );
  });

  it('allocated status and assigned volunteer go together; numbers are unique per project and type', async () => {
    const p = await f.project(db);
    await expectSqlError(
      f.insert(db, 'animals', {
        id: randomUUID(),
        project_id: p.id,
        type: 'goat',
        number: 1,
        total_shares: 1,
        status: 'allocated',
      }),
      SQLSTATE.checkViolation,
      /animals_allocated_check/,
    );
    await f.insert(db, 'animals', {
      id: randomUUID(),
      project_id: p.id,
      type: 'goat',
      number: 2,
      total_shares: 1,
    });
    await expectSqlError(
      f.insert(db, 'animals', {
        id: randomUUID(),
        project_id: p.id,
        type: 'goat',
        number: 2,
        total_shares: 1,
      }),
      SQLSTATE.uniqueViolation,
      /animals_project_id_type_number_key/,
    );
  });
});

describe('registration drafts and contact changes', () => {
  const draft = (over: Record<string, unknown> = {}) =>
    f.insert(db, 'registration_drafts', {
      id: randomUUID(),
      mobile: f.fakeMobile(),
      email: `d${randomUUID().slice(0, 8)}@example.org`,
      expires_at: new Date(Date.now() + 86_400_000),
      ...over,
    });

  /** Both channels verified, as a draft that holds a token (D-090). */
  const both = () => ({ mobile_verified_at: new Date(), email_verified_at: new Date() });

  it('a draft may start without contacts; a channel is verified only with its address, a token only with both; at most 6 sends (D-090)', async () => {
    await expect(draft({ mobile: null, email: null })).resolves.toBeTruthy();
    await expectSqlError(
      draft({ mobile: null, mobile_verified_at: new Date() }),
      SQLSTATE.checkViolation,
      /registration_drafts_mobile_verified_check/,
    );
    await expectSqlError(
      draft({ email: null, email_verified_at: new Date() }),
      SQLSTATE.checkViolation,
      /registration_drafts_email_verified_check/,
    );
    await expectSqlError(
      draft({ verified_at: new Date(), mobile_verified_at: new Date() }),
      SQLSTATE.checkViolation,
      /registration_drafts_channels_check/,
    );
    await expect(
      draft({ verified_at: new Date(), token_hash: 'h', ...both() }),
    ).resolves.toBeTruthy();
    await expectSqlError(
      draft({ otp_sends: 7 }),
      SQLSTATE.checkViolation,
      /registration_drafts_otp_sends_check/,
    );
    await expect(draft({ otp_sends: 6 })).resolves.toBeTruthy();
  });

  it('a draft defaults to a volunteer with no lookups', async () => {
    const id = await draft();
    const row = (await db.query('SELECT * FROM registration_drafts WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({
      kind: 'volunteer',
      reference_lookups: 0,
      otp_sends: 0,
      verified_at: null,
      mobile_verified_at: null,
      email_verified_at: null,
    });
    await expect(draft({ kind: 'staff' })).resolves.toBeTruthy();
  });

  it('refuses an unknown kind, a bad mobile, an upper-case email and more than 5 lookups', async () => {
    await expectSqlError(
      draft({ kind: 'system' }),
      SQLSTATE.checkViolation,
      /registration_drafts_kind_check/,
    );
    await expectSqlError(
      draft({ mobile: '12345' }),
      SQLSTATE.checkViolation,
      /registration_drafts_mobile_format/,
    );
    await expectSqlError(
      draft({ email: 'Upper@example.org' }),
      SQLSTATE.checkViolation,
      /registration_drafts_email_lower_check/,
    );
    await expectSqlError(
      draft({ reference_lookups: 6 }),
      SQLSTATE.checkViolation,
      /registration_drafts_reference_lookups_check/,
    );
    await expect(draft({ reference_lookups: 5 })).resolves.toBeTruthy();
  });

  it('the token goes with the verification and the submitted user with the submit time', async () => {
    await expectSqlError(
      draft({ token_hash: 'h' }),
      SQLSTATE.checkViolation,
      /registration_drafts_verified_check/,
    );
    await expectSqlError(
      draft({ submitted_at: new Date() }),
      SQLSTATE.checkViolation,
      /registration_drafts_submitted_check/,
    );
    const u = await f.volunteerUser(db);
    await expectSqlError(
      draft({
        token_hash: 'h',
        verified_at: new Date(),
        ...both(),
        submitted_user_id: u,
        submitted_at: new Date(),
      }),
      SQLSTATE.checkViolation,
      /registration_drafts_token_spent_check/,
    );
    await expect(
      draft({ verified_at: new Date(), ...both(), submitted_user_id: u, submitted_at: new Date() }),
    ).resolves.toBeTruthy();
  });

  it('the purge removes expired unsubmitted drafts with their photo rows and nothing else', async () => {
    const photo = (kind = 'profile_photo') =>
      f.insert(db, 'files', {
        id: randomUUID(),
        bucket: 'profiles',
        object_key: `purge/${randomUUID()}.jpg`,
        kind,
        mime: 'image/jpeg',
        size_bytes: 10,
        sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        source: 'camera',
      });
    const past = new Date(Date.now() - 60_000);
    const [p1, p2, p3, p4, p5] = [
      await photo(),
      await photo('nid_photo'),
      await photo(),
      await photo(),
      await photo('nid_photo'),
    ];
    // the NID back goes with the draft too (UX-18)
    const expired = await draft({
      expires_at: past,
      photo_file_id: p1,
      nid_photo_file_id: p2,
      nid_photo_back_file_id: p5,
    });
    const live = await draft({ photo_file_id: p3 });
    const u = await f.volunteerUser(db);
    const submitted = await draft({
      expires_at: past,
      verified_at: past,
      ...both(),
      submitted_user_id: u,
      submitted_at: past,
      photo_file_id: p4,
    });
    const keys = (
      await db.query('SELECT bucket, object_key FROM purge_expired_registration_drafts(100)')
    ).rows;
    const left = async (table: string, ids: string[]) =>
      (await db.query(`SELECT id FROM ${table} WHERE id = ANY($1)`, [ids])).rows.map((r) => r.id);
    expect(keys).toHaveLength(3);
    expect(keys.every((k) => k.bucket === 'profiles')).toBe(true);
    expect(await left('registration_drafts', [expired, live, submitted])).toEqual(
      expect.arrayContaining([live, submitted]),
    );
    expect(await left('registration_drafts', [expired])).toEqual([]);
    expect((await left('files', [p1, p2, p3, p4, p5])).sort()).toEqual([p3, p4].sort());
  });

  it('a discarded photo stays while a draft or a volunteer holds it as the NID back', async () => {
    const photo = () =>
      f.insert(db, 'files', {
        id: randomUUID(),
        bucket: 'profiles',
        object_key: `discard/${randomUUID()}.jpg`,
        kind: 'nid_photo',
        mime: 'image/jpeg',
        size_bytes: 10,
        sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        source: 'gallery',
      });
    const onDraft = await photo();
    await draft({ nid_photo_back_file_id: onDraft });
    const onVolunteer = await photo();
    const tree = await f.locationTree(db);
    const v = await f.volunteer(db, tree, await f.volunteerUser(db));
    await db.query('UPDATE volunteers SET nid_photo_back_file_id = $1 WHERE id = $2', [
      onVolunteer,
      v,
    ]);
    const loose = await photo();
    const discard = async (id: string) =>
      (await db.query('SELECT object_key FROM discard_registration_photo($1)', [id])).rows.length;
    expect(await discard(onDraft)).toBe(0);
    expect(await discard(onVolunteer)).toBe(0);
    expect(await discard(loose)).toBe(1);
  });

  it('otp_codes accept contact_change and still refuse an unknown purpose', async () => {
    const otp = (purpose: string) =>
      f.insert(db, 'otp_codes', {
        id: randomUUID(),
        purpose,
        channel: 'sms',
        address_hash: 'h',
        code_hash: 'c',
        expires_at: new Date(),
      });
    await expect(otp('contact_change')).resolves.toBeTruthy();
    await expectSqlError(otp('login'), SQLSTATE.checkViolation, /otp_codes_purpose_check/);
  });

  it('file_links accept the entity user and still refuse an unknown entity', async () => {
    const file = await f.insert(db, 'files', {
      id: randomUUID(),
      bucket: 'profiles',
      object_key: `test/${randomUUID()}.jpg`,
      kind: 'profile_photo',
      mime: 'image/jpeg',
      size_bytes: 10,
      sha256: 'a'.repeat(64),
      source: 'gallery',
    });
    const link = (entity: string) =>
      f.insert(db, 'file_links', {
        id: randomUUID(),
        file_id: file,
        entity_type: entity,
        entity_id: randomUUID(),
        slot: 'photo',
      });
    await expect(link('user')).resolves.toBeTruthy();
    await expectSqlError(link('donor'), SQLSTATE.checkViolation, /file_links_entity_type_check/);
  });
});

describe('other uniques', () => {
  it('users: mobile and email unique, at most one system owner', async () => {
    const mobile = f.fakeMobile();
    await f.volunteerUser(db, mobile);
    await expectSqlError(f.volunteerUser(db, mobile), SQLSTATE.uniqueViolation, /users_mobile_key/);
    await f.user(db, { email: 'same@example.org' });
    await expectSqlError(
      f.user(db, { email: 'same@example.org' }),
      SQLSTATE.uniqueViolation,
      /users_email_key/,
    );
    await f.user(db, { is_system_owner: true });
    await expectSqlError(
      f.user(db, { is_system_owner: true }),
      SQLSTATE.uniqueViolation,
      /users_is_system_owner_key/,
    );
  });

  it('volunteers: one volunteer per user and NID unique among volunteers (O-20)', async () => {
    const u = await f.volunteerUser(db);
    const nid = f.fakeNid();
    await f.volunteer(db, loc, u, { nid });
    await expectSqlError(
      f.volunteer(db, loc, await f.volunteerUser(db), { nid }),
      SQLSTATE.uniqueViolation,
      /volunteers_nid_key/,
    );
    await expectSqlError(
      f.volunteer(db, loc, u),
      SQLSTATE.uniqueViolation,
      /volunteers_user_id_key/,
    );
  });

  it('class attendance: one row per class, beneficiary and family member, also when the member is null', async () => {
    const p = await f.project(db);
    const u = await f.user(db);
    const ben = await f.beneficiary(db, loc);
    const cls = await f.insert(db, 'dawah_classes', {
      id: randomUUID(),
      project_id: p.id,
      daee_user_id: u,
      held_on: '2026-10-11',
    });
    await f.insert(db, 'class_attendance', {
      id: randomUUID(),
      class_id: cls,
      beneficiary_id: ben,
      present: true,
    });
    await expectSqlError(
      f.insert(db, 'class_attendance', {
        id: randomUUID(),
        class_id: cls,
        beneficiary_id: ben,
        present: true,
      }),
      SQLSTATE.uniqueViolation,
    );
    await expectSqlError(
      f.insert(db, 'class_attendance', {
        id: randomUUID(),
        class_id: cls,
        beneficiary_id: await f.beneficiary(db, loc),
        present: false,
      }),
      SQLSTATE.checkViolation,
      /class_attendance_absence_check/,
    );
  });

  it('locations: code unique; the kind must fit the level (D-061); divisions have no parent', async () => {
    await expectSqlError(
      f.insert(db, 'locations', {
        id: randomUUID(),
        level: 'division',
        kind: 'division',
        code: (await db.query('SELECT code FROM locations LIMIT 1')).rows[0].code,
        name_bn: 'ক',
        name_en: 'K',
      }),
      SQLSTATE.uniqueViolation,
      /locations_code_key/,
    );
    await expectSqlError(
      f.insert(db, 'locations', {
        id: randomUUID(),
        parent_id: loc.district,
        level: 'upazila',
        kind: 'pourosova',
        code: 'T-kind',
        name_bn: 'ক',
        name_en: 'K',
      }),
      SQLSTATE.checkViolation,
      /locations_kind_level_check/,
    );
    await expect(
      f.insert(db, 'locations', {
        id: randomUUID(),
        parent_id: loc.district,
        level: 'upazila',
        kind: 'city_corporation',
        code: 'T-cc',
        name_bn: 'সিটি কর্পোরেশন',
        name_en: 'City Corporation',
      }),
    ).resolves.toBeTruthy();
    await expectSqlError(
      f.insert(db, 'locations', {
        id: randomUUID(),
        level: 'district',
        kind: 'district',
        code: 'T-orphan',
        name_bn: 'ক',
        name_en: 'K',
      }),
      SQLSTATE.checkViolation,
      /locations_division_root_check/,
    );
  });

  it('files: deleted_at only for exports (BR-207)', async () => {
    await expectSqlError(
      f.insert(db, 'files', {
        id: randomUUID(),
        bucket: 'photos',
        object_key: randomUUID(),
        kind: 'evidence',
        mime: 'image/jpeg',
        size_bytes: 10,
        sha256: 'ab',
        source: 'camera',
        deleted_at: new Date(),
      }),
      SQLSTATE.checkViolation,
      /files_deleted_export_check/,
    );
  });
});

describe('rules versions, the consent log, team consent and the application counter', () => {
  async function assignment() {
    const p = await f.project(db);
    const owner = await f.user(db);
    const v = await f.volunteer(db, loc, await f.volunteerUser(db));
    const pv = await f.insert(db, 'project_volunteers', {
      id: randomUUID(),
      project_id: p.id,
      volunteer_id: v,
      region_location_id: loc.division,
      permission_set: 'application_distribution',
      assigned_by: owner,
    });
    return { project: p.id, owner, volunteer: v, assignment: pv };
  }

  it('the application counter and the rules version never go below zero', async () => {
    const a = await assignment();
    await expectSqlError(
      db.query('UPDATE project_volunteers SET applications_counted = -1 WHERE id = $1', [
        a.assignment,
      ]),
      SQLSTATE.checkViolation,
      /project_volunteers_applications_counted_check/,
    );
    await expectSqlError(
      db.query('UPDATE projects SET rules_version = -1 WHERE id = $1', [a.project]),
      SQLSTATE.checkViolation,
      /projects_rules_version_check/,
    );
  });

  it('a team membership has a consent state of its own, pending at first', async () => {
    const a = await assignment();
    const member = await f.volunteer(db, loc, await f.volunteerUser(db), { type: 'team_member' });
    const team = await f.insert(db, 'volunteer_teams', {
      id: randomUUID(),
      project_id: a.project,
      lead_volunteer_id: a.volunteer,
      member_volunteer_id: member,
    });
    const row = await db.query('SELECT consent_status FROM volunteer_teams WHERE id = $1', [team]);
    expect(row.rows[0].consent_status).toBe('pending');
    await expectSqlError(
      db.query(`UPDATE volunteer_teams SET consent_status = 'maybe' WHERE id = $1`, [team]),
      SQLSTATE.checkViolation,
      /volunteer_teams_consent_status_check/,
    );
  });

  it('a rules version is unique per project and kept for good', async () => {
    const a = await assignment();
    const version = { project_id: a.project, version: 1, texts: '{}', created_by: a.owner };
    await f.insert(db, 'project_rules_versions', { id: randomUUID(), ...version });
    await expectSqlError(
      f.insert(db, 'project_rules_versions', { id: randomUUID(), ...version }),
      SQLSTATE.uniqueViolation,
      /project_rules_versions_project_id_version_key/,
    );
    await expectSqlError(
      db.query('UPDATE project_rules_versions SET texts = $1', ['{"x":1}']),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
  });

  it('a consent belongs to one assignment or one membership, with a known decision and parts', async () => {
    const a = await assignment();
    await f.insert(db, 'project_rules_versions', {
      id: randomUUID(),
      project_id: a.project,
      version: 1,
      texts: '{}',
      created_by: a.owner,
    });
    const consent = (over: Record<string, unknown>) =>
      f.insert(db, 'project_consents', {
        id: randomUUID(),
        project_id: a.project,
        volunteer_id: a.volunteer,
        project_volunteer_id: a.assignment,
        rules_version: 1,
        decision: 'accepted',
        parts: ['volunteer_duties', 'misconduct'],
        created_by: a.owner,
        ...over,
      });
    await expect(consent({})).resolves.toBeTruthy();
    await expectSqlError(
      consent({ project_volunteer_id: null }),
      SQLSTATE.checkViolation,
      /project_consents_one_link_check/,
    );
    await expectSqlError(
      consent({ decision: 'pending' }),
      SQLSTATE.checkViolation,
      /project_consents_decision_check/,
    );
    await expectSqlError(
      consent({ parts: ['volunteer_duties', 'anything'] }),
      SQLSTATE.checkViolation,
      /project_consents_parts_check/,
    );
    await expectSqlError(
      db.query('DELETE FROM project_consents'),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
    await expectSqlError(
      db.query('TRUNCATE project_consents, project_rules_versions'),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
  });

  it('a consent names the volunteer and project of its own assignment and a saved version', async () => {
    const a = await assignment();
    const other = await assignment();
    await f.insert(db, 'project_rules_versions', {
      id: randomUUID(),
      project_id: a.project,
      version: 1,
      texts: '{}',
      created_by: a.owner,
    });
    const consent = (over: Record<string, unknown>) =>
      f.insert(db, 'project_consents', {
        id: randomUUID(),
        project_id: a.project,
        volunteer_id: a.volunteer,
        project_volunteer_id: a.assignment,
        rules_version: 1,
        decision: 'refused',
        created_by: a.owner,
        ...over,
      });
    // another volunteer's assignment, or another project's
    await expectSqlError(
      consent({ volunteer_id: other.volunteer }),
      SQLSTATE.foreignKeyViolation,
      /project_consent_link/,
    );
    await expectSqlError(
      consent({ project_volunteer_id: other.assignment }),
      SQLSTATE.foreignKeyViolation,
      /project_consent_link/,
    );
    // a version the project never saved
    await expectSqlError(
      consent({ rules_version: 2 }),
      SQLSTATE.foreignKeyViolation,
      /project_consent_version/,
    );
    // a team member consents on their own membership, not on the lead's
    const member = await f.volunteer(db, loc, await f.volunteerUser(db), { type: 'team_member' });
    const team = await f.insert(db, 'volunteer_teams', {
      id: randomUUID(),
      project_id: a.project,
      lead_volunteer_id: a.volunteer,
      member_volunteer_id: member,
    });
    await expect(
      consent({ project_volunteer_id: null, volunteer_team_id: team, volunteer_id: member }),
    ).resolves.toBeTruthy();
    await expectSqlError(
      consent({ project_volunteer_id: null, volunteer_team_id: team }),
      SQLSTATE.foreignKeyViolation,
      /project_consent_link/,
    );
  });
});

describe('official accounts (DECISION_LOG D-097)', () => {
  it('stores a job ID in capitals, unique, and never one that reads as a mobile number', async () => {
    await expect(f.user(db, { job_id: 'CON-0001' })).resolves.toBeTruthy();
    await expectSqlError(
      f.user(db, { job_id: 'CON-0001' }),
      SQLSTATE.uniqueViolation,
      /users_job_id_key/,
    );
    for (const bad of ['con-0002', 'CON 0002', '017-1234-5678', '8801712345678'])
      await expectSqlError(
        f.user(db, { job_id: bad }),
        SQLSTATE.checkViolation,
        /users_job_id_check/,
      );
    // a volunteer has no job ID
    await expectSqlError(
      f.user(db, { kind: 'volunteer', email: null, mobile: f.fakeMobile(), job_id: 'CON-0003' }),
      SQLSTATE.checkViolation,
      /users_job_id_check/,
    );
  });

  it('makes a staff row without an affiliation department staff; a unit only outside it', async () => {
    const staff = await f.user(db);
    const row = await db.query('SELECT affiliation FROM users WHERE id = $1', [staff]);
    expect(row.rows[0].affiliation).toBe('department');
    const volunteer = await f.volunteerUser(db);
    const v = await db.query('SELECT affiliation FROM users WHERE id = $1', [volunteer]);
    expect(v.rows[0].affiliation).toBeNull();
    await expect(
      f.user(db, { affiliation: 'external', affiliation_unit: 'সহযোগী সংস্থা' }),
    ).resolves.toBeTruthy();
    await expectSqlError(
      f.user(db, { affiliation: 'external' }),
      SQLSTATE.checkViolation,
      /users_affiliation_unit_check/,
    );
    await expectSqlError(
      f.user(db, { affiliation: 'department', affiliation_unit: 'আইটি' }),
      SQLSTATE.checkViolation,
      /users_affiliation_unit_check/,
    );
    await expectSqlError(
      f.user(db, { affiliation: 'partner', affiliation_unit: 'আইটি' }),
      SQLSTATE.checkViolation,
      /users_affiliation_check/,
    );
  });

  it('never lets an official report to themself', async () => {
    const id = randomUUID();
    await expectSqlError(
      f.user(db, { id, supervisor_user_id: id }),
      SQLSTATE.checkViolation,
      /users_supervisor_check/,
    );
  });

  it('keeps one open link per account and every link for good', async () => {
    const official = await f.user(db, { state: 'pending' });
    const link = () =>
      db.query(
        `INSERT INTO account_invitations (id, user_id, token_hash, expires_at, created_by) VALUES ($1, $2, $3, now() + interval '72 hours', $2) RETURNING id`,
        [randomUUID(), official, randomUUID()],
      );
    const first = (await link()).rows[0].id as string;
    await expectSqlError(link(), SQLSTATE.uniqueViolation, /account_invitations_user_id_open_key/);
    await db.query('UPDATE account_invitations SET revoked_at = now() WHERE id = $1', [first]);
    await expect(link()).resolves.toBeTruthy();
    await expectSqlError(
      db.query('DELETE FROM account_invitations WHERE id = $1', [first]),
      SQLSTATE.insufficientPrivilege,
      /append_only_table/,
    );
  });
});

describe('nisab versions', () => {
  const add = (setBy: string, effectiveFrom: string) =>
    db.query(
      `INSERT INTO nisab_versions (id, value, effective_from, set_by) VALUES ($1, 98500, $2, $3) RETURNING id`,
      [randomUUID(), effectiveFrom, setBy],
    );

  it('keeps one live version per date; a withdrawn one frees its date', async () => {
    const pm = await f.user(db);
    const first = (await add(pm, '2031-03-01')).rows[0].id as string;
    await expectSqlError(
      add(pm, '2031-03-01'),
      SQLSTATE.uniqueViolation,
      /nisab_versions_effective_from_key/,
    );
    await db.query(
      `UPDATE nisab_versions SET withdrawn_at = now(), withdrawn_by = $2, withdraw_reason = 'ভুল তারিখ' WHERE id = $1`,
      [first, pm],
    );
    const again = await add(pm, '2031-03-01');
    expect(again.rows).toHaveLength(1);
    expect(again.rows[0].id).not.toBe(first);
  });

  it('never withdraws a version that is already in effect', async () => {
    const pm = await f.user(db);
    const id = (await add(pm, '2020-01-01')).rows[0].id as string;
    await expectSqlError(
      db.query(
        `UPDATE nisab_versions SET withdrawn_at = now(), withdrawn_by = $2, withdraw_reason = 'ভুল' WHERE id = $1`,
        [id, pm],
      ),
      SQLSTATE.restrictViolation,
      /in effect is never withdrawn/,
    );
  });

  it('sets the withdrawal columns together', async () => {
    const pm = await f.user(db);
    const id = (await add(pm, '2031-04-01')).rows[0].id as string;
    await expectSqlError(
      db.query('UPDATE nisab_versions SET withdrawn_at = now() WHERE id = $1', [id]),
      SQLSTATE.checkViolation,
      /nisab_versions_withdrawal_check/,
    );
  });

  it('never changes or deletes a version, and writes a withdrawal once', async () => {
    const pm = await f.user(db);
    const id = (await add(pm, '2031-05-01')).rows[0].id as string;
    await expectSqlError(
      db.query('UPDATE nisab_versions SET value = 1 WHERE id = $1', [id]),
      SQLSTATE.restrictViolation,
      /never changes/,
    );
    await expectSqlError(
      db.query("UPDATE nisab_versions SET effective_from = '2031-05-02' WHERE id = $1", [id]),
      SQLSTATE.restrictViolation,
      /never changes/,
    );
    await expectSqlError(
      db.query('DELETE FROM nisab_versions WHERE id = $1', [id]),
      SQLSTATE.restrictViolation,
      /never deleted/,
    );
    await db.query(
      `UPDATE nisab_versions SET withdrawn_at = now(), withdrawn_by = $2, withdraw_reason = 'ভুল অংক' WHERE id = $1`,
      [id, pm],
    );
    await expectSqlError(
      db.query(`UPDATE nisab_versions SET withdraw_reason = 'অন্য কারণ' WHERE id = $1`, [id]),
      SQLSTATE.restrictViolation,
      /never changes/,
    );
  });
});

describe('upload sessions of the chunked upload', () => {
  const session = async () => {
    const userId = await f.volunteerUser(db);
    const id = randomUUID();
    await db.query(
      `INSERT INTO upload_sessions (id, user_id, declared, client_uuid, bucket, object_key, part_count, expires_at)
       VALUES ($1, $2, '{"size": 600000}', $3, 'photos', $4, 3, now() + interval '1 hour')`,
      [id, userId, randomUUID(), `p/a/photo/${id}.jpg`],
    );
    return { id, userId };
  };

  it('records the parts, bytes and expiry of an upload, but never moves its target or deletes it', async () => {
    const { id } = await session();
    await db.query(
      `UPDATE upload_sessions SET parts_received = '{1,2}', bytes_received = 524288,
       expires_at = now() + interval '1 hour' WHERE id = $1`,
      [id],
    );
    const stored = await db.query(
      'SELECT parts_received, bytes_received FROM upload_sessions WHERE id = $1',
      [id],
    );
    expect(stored.rows[0]).toEqual({ parts_received: [1, 2], bytes_received: '524288' });
    await expectSqlError(
      db.query('UPDATE upload_sessions SET bytes_received = 600001 WHERE id = $1', [id]),
      SQLSTATE.checkViolation,
    );
    await expectSqlError(
      db.query(`UPDATE upload_sessions SET object_key = 'elsewhere.jpg' WHERE id = $1`, [id]),
      SQLSTATE.insufficientPrivilege,
    );
    await expectSqlError(
      db.query('DELETE FROM upload_sessions WHERE id = $1', [id]),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('keeps one session per client id of a user, at most 80 parts, in a storage bucket', async () => {
    const { userId } = await session();
    const insert = (clientUuid: string, bucket: string, parts: number) =>
      db.query(
        `INSERT INTO upload_sessions (id, user_id, declared, client_uuid, bucket, object_key, part_count, expires_at)
         VALUES ($1, $2, '{}', $3, $4, 'k.jpg', $5, now())`,
        [randomUUID(), userId, clientUuid, bucket, parts],
      );
    const client = randomUUID();
    await insert(client, 'photos', 1);
    await expectSqlError(insert(client, 'photos', 1), SQLSTATE.uniqueViolation);
    await expectSqlError(insert(randomUUID(), 'photos', 81), SQLSTATE.checkViolation);
    await expectSqlError(insert(randomUUID(), 'uploads', 1), SQLSTATE.checkViolation);
  });
});
