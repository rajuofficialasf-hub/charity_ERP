import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Env } from './config/env';
import { CoreModule } from './core/core.module';
import { loggerOptions } from './core/logging';
import { RequestContextMiddleware } from './core/request-context.middleware';
import { HealthModule } from './health/health.module';

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
        LoggerModule.forRoot({ pinoHttp: loggerOptions(env, options.logStream) }),
        CoreModule.register(env),
        HealthModule,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
