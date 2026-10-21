/**
 * The nightly recomputation of the suggested duplicate pairs, at 02:45 Dhaka time on its own queue
 * (jobs/queues.ts), after the storage figures; between the runs each profile's pairs are kept up to
 * date by the write that changes it (services/beneficiary-merge-candidates.ts).
 */
export const DUPLICATES_CRON = '45 2 * * *';
export const DUPLICATES_QUEUE = 'duplicates' as const;
