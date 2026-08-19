import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job, Queue } from 'bullmq';
import {
  GenerateGroupJobData,
  SITEMAP_JOB_NAMES,
} from '../constants/sitemap-queue.constants';
import { isSitemapGroup } from '../config/sitemap-groups';
import { SitemapGeneratorService } from '../services/sitemap-generator.service';
import { SitemapQueueService } from '../services/sitemap-queue.service';

@Injectable()
@Processor(QUEUE_NAMES.SITEMAP, { concurrency: 1 })
export class SitemapProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SitemapProcessor.name);

  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly generator: SitemapGeneratorService,
    private readonly queueService: SitemapQueueService,
    @InjectQueue(QUEUE_NAMES.SITEMAP) private readonly queue: Queue,
  ) {
    super();
    this.pinoLogger.setContext(SitemapProcessor.name);
  }

  async onModuleInit(): Promise<void> {
    if (!this.configService.get<boolean>('sitemap.enabled')) return;

    const intervalSeconds =
      this.configService.get<number>('sitemap.regenerationIntervalSeconds') ?? 3600;
    await this.queue.add(
      SITEMAP_JOB_NAMES.SAFETY_REBUILD,
      {},
      {
        repeat: { every: intervalSeconds * 1000 },
        jobId: 'sitemap-safety-rebuild',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async process(job: Job): Promise<void> {
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.SITEMAP,
      group: (job.data as GenerateGroupJobData | undefined)?.group,
      attempt: job.attemptsMade + 1,
    });

    logger.log(
      { attempt: job.attemptsMade + 1, jobName: job.name },
      'Sitemap generation started',
    );

    const startedAt = Date.now();

    switch (job.name) {
      case SITEMAP_JOB_NAMES.GENERATE_ALL: {
        const result = await this.generator.generateAll();
        logger.log({ ...result, durationMs: Date.now() - startedAt }, 'Sitemap generation succeeded');
        for (const group of result.groups) {
          await this.queueService.enqueueAfterActiveIfDirty(group);
        }
        break;
      }
      case SITEMAP_JOB_NAMES.GENERATE_GROUP: {
        const group = (job.data as GenerateGroupJobData).group;
        if (!isSitemapGroup(group)) {
          throw new Error(`Unsupported sitemap group: ${group}`);
        }
        const result = await this.generator.generateGroup(group);
        logger.log({ ...result, durationMs: Date.now() - startedAt }, 'Sitemap generation succeeded');
        await this.queueService.enqueueAfterActiveIfDirty(group);
        break;
      }
      case SITEMAP_JOB_NAMES.SAFETY_REBUILD: {
        const result = await this.generator.generateDirtyOrForced();
        logger.log(
          { result, durationMs: Date.now() - startedAt },
          result ? 'Sitemap safety rebuild succeeded' : 'Sitemap safety rebuild skipped',
        );
        if (result) {
          for (const group of result.groups) {
            await this.queueService.enqueueAfterActiveIfDirty(group);
          }
        }
        break;
      }
      default:
        throw new Error(`Unsupported sitemap job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        error: error.message,
      },
      'Sitemap generation failed',
    );
  }
}
