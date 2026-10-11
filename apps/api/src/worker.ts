import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger, LoggerModule } from 'nestjs-pino';
import { loadEnv, type Env } from './config/env';
import { CoreModule } from './core/core.module';
import { loggerOptions } from './core/logging';
import { JobConsumers, JobsModule } from './jobs/jobs.module';
import { StorageModule } from './storage/storage.module';

/** The worker process (ADR-004, SYSTEM_ARCHITECTURE 2.1): job consumers, maintenance, schedules. */
@Module({})
class WorkerModule {
  static register(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        LoggerModule.forRoot({ pinoHttp: loggerOptions(env) }),
        CoreModule.register(env),
        StorageModule,
        JobsModule,
      ],
    };
  }
}

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule.register(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // SIGTERM stops intake and lets running jobs finish (JobRunner.onModuleDestroy, D-054).
  app.enableShutdownHooks();
  await app.get(JobConsumers).register();
}

void bootstrap();
