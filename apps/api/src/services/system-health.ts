import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
import type { HealthService, Readiness } from '../health/service';

export interface StorageFigure {
  count: number;
  bytes: number;
}

export interface SystemHealthView extends Readiness {
  version: string;
  environment: Env['NODE_ENV'];
  otpDummy: boolean;
  /** The last month (YYYY-MM) that has an audit log partition; entries after it cannot be written. */
  auditPartitionsUntil: string | null;
  storage: {
    total: StorageFigure;
    byKind: (StorageFigure & { kind: string })[];
    /** The twelve months up to this one (Dhaka), oldest first; a month without files counts zero. */
    byMonth: (StorageFigure & { month: string })[];
    measuredAt: string;
  };
}

/** How long the storage figures are reused: they are sums over every file record. */
const STORAGE_CACHE_MS = 60_000;

type Row = { kind: string | null; month: string | null; count: bigint; bytes: bigint | null };

/**
 * The system health page (docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17):
 * the readiness checks, the version, the dummy OTP state, how far the audit partitions reach, and
 * the storage growth from the file records (files not deleted) for the IT team.
 */
export class SystemHealthService {
  private cached: { at: number; storage: SystemHealthView['storage'] } | undefined;

  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly health: HealthService,
    private readonly clock: Clock,
  ) {}

  async view(): Promise<SystemHealthView> {
    const [readiness, partitions, storage] = await Promise.all([
      this.health.readiness(),
      this.prisma.$queryRaw<{ last: string | null }[]>`
        SELECT max(c.relname) AS last FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = 'audit_log'`,
      this.storage(),
    ]);
    const last = partitions[0]?.last?.match(/(\d{4})_(\d{2})$/);
    return {
      ...readiness,
      version: this.env.APP_VERSION,
      environment: this.env.NODE_ENV,
      otpDummy: this.env.OTP_DUMMY_ENABLED,
      auditPartitionsUntil: last ? `${last[1]}-${last[2]}` : null,
      storage,
    };
  }

  private async storage(): Promise<SystemHealthView['storage']> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.at < STORAGE_CACHE_MS) return this.cached.storage;
    // one pass: the total, each kind and each Dhaka month of the last twelve
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT kind, to_char(date_trunc('month', uploaded_at AT TIME ZONE 'Asia/Dhaka'), 'YYYY-MM') AS month,
             count(*) AS count, sum(size_bytes) AS bytes
      FROM files WHERE deleted_at IS NULL
      GROUP BY GROUPING SETS ((), (kind), (date_trunc('month', uploaded_at AT TIME ZONE 'Asia/Dhaka')))`;
    const figure = (r?: Row): StorageFigure => ({
      count: Number(r?.count ?? 0),
      bytes: Number(r?.bytes ?? 0),
    });
    const total = rows.find((r) => r.kind === null && r.month === null);
    const months = new Map(rows.filter((r) => r.month !== null).map((r) => [r.month!, r]));
    const byMonth = this.lastTwelveMonths(now).map((month) => ({
      month,
      ...figure(months.get(month)),
    }));
    const storage = {
      total: figure(total),
      byKind: rows
        .filter((r) => r.kind !== null)
        .map((r) => ({ kind: r.kind!, ...figure(r) }))
        .sort((a, b) => b.bytes - a.bytes || a.kind.localeCompare(b.kind)),
      byMonth,
      measuredAt: new Date(now).toISOString(),
    };
    this.cached = { at: now, storage };
    return storage;
  }

  private lastTwelveMonths(now: number): string[] {
    // Dhaka is six hours ahead of UTC all year
    const dhaka = new Date(now + 6 * 3_600_000);
    const months: string[] = [];
    for (let back = 11; back >= 0; back--) {
      const d = new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth() - back, 1));
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }
}
