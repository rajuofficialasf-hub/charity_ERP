import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { NotificationDelivery } from '../notifications/delivery.js';
import type { DeliveryJob } from '../notifications/service.js';
import type { JobRunner } from './job-runner.js';
import { REGISTRATION_CLEANUP_CRON, type RegistrationCleanup } from './registration-cleanup.js';
import type { BeneficiaryMergeCandidatesService } from '../services/beneficiary-merge-candidates.js';
import { DUPLICATES_CRON, DUPLICATES_QUEUE } from './duplicates.js';
import { HELP_COUNTERS_CRON, HELP_COUNTERS_QUEUE, type HelpCountersJob } from './help-counters.js';
import {
  NAME_KEYS_CRON,
  NAME_KEYS_QUEUE,
  NAME_KEYS_SINGLETON,
  type NameKeysJob,
  queueNameKeys,
} from './name-keys.js';
import {
  FILE_DIMENSIONS_CRON,
  FILE_DIMENSIONS_QUEUE,
  type FileDimensionsJob,
} from './file-dimensions.js';
import { STORAGE_STATS_CRON, STORAGE_STATS_QUEUE, type StorageStats } from './storage-stats.js';
import { UPLOAD_SWEEP_CRON, type UploadSweep } from './upload-sweep.js';
import { LOCAL_KEY_CLEANUP_CRON, type LocalKeyCleanup } from './local-key-cleanup.js';
import { FILE_PROCESS_QUEUE, type FileProcessJob, type FileProcessor } from './file-process.js';
import { EXPORT_QUEUE, type ExportJobData, type ExportRunner } from './export-run.js';
import { EXPORT_SWEEP_CRON, type ExportSweep, type ExportSweepData } from './export-sweep.js';

/** The sample heartbeat job: proves enqueue, consume and scheduling end to end. */
export const HEARTBEAT_QUEUE = 'maintenance' as const;
/** Every five minutes: the scheduled job pattern. */
export const HEARTBEAT_CRON = '*/5 * * * *';

export interface HeartbeatData {
  kind: 'heartbeat';
}

/** The daily purge of unsubmitted registration drafts. */
export interface RegistrationCleanupData {
  kind: 'registration-cleanup';
}

/** The daily sweep of upload sessions that expired before they were finalized. */
export interface UploadSweepData {
  kind: 'upload-sweep';
}

/** The daily drop of device keys of sessions that ended long ago. */
export interface LocalKeyCleanupData {
  kind: 'local-key-cleanup';
}

type MaintenanceData =
  HeartbeatData | RegistrationCleanupData | UploadSweepData | LocalKeyCleanupData;

/** The services the consumers call; a missing one leaves its queue unconsumed. */
export interface ConsumerServices {
  registrationCleanup?: RegistrationCleanup;
  uploadSweep?: UploadSweep;
  localKeyCleanup?: LocalKeyCleanup;
  storageStats?: StorageStats;
  fileDimensions?: Pick<FileDimensionsJob, 'run' | 'hasWaiting'>;
  mergeCandidates?: Pick<BeneficiaryMergeCandidatesService, 'refreshAll'>;
  nameKeys?: Pick<NameKeysJob, 'run' | 'hasStale'>;
  helpCounters?: Pick<HelpCountersJob, 'run'>;
  fileProcessor?: FileProcessor;
  delivery?: NotificationDelivery;
  exportRunner?: Pick<ExportRunner, 'run'>;
  exportSweep?: Pick<ExportSweep, 'run'>;
}

/** Registers the consumers and schedules; runs in the worker, or in the api with JOBS_INLINE. */
export class JobConsumers {
  constructor(
    private readonly jobs: JobRunner,
    private readonly logger: Logger,
    private readonly services: ConsumerServices = {},
  ) {}

