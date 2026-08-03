import { Controller, Get } from '@nestjs/common';
import { RedisHealthService } from '@packages/cache';

@Controller('health')
export class HealthController {
  constructor(private readonly redisHealth: RedisHealthService) {}

  /**
   * Liveness probe for load balancers and CI/CD post-deploy checks.
   * Intentionally dependency-free so a brief Redis blip does not fail deploys.
   */
  @Get()
  getLiveness() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
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
