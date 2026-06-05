import { Controller, Get } from '@nestjs/common';
import { RedisHealthService } from '@packages/cache';

@Controller('health')
export class HealthController {
  constructor(private readonly redisHealth: RedisHealthService) {}

  @Get('redis')
  async getRedisHealth() {
    const status = await this.redisHealth.check();
    return {
      service: 'redis',
      ...status,
    };
  }
}
