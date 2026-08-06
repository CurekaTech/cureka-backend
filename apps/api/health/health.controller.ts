import { Controller, Get } from '@nestjs/common';
import { RawResponse } from '@packages/common';
import { RedisHealthService } from '@packages/cache';

@Controller('health')
export class HealthController {
  constructor(private readonly redisHealth: RedisHealthService) {}

  /**
   * Liveness probe for CI/CD and load balancers.
   * Path: GET /api/v1/health
   * No DB/Redis dependency — HTTP 200 when the process is up.
   */
  @Get()
  @RawResponse()
  getLiveness() {
    return {
      status: 'ok',
    };
  }

  @Get('redis')
  async getRedisHealth() {
    const status = await this.redisHealth.check();
    return {
      service: 'redis',
      ...status,
    };
  }
}
