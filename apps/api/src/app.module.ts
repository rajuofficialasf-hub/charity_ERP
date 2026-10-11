import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Env } from './config/env';
import { CoreModule } from './core/core.module';
import { loggerOptions } from './core/logging';
import { RequestContextMiddleware } from './core/request-context.middleware';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';

/** Every route, in the named-wildcard syntax of Nest 11 (path-to-regexp 8). */
const ALL_ROUTES = { path: '*path', method: RequestMethod.ALL };

export interface AppOptions {
  /** Test hook: where log lines go (default stdout). */
  logStream?: DestinationStream;
}

@Module({})
export class AppModule implements NestModule {
  /** The API application for a validated configuration (main.ts, tests). */
  static register(env: Env, options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: loggerOptions(env, options.logStream),
          forRoutes: [ALL_ROUTES],
        }),
        CoreModule.register(env),
        StorageModule,
        NotificationsModule,
        JobsModule,
        HealthModule,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes(ALL_ROUTES);
  }
}
