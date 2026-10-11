import { Controller, Get } from '@nestjs/common';

/**
 * Liveness probe for Caddy and the IT team's uptime check (SYSTEM_ARCHITECTURE section 10).
 * Served at /health/live outside the /api/v1 prefix; it reports only up or down. The readiness
 * probe with database, storage and queue checks arrives in T1.6.
 */
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'up' } {
    return { status: 'up' };
  }
}
