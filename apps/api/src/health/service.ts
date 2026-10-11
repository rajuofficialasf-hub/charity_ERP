import { timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env';

export type CheckName = 'database' | 'storage' | 'queue';
export type CheckResult = 'up' | 'down';

/** Each dependency is probed with a time limit; a slow probe counts as down. */
export const CHECK_TIMEOUT_MS = 2_000;

export interface ReadinessChecks {
  database: () => Promise<boolean>;
  storage: () => Promise<boolean>;
  queue: () => Promise<boolean>;
}

async function probe(check: () => Promise<boolean>): Promise<CheckResult> {
  try {
    const result = await Promise.race([
      check(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CHECK_TIMEOUT_MS)),
    ]);
    return result ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * Readiness (SYSTEM_ARCHITECTURE 10, D-057): database, object storage and the job queue. The
 * per-check detail is shown only to a caller with the HEALTH_TOKEN bearer token.
 */
export class HealthService {
  constructor(
    private readonly env: Env,
    private readonly checks: ReadinessChecks,
  ) {}

  async readiness(): Promise<{ ready: boolean; checks: Record<CheckName, CheckResult> }> {
    const [database, storage, queue] = await Promise.all([
      probe(this.checks.database),
      probe(this.checks.storage),
      probe(this.checks.queue),
    ]);
    const checks = { database, storage, queue };
    return { ready: Object.values(checks).every((v) => v === 'up'), checks };
  }

  /** True when the Authorization header carries the HEALTH_TOKEN (timing-safe). */
  authorized(header: string | undefined): boolean {
    const token = this.env.HEALTH_TOKEN;
    if (!token || !header?.startsWith('Bearer ')) return false;
    const given = Buffer.from(header.slice(7));
    const expected = Buffer.from(token);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
