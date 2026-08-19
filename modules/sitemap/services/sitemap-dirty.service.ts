import { Injectable, Logger } from '@nestjs/common';
import { RedisConnectionService } from '@packages/cache';
import { SITEMAP_DIRTY_KEY_PREFIX, SITEMAP_DIRTY_SET_KEY } from '../constants/sitemap-queue.constants';
import { SitemapGroup, SITEMAP_GROUPS } from '../config/sitemap-groups';

@Injectable()
export class SitemapDirtyService {
  private readonly logger = new Logger(SitemapDirtyService.name);

  constructor(private readonly redisConnection: RedisConnectionService) {}

  async markDirty(group: SitemapGroup): Promise<void> {
    const client = await this.redisConnection.getConnectedClient();
    if (!client) {
      this.logger.warn({ group }, 'Redis unavailable — sitemap dirty flag not stored');
      return;
    }
    await client.sadd(SITEMAP_DIRTY_SET_KEY, group);
    await client.set(`${SITEMAP_DIRTY_KEY_PREFIX}${group}`, '1');
  }

  async consumeDirty(group: SitemapGroup): Promise<boolean> {
    const client = await this.redisConnection.getConnectedClient();
    if (!client) return false;
    const key = `${SITEMAP_DIRTY_KEY_PREFIX}${group}`;
    const value = await client.get(key);
    await client.del(key);
    await client.srem(SITEMAP_DIRTY_SET_KEY, group);
    return value === '1';
  }

  async clearDirty(group: SitemapGroup): Promise<void> {
    const client = await this.redisConnection.getConnectedClient();
    if (!client) return;
    await client.srem(SITEMAP_DIRTY_SET_KEY, group);
    await client.del(`${SITEMAP_DIRTY_KEY_PREFIX}${group}`);
  }

  async listDirty(): Promise<SitemapGroup[]> {
    const client = await this.redisConnection.getConnectedClient();
    if (!client) return [...SITEMAP_GROUPS];
    const members = await client.smembers(SITEMAP_DIRTY_SET_KEY);
    return members.filter((value): value is SitemapGroup =>
      (SITEMAP_GROUPS as readonly string[]).includes(value),
    );
  }

  async isDirty(group: SitemapGroup): Promise<boolean> {
    const client = await this.redisConnection.getConnectedClient();
    if (!client) return true;
    const value = await client.get(`${SITEMAP_DIRTY_KEY_PREFIX}${group}`);
    return value === '1';
  }
}
