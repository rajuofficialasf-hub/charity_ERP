import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AuditEnforcementInterceptor } from '../audit/audit.decorator';
import { AuditWriter } from '../audit/audit-writer';
import { ENV, type Env } from '../config/env';
import { ApiExceptionFilter } from '../i18n/api-exception.filter';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { RateLimitGuard } from '../rate-limit/rate-limit';
import { EnvelopeInterceptor } from './envelope';
import { PrismaService } from './prisma.service';

/**
 * Process-wide services of the backbone (SYSTEM_ARCHITECTURE 5): validated configuration, the
 * Prisma client, rate limits, the audit writer and its enforcement, idempotency, the response
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
        PrismaService,
        AuditWriter,
        IdempotencyService,
        ThrottlerStorageService,
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_INTERCEPTOR, useClass: AuditEnforcementInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
      exports: [ENV, PrismaService, AuditWriter, IdempotencyService],
    };
  }
}
