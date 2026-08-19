import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Queue } from 'bullmq';
import { SITEMAP_JOB_NAMES } from '../constants/sitemap-queue.constants';
import { SitemapGroup, isSitemapGroup } from '../config/sitemap-groups';
import { SitemapDirtyService } from './sitemap-dirty.service';

@Injectable()
export class SitemapQueueService {
  private readonly logger = new Logger(SitemapQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SITEMAP) private readonly queue: Queue,
    private readonly dirtyService: SitemapDirtyService,
    private readonly configService: ConfigService,
  ) {}

  async enqueueGroup(group: SitemapGroup): Promise<void> {
    if (!this.configService.get<boolean>('sitemap.enabled')) return;
    await this.dirtyService.markDirty(group);
    const jobId = `sitemap-generate-${group}`;
    const shouldEnqueue = await this.prepareReusableJobId(jobId);
    if (!shouldEnqueue) {
      this.logger.debug({ group }, 'Sitemap group generation already active — left dirty');
      return;
    }

    const delay = this.configService.get<number>('sitemap.debounceMs') ?? 60_000;
    await this.queue.add(
      SITEMAP_JOB_NAMES.GENERATE_GROUP,
      { group },
      {
        jobId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
    this.logger.log({ group, delay, jobId }, 'Enqueued debounced sitemap generation');
  }

  async enqueueAll(): Promise<void> {
    if (!this.configService.get<boolean>('sitemap.enabled')) return;
    const jobId = 'sitemap-generate-all';
    const shouldEnqueue = await this.prepareReusableJobId(jobId);
    if (!shouldEnqueue) return;
    await this.queue.add(
      SITEMAP_JOB_NAMES.GENERATE_ALL,
      {},
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    );
  }

  async enqueueAfterActiveIfDirty(group: string): Promise<void> {
    if (!isSitemapGroup(group)) return;
    if (!(await this.dirtyService.isDirty(group))) return;
    await this.enqueueGroup(group);
  }

  /**
   * Fixed jobIds prevent duplicate in-flight work, but BullMQ rejects re-add
   * while a completed/failed job with the same id still exists.
   * @returns false when a job is already active (skip enqueue)
   */
  async prepareReusableJobId(jobId: string): Promise<boolean> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) return true;

    const state = await existing.getState();
    if (state === 'active') {
      this.logger.debug({ jobId, state }, 'Sitemap job already active — skip re-enqueue');
      return false;
    }

    await existing.remove().catch((error: unknown) => {
      this.logger.warn(
        {
          jobId,
          state,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to remove existing sitemap job before re-enqueue',
      );
    });
    return true;
  }
}
