import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AuditEnforcementInterceptor } from '../audit/audit.decorator';
import { AuditWriter } from '../audit/audit-writer';
import { ENV, type Env } from '../config/env';
import { ApiExceptionFilter } from '../i18n/api-exception.filter';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CLOCK, systemClock } from './clock';
import { EnvelopeInterceptor } from './envelope';
import { PrismaService } from './prisma.service';

/**
 * Process-wide services of the backbone (SYSTEM_ARCHITECTURE 5): validated configuration, the
 * Prisma client, the clock, rate-limit storage, the audit writer and its enforcement, idempotency, the response
 * envelope and the localized error filter.
 */
@Global()
@Module({})
export class CoreModule {
  static register(env: Env): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: CLOCK, useValue: systemClock },
        PrismaService,
        AuditWriter,
        IdempotencyService,
        ThrottlerStorageService,
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_INTERCEPTOR, useClass: AuditEnforcementInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
      exports: [
        ENV,
        CLOCK,
        PrismaService,
        AuditWriter,
        IdempotencyService,
        ThrottlerStorageService,
      ],
    };
  }
}