  async register(): Promise<void> {
    await this.jobs.work<MaintenanceData>(HEARTBEAT_QUEUE, async (job) => {
      if (job.data.kind === 'registration-cleanup') {
        if (!this.services.registrationCleanup)
          throw new Error('registration cleanup not configured');
        return this.services.registrationCleanup.run();
      }
      if (job.data.kind === 'upload-sweep') {
        if (!this.services.uploadSweep) throw new Error('upload sweep not configured');
        return this.services.uploadSweep.run();
      }
      if (job.data.kind === 'local-key-cleanup') {
        if (!this.services.localKeyCleanup) throw new Error('local key cleanup not configured');
        return this.services.localKeyCleanup.run();
      }
      this.logger.info({ jobId: job.id }, 'heartbeat');
      return { kind: job.data.kind, handledAt: new Date().toISOString() };
    });
    await this.jobs.schedule(HEARTBEAT_QUEUE, HEARTBEAT_CRON, { kind: 'heartbeat' });
    const { delivery } = this.services;
    // emails and SMS of the outbox, one at a time (the delivery throttles itself)
    if (delivery) await this.jobs.work<DeliveryJob>('notify', (job) => delivery.deliver(job.data));
    // each uploaded file: the scan, the photo metadata, the thumbnails and the near duplicates
    const { fileProcessor } = this.services;
    if (fileProcessor)
      await this.jobs.work<FileProcessJob>(FILE_PROCESS_QUEUE, (job) =>
        fileProcessor.process(job.data.fileId),
      );
    // the export files, one job at a time; the attempt decides whether a failure is the last
    // the daily sweep shares the queue, whose half-hour expiry fits its batches
    const { exportRunner, exportSweep } = this.services;
    if (exportRunner)
      await this.jobs.work<ExportJobData | ExportSweepData>(EXPORT_QUEUE, (job) => {
        if ('kind' in job.data) {
          if (!exportSweep) throw new Error('export sweep not configured');
          return exportSweep.run();
        }
        return exportRunner.run(job.data.jobId, job.retryCount, job.signal);
      });
    if (exportRunner && exportSweep)
      await this.jobs.schedule(
        EXPORT_QUEUE,
        EXPORT_SWEEP_CRON,
        { kind: 'export-sweep' } satisfies ExportSweepData,
        'export-sweep',
      );
    if (this.services.registrationCleanup)
      await this.jobs.schedule(
        HEARTBEAT_QUEUE,
        REGISTRATION_CLEANUP_CRON,
        { kind: 'registration-cleanup' },
        'registration-cleanup',
      );
    if (this.services.uploadSweep)
      await this.jobs.schedule(
        HEARTBEAT_QUEUE,
        UPLOAD_SWEEP_CRON,
        { kind: 'upload-sweep' },
        'upload-sweep',
      );
    if (this.services.localKeyCleanup)
      await this.jobs.schedule(
        HEARTBEAT_QUEUE,
        LOCAL_KEY_CLEANUP_CRON,
        { kind: 'local-key-cleanup' },
        'local-key-cleanup',
      );
    // the nightly storage figures of the system health page
    const { storageStats } = this.services;
    if (storageStats) {
      await this.jobs.work(STORAGE_STATS_QUEUE, () => storageStats.run());
      await this.jobs.schedule(STORAGE_STATS_QUEUE, STORAGE_STATS_CRON, {}, 'storage-stats');
    }
    // the sizes of the photos stored before the size was kept: nightly, and once now when any
    // photo still has none (a check that fails queues the run anyway; it writes nothing then)
    const { fileDimensions } = this.services;
    if (fileDimensions) {
      await this.jobs.work(FILE_DIMENSIONS_QUEUE, () => fileDimensions.run());
      await this.jobs.schedule(FILE_DIMENSIONS_QUEUE, FILE_DIMENSIONS_CRON, {}, 'file-dimensions');
      let waiting = true;
      try {
        waiting = await fileDimensions.hasWaiting();
      } catch (error) {
        this.logger.error({ err: error }, 'file sizes: the check for photos without a size failed');
      }
      try {
        if (waiting)
          await this.jobs.enqueue(FILE_DIMENSIONS_QUEUE, {}, { singletonKey: 'file-dimensions' });
      } catch (error) {
        this.logger.error({ err: error }, 'file sizes: the measuring job could not be queued');
      }
    }
    // the stored name keys: nightly, after a change of the spelling variants, and once now when a
    // profile or a family member has none or old ones (after the migration that added them)
    const { nameKeys } = this.services;
    if (nameKeys) {
      await this.jobs.work(NAME_KEYS_QUEUE, () => nameKeys.run());
      await this.jobs.schedule(
        NAME_KEYS_QUEUE,
        NAME_KEYS_CRON,
        {},
        'name-keys',
        NAME_KEYS_SINGLETON,
      );
      // a check that fails or runs out of time cannot say the keys are current: the job is queued
      // anyway and finds out itself (it writes nothing when nothing is stale)
      let stale = true;
      try {
        stale = await nameKeys.hasStale();
      } catch (error) {
        this.logger.error(
          { err: error },
          'name keys: the check for missing or stale keys failed or ran out of time; the key job is queued anyway',
        );
      }
      try {
        if (stale) {
          await queueNameKeys(this.jobs);
          this.logger.info('name keys missing or stale: the key job is queued');
        }
      } catch (error) {
        this.logger.error({ err: error }, 'name keys: the key job could not be queued');
      }
    }
    // the nightly recomputation of the suggested duplicate beneficiaries
    const { mergeCandidates } = this.services;
    if (mergeCandidates) {
      await this.jobs.work(DUPLICATES_QUEUE, () => mergeCandidates.refreshAll());
      await this.jobs.schedule(DUPLICATES_QUEUE, DUPLICATES_CRON, {}, 'duplicates');
    }
    // the nightly recount of the times each beneficiary was helped
    const { helpCounters } = this.services;
    if (helpCounters) {
      await this.jobs.work(HELP_COUNTERS_QUEUE, () => helpCounters.run());
      await this.jobs.schedule(HELP_COUNTERS_QUEUE, HELP_COUNTERS_CRON, {}, 'help-counters');
    }
    // the files the scan has not cleared yet; a catch-up that fails is logged and tried at the
    // next start, never in the way of the consumers and schedules above
    if (fileProcessor)
      try {
        const queued = await fileProcessor.queuePending(this.jobs);
        if (queued) this.logger.info({ files: queued }, 'uncleared files queued for processing');
      } catch (error) {
        this.logger.error({ err: error }, 'uncleared files not queued');
      }
  }
}

/**
 * Development runs the consumers inside the api process (JOBS_INLINE; production refuses it). Tests
 * never start them: each test file owns its database. A failure to start is logged and does not
 * stop the api, which still enqueues.
 */
export async function startInlineConsumers(
  env: Pick<Env, 'JOBS_INLINE' | 'NODE_ENV'>,
  jobs: JobRunner,
  logger: Logger,
  services: ConsumerServices = {},
): Promise<boolean> {
  if (!env.JOBS_INLINE || env.NODE_ENV === 'test') return false;
  try {
    await new JobConsumers(jobs, logger, services).register();
    return true;
  } catch (error) {
    logger.error({ err: error }, 'inline job consumers failed to start');
    return false;
  }
}
