import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ENV, type Env } from '../config/env';
import { ApiExceptionFilter } from '../i18n/api-exception.filter';
import { EnvelopeInterceptor } from './envelope';
import { PrismaService } from './prisma.service';

/**
 * Process-wide services of the backbone (SYSTEM_ARCHITECTURE 5): validated configuration, the
 * Prisma client, the response envelope and the localized error filter.
 */
@Global()
@Module({})
export class CoreModule {
  static register(env: Env): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: ENV, useValue: env },
        PrismaService,
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
      exports: [ENV, PrismaService],
    };
  }
}
