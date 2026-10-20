import { uuidv7 } from '@css/shared';
import { isoDateInDhaka } from '@css/shared/format';
import { NISAB_MAX_DAYS_AHEAD, type NisabAdd, type NisabVersionView } from '@css/shared/settings';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

const SELECT = {
  id: true,
  value: true,
  effectiveFrom: true,
  basisNote: true,
  createdAt: true,
  withdrawnAt: true,
  withdrawReason: true,
  setByRef: { select: { id: true, displayName: true } },
  withdrawnByRef: { select: { id: true, displayName: true } },
} satisfies Prisma.NisabVersionSelect;

type Row = Prisma.NisabVersionGetPayload<{ select: typeof SELECT }>;

/** A `date` column as YYYY-MM-DD (Prisma reads it as midnight UTC). */
const dateOf = (d: Date) => d.toISOString().slice(0, 10);
const dateValue = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, days: number) =>
  dateOf(new Date(dateValue(iso).getTime() + days * 86_400_000));

const view = (r: Row, inForceId: string | null): NisabVersionView => ({
  id: r.id,
  value: r.value.toFixed(2),
  effectiveFrom: dateOf(r.effectiveFrom),
  basisNote: r.basisNote,
  setBy: { id: r.setByRef.id, name: r.setByRef.displayName },
  createdAt: r.createdAt.toISOString(),
  inForce: r.id === inForceId,
  withdrawn:
    r.withdrawnAt && r.withdrawnByRef
      ? {
          at: r.withdrawnAt.toISOString(),
          by: { id: r.withdrawnByRef.id, name: r.withdrawnByRef.displayName },
          reason: r.withdrawReason ?? '',
        }
      : null,
});

/**
 * The zakat nisab (docs/BUSINESS_RULES.md, the nisab rule; docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17):
 * one global list of versions, each in force from its effective date until the next live one. A
 * Program Manager or above adds a version that takes effect today or later (Dhaka date), at most a
 * year ahead and after the latest live version; a version is never edited or deleted. A version not
 * yet in effect may be withdrawn with a reason, so a mistaken entry cannot block the next one.
 * Zakat verification stores the version in force on its date on the application.
 */
export class NisabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
  ) {}

  /** Every version, newest effective date first, the one in force today marked. */
  async list(): Promise<NisabVersionView[]> {
    const rows = await this.prisma.nisabVersion.findMany({
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: SELECT,
    });
    const today = this.todayDate();
    const inForce = rows.find((r) => !r.withdrawnAt && dateOf(r.effectiveFrom) <= today);
    return rows.map((r) => view(r, inForce?.id ?? null));
  }

  /** The live version in force on a date (YYYY-MM-DD); 404 before the first one. */
  async inForceOn(date: string): Promise<NisabVersionView> {
    const row = await this.inForceOnDate(this.prisma, date);
    if (!row) throw new ApiError('permission.not_found', 404);
    const current = await this.inForceOnDate(this.prisma, this.todayDate());
    return view(row, current?.id ?? null);
  }

  async add(actor: Principal, body: NisabAdd): Promise<NisabVersionView> {
    return this.prisma.$transaction(async (tx) => {
      // one addition at a time, so two versions cannot both pass the "after the latest" check
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nisab_versions'))`;
      const today = this.todayDate();
      const latest = await this.latestLive(tx);
      if (
        body.effectiveFrom < today ||
        body.effectiveFrom > addDays(today, NISAB_MAX_DAYS_AHEAD) ||
        (latest && body.effectiveFrom <= dateOf(latest.effectiveFrom))
      )
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'effectiveFrom', code: 'nisab.effective_date' },
        ]);
      const row = await tx.nisabVersion.create({
        data: {
          id: uuidv7(),
          value: body.value,
          effectiveFrom: dateValue(body.effectiveFrom),
          basisNote: body.basisNote || null,
          setBy: actor.userId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        select: SELECT,
      });
      const added = view(row, body.effectiveFrom === today ? row.id : null);
      await this.audit.record(tx, {
        action: 'nisab.change',
        entityType: 'nisab_version',
        entityId: row.id,
        new: { value: added.value, effectiveFrom: added.effectiveFrom, basisNote: added.basisNote },
      });
      return added;
    });
  }

  /** Withdraw a version that has not taken effect; it stays listed and frees its date. */
  async withdraw(actor: Principal, id: string, reason: string): Promise<NisabVersionView> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nisab_versions'))`;
      const before = await tx.nisabVersion.findUnique({ where: { id }, select: SELECT });
      if (!before) throw new ApiError('permission.not_found', 404);
      if (before.withdrawnAt) throw new ApiError('nisab.withdrawn', 409);
      if (dateOf(before.effectiveFrom) <= this.todayDate())
        throw new ApiError('nisab.in_effect', 409);
      const row = await tx.nisabVersion.update({
        where: { id },
        data: {
          withdrawnAt: this.clock.now(),
          withdrawnBy: actor.userId,
          withdrawReason: reason,
          updatedBy: actor.userId,
        },
        select: SELECT,
      });
      await this.audit.record(tx, {
        action: 'nisab.change',
        entityType: 'nisab_version',
        entityId: id,
        old: { withdrawn: false },
        new: { withdrawn: true },
        reason,
      });
      return view(row, null);
    });
  }

  /** Today in Dhaka as YYYY-MM-DD. */
  todayDate(): string {
    return isoDateInDhaka(this.clock.now());
  }

  private inForceOnDate(db: Tx, date: string) {
    return db.nisabVersion.findFirst({
      where: { withdrawnAt: null, effectiveFrom: { lte: dateValue(date) } },
      orderBy: { effectiveFrom: 'desc' },
      select: SELECT,
    });
  }

  private latestLive(db: Tx) {
    return db.nisabVersion.findFirst({
      where: { withdrawnAt: null },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true },
    });
  }
}
