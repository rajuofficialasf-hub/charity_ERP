import { uuidv7 } from '@css/shared';
import {
  type FamilyMemberRow,
  fieldPath,
  type FormDefinition,
  indexFields,
} from '@css/shared/forms';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { isForeignKeyViolation } from '../core/db-errors.js';
import type { Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import { memberKeysWith, type MatchKeysService } from './match-keys.js';

/** The list a family member's relationship code belongs to, as the form takes its options from. */
const RELATIONSHIP_LIST = 'relationship';
/** The oldest age a member's row takes; an answer outside 0 to this is the form's mistake. */
const AGE_MAX = 150;
/** The largest monthly income the column holds (numeric(14,2)). */
const INCOME_LIMIT = 1_000_000_000_000;
/** An income given as text: digits with an optional fraction, as an amount is written. */
// eslint-disable-next-line security/detect-unsafe-regex -- two runs of digits, no nesting: linear
const DECIMAL = /^\d+(?:\.\d+)?$/u;

/** One member's row as it is written, before its ids and keys. */
interface MemberValues {
  name: string;
  relationshipCode: string | null;
  ageYears: number | null;
  occupationCode: string | null;
  /** The checked amount with two decimals, the text the numeric column takes as it is. */
  monthlyIncome: string | null;
  isEarner: boolean;
}

const refused = (code: string, path = 'answers') =>
  new ApiError('validation.failed', 422, undefined, [{ path, code }]);

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** Whether a column of a row holds an answer: an empty text or an empty choice is none. */
const answered = (value: unknown): boolean =>
  value !== undefined &&
  value !== null &&
  !(typeof value === 'string' && value.trim() === '') &&
  !(Array.isArray(value) && value.length === 0);

/**
 * The values of one row of the family group, by the member columns the form may fill, or null for
 * a row that answers nothing (no member). A row that tells something of a member without naming
 * them is refused at the name (`namePath`), as the form engine names a missing answer. An age
 * that is not a whole number from 0 to 150, or an income below nothing or beyond what the column
 * holds, is refused as the form's mistake (422), never written and never a server error; an income
 * given as text is read only when it is written as an amount, and the number checked is the one
 * written.
 */
export function valuesOf(row: FamilyMemberRow, namePath: string): MemberValues | null {
  const { columns } = row;
  const name = textOf(columns.name);
  if (name === null) {
    const saysSomething = Object.entries(columns).some(
      ([column, value]) => column !== 'name' && answered(value),
    );
    if (saysSomething) throw refused('validation.required', namePath);
    return null;
  }
  const age = columns.age_years;
  let ageYears: number | null = null;
  if (answered(age)) {
    if (typeof age !== 'number' || !Number.isInteger(age) || age < 0 || age > AGE_MAX)
      throw refused('validation.out_of_range');
    ageYears = age;
  }
  const income = columns.monthly_income;
  let monthlyIncome: string | null = null;
  if (answered(income)) {
    let amount: number;
    if (typeof income === 'number') amount = income;
    else if (typeof income === 'string' && DECIMAL.test(income.trim()))
      amount = Number(income.trim());
    else throw refused('validation.amount_format');
    // the range is checked on the rounded amount, the one the column receives
    const written = Number.isFinite(amount) ? amount.toFixed(2) : null;
    if (written === null || amount < 0 || Number(written) >= INCOME_LIMIT)
      throw refused('validation.out_of_range');
    monthlyIncome = written;
  }
  return {
    name,
    relationshipCode: textOf(columns.relationship_code),
    ageYears,
    occupationCode: textOf(columns.occupation_code),
    monthlyIncome,
    isEarner: row.isEarner,
  };
}

/**
 * The person's active family members: how many, and the newest submission among the applications
 * they came from. A row of no application, or of an application since deleted, gives no time, so
 * such a list is older than any other; a rejected or withdrawn application still gives its time,
 * since a refusal does not make the family it listed untrue.
 */
async function activeListOf(
  tx: Tx,
  beneficiaryId: string,
): Promise<{ submittedAt: Date | null; count: number }> {
  const [standing] = await tx.$queryRaw<{ submitted_at: Date | null; count: bigint }[]>`
    SELECT max(a.submitted_at) AS submitted_at, count(m.id) AS count
      FROM beneficiary_family_members m
      LEFT JOIN applications a ON a.id = m.source_application_id AND a.status <> 'deleted'
     WHERE m.beneficiary_id = ${beneficiaryId}::uuid AND m.active`;
  return { submittedAt: standing?.submitted_at ?? null, count: Number(standing?.count ?? 0) };
}

/** Sets the person's active members inactive; answers their ids, in id order. */
async function deactivateList(tx: Tx, actorId: string, beneficiaryId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE beneficiary_family_members SET active = false, updated_by = ${actorId}::uuid,
           updated_at = now()
     WHERE beneficiary_id = ${beneficiaryId}::uuid AND active
    RETURNING id`;
  return rows.map((r) => r.id).sort();
}

/**
 * Of the two profiles a merge joins, only one family list stays active, by the rule of a
 * replacement: the list whose newest application was submitted later; a list of no (live)
 * application is the oldest, and on a tie the kept profile's list stays. Where only one profile
 * has a list, it stays. Runs before the merge moves the rows; answers the ids it set inactive, which
 * a revert sets active again.
 */
export async function keepOneFamilyList(
  tx: Tx,
  actorId: string,
  keptId: string,
  retiredId: string,
): Promise<string[]> {
  const kept = await activeListOf(tx, keptId);
  const retired = await activeListOf(tx, retiredId);
  if (!kept.count || !retired.count) return [];
  const time = (list: { submittedAt: Date | null }) =>
    list.submittedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return deactivateList(tx, actorId, time(kept) < time(retired) ? keptId : retiredId);
}

/**
 * Sets active again the members a merge set inactive, once the revert has moved the rows back, on a
 * profile that holds no other active member since: a list written after the merge is newer and
 * stays the only one.
 */
export async function restoreFamilyList(
  tx: Tx,
  actorId: string,
  ids: readonly string[],
): Promise<void> {
  if (!ids.length) return;
  await tx.$executeRaw`
    UPDATE beneficiary_family_members m SET active = true, updated_by = ${actorId}::uuid,
           updated_at = now()
     WHERE m.id = ANY(${ids}::uuid[]) AND NOT m.active
       AND NOT EXISTS (SELECT 1 FROM beneficiary_family_members o
                        WHERE o.beneficiary_id = m.beneficiary_id AND o.active
                          AND o.id <> ALL(${ids}::uuid[]))`;
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
 * members before and after and the ids of the rows it set inactive, never their details, so a list
 * replaced by a wrong link can be put back by hand.
 */
export class BeneficiaryFamilyMembersService {
  constructor(
    private readonly audit: AuditWriter,
    private readonly matchKeys: MatchKeysService,
  ) {}

  /**
   * Replaces the person's active members with the application's list, unless a newer list stands.
   * An application whose answers hold no member changes nothing: an empty group cannot be told
   * from one the form hid or the volunteer skipped, and a wholly blank row is no member.
   */
  async replaceFrom(
    tx: Tx,
    actor: Principal,
    input: {
      beneficiaryId: string;
      applicationId: string;
      /** When the application was submitted (or received for verification). */
      submittedAt: Date;
      /** The form version's definition, which names each group's name question. */
      definition: FormDefinition;
      rows: readonly FamilyMemberRow[];
    },
  ): Promise<void> {
    if (!input.rows.length) return;
    const nameQuestion = new Map<string, string>();
    for (const located of indexFields(input.definition).values())
      if (located.group !== null && located.field.standardColumn === 'name')
        nameQuestion.set(located.group, located.field.fieldKey);
    const members = input.rows
      .map((row) =>
        valuesOf(row, fieldPath(nameQuestion.get(row.group) ?? row.group, row.repeatIndex, true)),
      )
      .filter((m): m is MemberValues => m !== null);
    if (!members.length) return;
    await this.assertListed(tx, members);
    await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${input.beneficiaryId}::uuid FOR UPDATE`;
    const standing = await activeListOf(tx, input.beneficiaryId);
    if (standing.submittedAt && standing.submittedAt > input.submittedAt) return;
    // the name keys of every member from one read of the variants list, before any write
    const variants = await this.matchKeys.list(tx);
    const keyed = members.map((m) => ({ ...m, keys: memberKeysWith(variants, m.name) }));
    const deactivated = await deactivateList(tx, actor.userId, input.beneficiaryId);
    try {
      for (const member of keyed) {
        // an explicit insert: Prisma sends the schema default of the generated reference-list
        // columns (relationship_list, gender_list), which PostgreSQL refuses (428C9); each row
        // takes the clock's own time, so the members read back in the order the form gave them
        // (the transaction's time is one for all)
        await tx.$executeRaw`
          INSERT INTO beneficiary_family_members (id, beneficiary_id, source_application_id, name,
            relationship_code, age_years, occupation_code, monthly_income, is_earner, name_key,
            match_keys_version, created_by, updated_by, created_at, updated_at)
          VALUES (${uuidv7()}::uuid, ${input.beneficiaryId}::uuid, ${input.applicationId}::uuid,
            ${member.name}, ${member.relationshipCode}, ${member.ageYears}::smallint,
            ${member.occupationCode}, ${member.monthlyIncome}::numeric, ${member.isEarner},
            ${member.keys.nameKey}, ${member.keys.matchKeysVersion}::integer, ${actor.userId}::uuid,
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
      old: { activeMembers: deactivated.length },
      new: {
        activeMembers: members.length,
        applicationId: input.applicationId,
        // the rows set inactive, by id only: a list a wrong link replaced can be put back by hand
        deactivatedIds: deactivated,
      },
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
