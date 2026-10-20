import type { Logger } from 'pino';
import type { Env } from '../config/env';
import type { NotificationDelivery } from '../notifications/delivery';
import type { DeliveryJob } from '../notifications/service';
import type { JobRunner } from './job-runner';
import { REGISTRATION_CLEANUP_CRON, type RegistrationCleanup } from './registration-cleanup';
import { STORAGE_STATS_CRON, STORAGE_STATS_QUEUE, type StorageStats } from './storage-stats';
import { UPLOAD_SWEEP_CRON, type UploadSweep } from './upload-sweep';
import { FILE_PROCESS_QUEUE, type FileProcessJob, type FileProcessor } from './file-process';

/** The sample heartbeat job: proves enqueue, consume and scheduling end to end (ADR-004). */
export const HEARTBEAT_QUEUE = 'maintenance' as const;
/** Every five minutes: the scheduled job pattern (ADR-004). */
export const HEARTBEAT_CRON = '*/5 * * * *';

export interface HeartbeatData {
  kind: 'heartbeat';
}

/** The daily purge of unsubmitted registration drafts (DECISION_LOG D-082). */
export interface RegistrationCleanupData {
  kind: 'registration-cleanup';
}

/** The daily sweep of upload sessions that expired before they were finalized. */
export interface UploadSweepData {
  kind: 'upload-sweep';
}

type MaintenanceData = HeartbeatData | RegistrationCleanupData | UploadSweepData;

/** The services the consumers call; a missing one leaves its queue unconsumed. */
export interface ConsumerServices {
  registrationCleanup?: RegistrationCleanup;
  uploadSweep?: UploadSweep;
  storageStats?: StorageStats;
  fileProcessor?: FileProcessor;
  delivery?: NotificationDelivery;
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
    // the nightly storage figures of the system health page
    const { storageStats } = this.services;
    if (storageStats) {
      await this.jobs.work(STORAGE_STATS_QUEUE, () => storageStats.run());
      await this.jobs.schedule(STORAGE_STATS_QUEUE, STORAGE_STATS_CRON, {}, 'storage-stats');
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
 * Development runs the consumers inside the api process (JOBS_INLINE, ADR-004; production refuses
 * it, BR-024). Tests never start them: each test file owns its database. A failure to start is
 * logged and does not stop the api, which still enqueues.
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
