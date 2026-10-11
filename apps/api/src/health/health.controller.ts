import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { ENV, type Env } from '../config/env';
import { RawResponse } from '../core/envelope';
import { PrismaService } from '../core/prisma.service';
import { JobRunner } from '../jobs/job-runner';
import { Public } from '../openapi/api-contract';
import { RateLimit } from '../rate-limit/rate-limit';
import { STORAGE, type StorageAdapter } from '../storage/storage';

type CheckName = 'database' | 'storage' | 'queue';
const TIMEOUT_MS = 2_000;

async function check(probe: () => Promise<boolean>): Promise<'up' | 'down'> {
  try {
    const result = await Promise.race([
      probe(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), TIMEOUT_MS)),
    ]);
    return result ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * Liveness and readiness probes for Caddy and the IT team's uptime check (SYSTEM_ARCHITECTURE 10).
 * Served outside the /api/v1 prefix. `/health/live` reports only up or down; `/health/ready`
 * checks the database, object storage and the job queue, and shows the per-check detail only to a
 * caller with the HEALTH_TOKEN bearer token (D-057).
 */
// Probes live outside /api/v1 and outside the API contract (SYSTEM_ARCHITECTURE 10).
@ApiExcludeController()
@Public()
@RawResponse()
@RateLimit('none')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(JobRunner) private readonly jobs: JobRunner,
  ) {}

  @Get('live')
  live(): { status: 'up' } {
    return { status: 'up' };
  }

  @Get('ready')
  async ready(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'ready' | 'not_ready'; checks?: Record<CheckName, 'up' | 'down'> }> {
    const [database, storage, queue] = await Promise.all([
      check(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return true;
      }),
      check(() => this.storage.ping()),
      check(() => this.jobs.ping()),
    ]);
    const checks = { database, storage, queue };
    const ok = Object.values(checks).every((v) => v === 'up');
    res.status(ok ? 200 : 503);
    return {
      status: ok ? 'ready' : 'not_ready',
      ...(this.authorized(authorization) ? { checks } : {}),
    };
  }

  private authorized(header: string | undefined): boolean {
    const token = this.env.HEALTH_TOKEN;
    if (!token || !header?.startsWith('Bearer ')) return false;
    const given = Buffer.from(header.slice(7));
    const expected = Buffer.from(token);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
