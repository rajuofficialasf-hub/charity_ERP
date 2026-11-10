import type { Env } from '../config/env.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { CHECK_TIMEOUT_MS, type HealthService, type Readiness } from '../health/service.js';

export interface StorageFigure {
  count: number;
  bytes: number;
}

export interface SystemHealthView extends Readiness {
  version: string;
  environment: Env['NODE_ENV'];
  otpDummy: boolean;
  /**
   * The last month (YYYY-MM) that has an audit log partition; entries after it cannot be written.
   * Null when the database did not answer.
   */
  auditPartitionsUntil: string | null;
  /** Null when the database did not answer in time; the checks then show it down. */
  storage: {
    total: StorageFigure;
    byKind: (StorageFigure & { kind: string })[];
    /**
     * Each bucket now, and its growth in bytes since the nightly snapshot of at least 30 days ago
     * (null until such a snapshot exists).
     */
    byBucket: (StorageFigure & { bucket: string; monthGrowth: number | null })[];
    /** The twelve months up to this one (Dhaka), oldest first; a month without files counts zero. */
    byMonth: (StorageFigure & { month: string })[];
    measuredAt: string;
  } | null;
}

/** How long the storage figures are reused: they are sums over every file record. */
const STORAGE_CACHE_MS = 60_000;

type Row = {
  kind: string | null;
  month: string | null;
  count: bigint;
  /** sum() over a bigint column is numeric, read as a decimal. */
  bytes: Prisma.Decimal | null;
};

/** A database read of the page may fail or hang; the page then still answers with the checks. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The system health page (docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17):
 * the readiness checks, the version, the dummy OTP state, how far the audit partitions reach, and
 * the storage growth from the file records (files not deleted) for the IT team.
 */
export class SystemHealthService {
  private cached: { at: number; storage: NonNullable<SystemHealthView['storage']> } | undefined;

  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly health: HealthService,
    private readonly clock: Clock,
  ) {}

  async view(): Promise<SystemHealthView> {
    const [readiness, partitions, storage] = await Promise.all([
      this.health.detail(),
      orNull(
        () => this.prisma.$queryRaw<{ last: string | null }[]>`
          SELECT max(c.relname) AS last FROM pg_inherits i
          JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent
          WHERE p.relname = 'audit_log'`,
      ),
      orNull(() => this.storage()),
    ]);
    const last = partitions?.[0]?.last?.match(/(\d{4})_(\d{2})$/);
    return {
      ...readiness,
      version: this.env.APP_VERSION,
      environment: this.env.NODE_ENV,
      otpDummy: this.env.OTP_DUMMY_ENABLED,
      auditPartitionsUntil: last ? `${last[1]}-${last[2]}` : null,
      storage,
    };
  }

  private async storage(): Promise<NonNullable<SystemHealthView['storage']>> {
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
      bytes: Number(r?.bytes?.toString() ?? 0),
    });
    const total = rows.find((r) => r.kind === null && r.month === null);
    const months = new Map(rows.filter((r) => r.month !== null).map((r) => [r.month!, r]));
    const byMonth = this.lastTwelveMonths(now).map((month) => ({
      month,
      ...figure(months.get(month)),
    }));
    const monthAgo = new Date(now - 30 * 86_400_000);
    const [buckets, snapshot] = await Promise.all([
      this.prisma.$queryRaw<{ bucket: string; count: bigint; bytes: Prisma.Decimal | null }[]>`
        SELECT bucket, count(*) AS count, sum(size_bytes) AS bytes
          FROM files WHERE deleted_at IS NULL GROUP BY bucket ORDER BY bucket`,
      this.prisma.$queryRaw<{ bucket: string | null; bytes: Prisma.Decimal | null }[]>`
        SELECT s.bucket, sum(s.bytes) AS bytes FROM storage_stats s
         WHERE s.captured_at = (SELECT max(captured_at) FROM storage_stats WHERE captured_at <= ${monthAgo})
         GROUP BY s.bucket`,
    ]);
    const before = new Map(snapshot.map((s) => [s.bucket, Number(s.bytes?.toString() ?? 0)]));
    const storage = {
      total: figure(total),
      byBucket: buckets.map((b) => {
        const bytes = Number(b.bytes?.toString() ?? 0);
        const then = before.get(b.bucket);
        return {
          bucket: b.bucket,
          count: Number(b.count),
          bytes,
          monthGrowth: snapshot.length ? bytes - (then ?? 0) : null,
        };
      }),
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
