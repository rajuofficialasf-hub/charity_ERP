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

  it('only needs_verification may lack a beneficiary (BR-104)', async () => {
    const p = await f.project(db);
    await expectSqlError(
      f.application(db, { project: p, loc }),
      SQLSTATE.checkViolation,
      /applications_beneficiary_check/,
    );
    await expect(
      f.application(db, { project: p, loc }, { status: 'needs_verification' }),
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

describe('registration drafts and contact changes (D-082, D-085)', () => {
  const draft = (over: Record<string, unknown> = {}) =>
    f.insert(db, 'registration_drafts', {
      id: randomUUID(),
      mobile: f.fakeMobile(),
      email: `d${randomUUID().slice(0, 8)}@example.org`,
      expires_at: new Date(Date.now() + 86_400_000),
      ...over,
    });

  it('a draft defaults to a volunteer with no lookups', async () => {
    const id = await draft();
    const row = (await db.query('SELECT * FROM registration_drafts WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ kind: 'volunteer', reference_lookups: 0, verified_at: null });
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
    await expect(
      draft({
        token_hash: 'h',
        verified_at: new Date(),
        submitted_user_id: u,
        submitted_at: new Date(),
      }),
    ).resolves.toBeTruthy();
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
