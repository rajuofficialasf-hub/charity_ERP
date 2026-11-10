export type HealthStatus = 'pass' | 'warn' | 'fail';
export type CheckName = 'database' | 'storage' | 'queue';

/** Each dependency is checked with a time limit; a slow check counts as down. */
export const CHECK_TIMEOUT_MS = 2_000;

/**
 * A finished result is reused this long, so a flood of unauthenticated probes costs at most one
 * round of checks per window.
 */
export const RESULT_REUSE_MS = 2_000;

/**
 * The database and the job queue (both PostgreSQL) are needed by nearly every request; the file
 * store only by the file routes, so its outage makes the API degraded, not unready.
 */
const CHECKS: readonly { name: CheckName; critical: boolean }[] = [
  { name: 'database', critical: true },
  { name: 'queue', critical: true },
  { name: 'storage', critical: false },
];

export interface ReadinessChecks {
  database: () => Promise<boolean>;
  storage: () => Promise<boolean>;
  queue: () => Promise<boolean>;
}

export interface HealthLog {
  warn: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
}

/** Each check's result, shown on the system health page behind the global roles' session. */
export interface Readiness {
  ready: boolean;
  checks: Record<CheckName, 'up' | 'down'>;
}

interface Round {
  status: HealthStatus;
  checks: Readiness['checks'];
}

/** Why a check is down, in words safe to log: an error's class and code, never its message. */
type Outcome = { up: true } | { up: false; reason: string; code?: string };

async function check(run: () => Promise<boolean>): Promise<Outcome> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const answered = await Promise.race([
      run().then((ok) => (ok ? 'up' : 'unavailable')),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), CHECK_TIMEOUT_MS);
      }),
    ]);
    return answered === 'up' ? { up: true } : { up: false, reason: answered };
  } catch (error) {
    // driver messages can carry a connection string with its password, so only the kind is kept
    const code = (error as { code?: unknown } | null)?.code;
    return {
      up: false,
      reason: error instanceof Error ? error.name : 'unknown',
      ...(typeof code === 'string' ? { code } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Readiness of the API: the database, the job queue and the file store checked side by side.
 * Callers see the status alone; which check failed goes to the log only.
 */
export class HealthService {
  private inFlight: Promise<Round> | undefined;
  private last: { round: Round; at: number } | undefined;
  private shuttingDown = false;

  constructor(
    private readonly checks: ReadinessChecks,
    private readonly log: HealthLog,
  ) {}

  async readiness(): Promise<HealthStatus> {
    if (this.shuttingDown) return 'fail';
    return (await this.round()).status;
  }

  /** Every check's result, for the system health page; never for the public probe. */
  async detail(): Promise<Readiness> {
    const { checks } = await this.round();
    return { ready: Object.values(checks).every((c) => c === 'up'), checks };
  }

  /** From now on readiness fails, so the proxy stops sending new requests before the API stops. */
  markShuttingDown(): void {
    this.shuttingDown = true;
  }

  /** Drops the reused result, for tests that switch a dependency between calls. */
  forget(): void {
    this.last = undefined;
  }

  private round(): Promise<Round> {
    if (this.last && Date.now() - this.last.at < RESULT_REUSE_MS) {
      return Promise.resolve(this.last.round);
    }
    // callers that arrive while a round runs share it
    this.inFlight ??= this.checkAll().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async checkAll(): Promise<Round> {
    const runs = new Map(Object.entries(this.checks));
    const outcomes = await Promise.all(
      CHECKS.map(async ({ name, critical }) => ({
        name,
        critical,
        outcome: await check(runs.get(name)!),
      })),
    );
    let status: HealthStatus = 'pass';
    for (const { name, critical, outcome } of outcomes) {
      if (outcome.up) continue;
      const { up: _up, ...fields } = outcome;
      if (critical) {
        status = 'fail';
        this.log.error({ check: name, ...fields }, 'readiness check down');
      } else {
        if (status === 'pass') status = 'warn';
        this.log.warn({ check: name, ...fields }, 'readiness check down');
      }
    }
    const checks = Object.fromEntries(
      outcomes.map(({ name, outcome }) => [name, outcome.up ? 'up' : 'down']),
    ) as Readiness['checks'];
    const round = { status, checks };
    this.last = { round, at: Date.now() };
    return round;
  }
}
