import type { Queue } from 'pg-boss';

/**
 * The job queues and their retry, backoff and expiry policies. Queues are created
 * by the install step; a new queue is added here and to the next `pnpm db:migrate`.
 */
export const QUEUES = {
  /** Offline batch processing (docs/architecture/OFFLINE_SYNC.md). */
  sync: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 300 },
  /** Outbound email and SMS deliveries (docs/architecture/NOTIFICATIONS.md). */
  notify: {
    retryLimit: 8,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: 3600,
    expireInSeconds: 120,
  },
  /** Monitoring computations and document deadlines. */
  alerts: { retryLimit: 3, retryDelay: 120, retryBackoff: true, expireInSeconds: 600 },
  /** CSV, XLSX and PDF exports. */
  exports: { retryLimit: 2, retryDelay: 60, retryBackoff: false, expireInSeconds: 1800 },
  /** Photo post-processing, duplicate hashing, donor photo emails. */
  photos: { retryLimit: 5, retryDelay: 60, retryBackoff: true, expireInSeconds: 600 },
  /**
   * Nightly storage growth figures (docs/architecture/SYSTEM_ARCHITECTURE.md, "Storage growth
   * reporting").
   */
  'storage-stats': { retryLimit: 3, retryDelay: 600, retryBackoff: false, expireInSeconds: 1800 },
  /** Nightly recomputation of the suggested duplicate beneficiaries. */
  duplicates: { retryLimit: 3, retryDelay: 600, retryBackoff: false, expireInSeconds: 1800 },
  /** Priority score recomputation. */
  scores: { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 600 },
  /** Housekeeping, including the sample heartbeat job. */
  maintenance: { retryLimit: 2, retryDelay: 60, retryBackoff: false, expireInSeconds: 120 },
} as const satisfies Record<string, Omit<Queue, 'name'>>;

export type QueueName = keyof typeof QUEUES;
export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

/** pg-boss tables live in their own schema, never in public. */
export const JOBS_SCHEMA = 'pgboss';
