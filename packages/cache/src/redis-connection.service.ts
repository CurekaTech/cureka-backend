import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildRedisClientOptions } from './redis-options.util';
import { probeRedis } from './redis-probe.util';

export interface IRedisHealthStatus {
  available: boolean;
  mode: 'redis' | 'memory-fallback';
  host?: string;
  port?: number;
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);
  private client: Redis | null = null;
  private reachable = false;
  private warnedUnavailable = false;
  private readonly host?: string;
  private readonly port: number;
  private readonly password?: string;
  private readonly username?: string;
  private readonly tls: boolean;
  private readonly connectTimeoutMs: number;
  private readonly operationTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.get<string>('REDIS_HOST') || undefined;
    this.port = this.configService.get<number>('REDIS_PORT', 6379);
    this.password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    this.username = this.configService.get<string>('REDIS_USERNAME') || undefined;
    this.tls = this.configService.get<string>('REDIS_TLS', 'false') === 'true';
    this.connectTimeoutMs = this.configService.get<number>('REDIS_CONNECT_TIMEOUT_MS', 5000);
    this.operationTimeoutMs = this.configService.get<number>('REDIS_OPERATION_TIMEOUT_MS', 2000);
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    this.reachable = await probeRedis({
      host: this.host!,
      port: this.port,
      password: this.password,
      username: this.username,
      tls: this.tls,
      timeoutMs: this.connectTimeoutMs,
    });

    if (!this.reachable) {
      this.logUnavailableOnce();
    } else {
      this.logger.log(`Redis reachable at ${this.host}:${this.port}`);
    }
  }

  isEnabled(): boolean {
    return Boolean(this.host);
  }

  isReachable(): boolean {
    return this.reachable;
  }

  isAvailable(): boolean {
    return this.reachable && this.client?.status === 'ready';
  }

  getClient(): Redis | null {
    if (!this.isEnabled() || !this.reachable) {
      return null;
    }

    if (!this.client) {
      this.client = new Redis(
        buildRedisClientOptions({
          host: this.host!,
          port: this.port,
          password: this.password,
          username: this.username,
          tls: this.tls,
          connectTimeoutMs: this.connectTimeoutMs,
        }),
      );

      this.client.on('connect', () => {
        this.logger.log(`Redis connected (${this.host}:${this.port})`);
      });
      this.client.on('ready', () => {
        this.logger.log('Redis ready');
      });
      this.client.on('reconnecting', () => {
        this.logger.warn('Redis reconnecting...');
      });
      this.client.on('error', (error: Error) => {
        if (error.message.includes('ECONNREFUSED')) {
          this.reachable = false;
          this.logUnavailableOnce();
          return;
        }
        this.logger.error(`Redis error: ${error.message}`);
      });
      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
      });
    }

    return this.client;
  }

  async withTimeout<T>(operation: () => Promise<T>, label: string): Promise<T> {
    const timeoutMs = this.operationTimeoutMs;
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  }

  async ping(): Promise<IRedisHealthStatus> {
    if (!this.isEnabled()) {
      return {
        available: false,
        mode: 'memory-fallback',
        error: 'REDIS_HOST is not configured',
      };
    }

    if (!this.reachable) {
      return {
        available: false,
        mode: 'memory-fallback',
        host: this.host,
        port: this.port,
        error: 'Redis is not reachable. Start it with: npm run redis:dev',
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        available: false,
        mode: 'memory-fallback',
        host: this.host,
        port: this.port,
        error: 'Redis client not initialized',
      };
    }

    const startedAt = Date.now();
    try {
      if (client.status !== 'ready') {
        await client.connect();
      }
      const response = await this.withTimeout(() => client.ping(), 'Redis PING');
      return {
        available: response === 'PONG',
        mode: 'redis',
        host: this.host,
        port: this.port,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        available: false,
        mode: 'redis',
        host: this.host,
        port: this.port,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      };
    }
  }

  private logUnavailableOnce(): void {
    if (this.warnedUnavailable) {
      return;
    }
    this.warnedUnavailable = true;
    this.logger.warn(
      `Redis unavailable at ${this.host}:${this.port}. Cache operations will fall back to PostgreSQL. Start Redis: npm run redis:dev`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
