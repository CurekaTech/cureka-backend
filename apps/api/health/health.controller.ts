import { Controller, Get } from '@nestjs/common';
import { RedisHealthService } from '@packages/cache';

@Controller('health')
export class HealthController {
  constructor(private readonly redisHealth: RedisHealthService) {}

  /**
   * Liveness probe for CI/CD and load balancers.
   * No DB/Redis dependency — must return HTTP 200 when the process is up.
   */
  @Get()
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
