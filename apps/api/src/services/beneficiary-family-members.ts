import { uuidv7 } from '@css/shared';
import type { FamilyMemberRow } from '@css/shared/forms';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { isForeignKeyViolation } from '../core/db-errors.js';
import type { Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import type { MatchKeysService } from './match-keys.js';

/** The list a family member's relationship code belongs to, as the form takes its options from. */
const RELATIONSHIP_LIST = 'relationship';
/** The oldest age a member's row takes; an answer outside 0 to this is the form's mistake. */
const AGE_MAX = 150;
/** The largest monthly income the column holds (numeric(14,2)). */
const INCOME_LIMIT = 1_000_000_000_000;

/** One member's row as it is written, before its ids and keys. */
interface MemberValues {
  name: string;
  relationshipCode: string | null;
  ageYears: number | null;
  occupationCode: string | null;
  monthlyIncome: string | null;
  isEarner: boolean;
}

const refused = (code: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path: 'answers', code }]);

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * The values of one row of the family group, by the member columns the form may fill. An age that
 * is not a whole number from 0 to 150, or an income below nothing or above what the column holds,
 * is refused as the form's mistake (422), never written and never a server error.
 */
function valuesOf(row: FamilyMemberRow): MemberValues {
  const { columns } = row;
  const age = columns.age_years;
  let ageYears: number | null = null;
  if (age !== undefined && age !== null) {
    if (typeof age !== 'number' || !Number.isInteger(age) || age < 0 || age > AGE_MAX)
      throw refused('validation.out_of_range');
    ageYears = age;
  }
  const income = columns.monthly_income;
  let monthlyIncome: string | null = null;
  if (income !== undefined && income !== null && income !== '') {
    const amount = typeof income === 'number' ? income : Number(income);
    if (!Number.isFinite(amount) || amount < 0 || amount >= INCOME_LIMIT)
      throw refused('validation.out_of_range');
    monthlyIncome = typeof income === 'number' ? income.toFixed(2) : String(income);
  }
  return {
    // a row the form names no one in keeps an empty name: the answers are kept as given
    name: textOf(columns.name) ?? '',
    relationshipCode: textOf(columns.relationship_code),
    ageYears,
    occupationCode: textOf(columns.occupation_code),
    monthlyIncome,
    isEarner: row.isEarner,
  };
}

/**
 * The family members a submitted application carries, kept on the person's profile
 * (docs/database/DATABASE_SCHEMA.md, "beneficiary_family_members"). The list of the latest
 * submitted application that carries the family group is the one on the profile: it replaces the
 * person's active members, whose rows stay as they were with `active = false` (nothing is
 * deleted). An application is placed in that order by its submission time, so a list is replaced
 * only by an application submitted no earlier than the one the active rows came from: an entry
 * received earlier and verified later, or any other older list arriving late, leaves a newer list
 * as it is. The person's row is locked first, so two submissions for one person replace one after
 * the other. Each new member gets its name key; each replacement is audited with the number of
 * members before and after, never their details.
 */
export class BeneficiaryFamilyMembersService {
  constructor(
    private readonly audit: AuditWriter,
    private readonly matchKeys: MatchKeysService,
  ) {}

  /**
   * Replaces the person's active members with the application's list, unless a newer list stands.
   * An application whose answers hold no row of the family group changes nothing: an empty group
   * cannot be told from one the form hid or the volunteer skipped.
   */
  async replaceFrom(
    tx: Tx,
    actor: Principal,
    input: {
      beneficiaryId: string;
      applicationId: string;
      /** When the application was submitted (or received for verification). */
      submittedAt: Date;
      rows: readonly FamilyMemberRow[];
    },
  ): Promise<void> {
    if (!input.rows.length) return;
    const members = input.rows.map(valuesOf);
    await this.assertListed(tx, members);
    await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${input.beneficiaryId}::uuid FOR UPDATE`;
    // the newest application the active rows came from; rows of no application are older than any
    const [standing] = await tx.$queryRaw<{ submitted_at: Date | null; count: bigint }[]>`
      SELECT max(a.submitted_at) AS submitted_at, count(m.id) AS count
        FROM beneficiary_family_members m
        LEFT JOIN applications a ON a.id = m.source_application_id
       WHERE m.beneficiary_id = ${input.beneficiaryId}::uuid AND m.active`;
    const before = Number(standing?.count ?? 0);
    if (standing?.submitted_at && standing.submitted_at > input.submittedAt) return;
    await tx.beneficiaryFamilyMember.updateMany({
      where: { beneficiaryId: input.beneficiaryId, active: true },
      data: { active: false, updatedBy: actor.userId },
    });
    try {
      for (const member of members) {
        const keys = await this.matchKeys.ofMember(tx, member.name);
        // an explicit insert: the reference-list columns are generated by the database, and Prisma
        // would send their schema default; each row takes the clock's own time, so the members
        // read back in the order the form gave them (the transaction's time is one for all)
        await tx.$executeRaw`
          INSERT INTO beneficiary_family_members (id, beneficiary_id, source_application_id, name,
            relationship_code, age_years, occupation_code, monthly_income, is_earner, name_key,
            match_keys_version, created_by, updated_by, created_at, updated_at)
          VALUES (${uuidv7()}::uuid, ${input.beneficiaryId}::uuid, ${input.applicationId}::uuid,
            ${member.name}, ${member.relationshipCode}, ${member.ageYears}::smallint,
            ${member.occupationCode}, ${member.monthlyIncome}::numeric, ${member.isEarner},
            ${keys.nameKey}, ${keys.matchKeysVersion}::integer, ${actor.userId}::uuid,
            ${actor.userId}::uuid, clock_timestamp(), clock_timestamp())`;
      }
    } catch (error) {
      // the list lost a code between the check and the write
      if (isForeignKeyViolation(error)) throw refused('validation.option_unknown');
      throw error;
    }
    await this.audit.record(tx, {
      action: 'beneficiary.family_replaced',
      entityType: 'beneficiary',
      entityId: input.beneficiaryId,
      old: { activeMembers: before },
      new: { activeMembers: members.length, applicationId: input.applicationId },
    });
  }

  /**
   * Every relationship of the list is a code of the list `relationship`, as the form engine
   * requires of the question's options; a code the list no longer holds is the form's refusal.
   */
  private async assertListed(tx: Tx, members: readonly MemberValues[]): Promise<void> {
    const codes = [
      ...new Set(members.map((m) => m.relationshipCode).filter((c): c is string => c !== null)),
    ];
    if (!codes.length) return;
    const listed = await tx.referenceList.count({
      where: { listKey: RELATIONSHIP_LIST, code: { in: codes } },
    });
    if (listed !== codes.length) throw refused('validation.option_unknown');
  }
}
