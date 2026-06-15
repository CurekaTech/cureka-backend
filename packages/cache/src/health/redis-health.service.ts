import { Injectable } from '@nestjs/common';
import { IRedisHealthStatus, RedisConnectionService } from '../redis-connection.service';

@Injectable()
export class RedisHealthService {
  constructor(private readonly redisConnection: RedisConnectionService) {}

  async check(): Promise<IRedisHealthStatus> {
    return this.redisConnection.ping();
  }
}
