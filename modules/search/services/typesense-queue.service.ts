import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Queue } from 'bullmq';
import {
  TYPESENSE_JOB_NAMES,
  TypesenseReindexJobData,
} from '../constants/typesense-queue.constants';

const REINDEX_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

type ReindexKind = 'category' | 'brand';

@Injectable()
export class TypesenseQueueService {
  private readonly logger = new Logger(TypesenseQueueService.name);

  constructor(@InjectQueue(QUEUE_NAMES.TYPESENSE) private readonly queue: Queue) {}

  enqueueCategoryReindex(refId: string): Promise<void> {
    return this.enqueue(TYPESENSE_JOB_NAMES.REINDEX_CATEGORY, 'category', refId);
  }

  enqueueBrandReindex(refId: string): Promise<void> {
    return this.enqueue(TYPESENSE_JOB_NAMES.REINDEX_BRAND, 'brand', refId);
  }

  /**
   * One job per category or brand. A waiting job has not read the database yet,
   * so a later save leaves it. An active job gets a single follow-up.
   */
  private async enqueue(jobName: string, kind: ReindexKind, refId: string): Promise<void> {
    const canonicalId = `typesense-${kind}-${refId}`;
    const followUpId = `${canonicalId}-after`;
    const canonical = await this.queue.getJob(canonicalId);

    if (!canonical) {
      await this.addJob(jobName, canonicalId, refId);
      return;
    }

    const state = await canonical.getState();
    if (state === 'waiting' || state === 'delayed') {
      return;
    }

    if (state === 'active') {
      await this.ensureFollowUp(jobName, followUpId, refId);
      return;
    }

    await this.removeJobQuietly(canonical);
    const followUp = await this.queue.getJob(followUpId);
    if (followUp && (await followUp.getState()) === 'active') {
      await this.addJob(jobName, canonicalId, refId);
      return;
    }
    await this.addJob(jobName, canonicalId, refId);
  }

  private async addJob(jobName: string, jobId: string, refId: string): Promise<void> {
    const data: TypesenseReindexJobData = { refId };
    try {
      await this.queue.add(jobName, data, { ...REINDEX_OPTIONS, jobId });
      this.logger.log(`Queued Typesense ${jobName} refId=${refId} jobId=${jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) return;
      throw error;
    }
  }

  private async ensureFollowUp(jobName: string, followUpId: string, refId: string): Promise<void> {
    const existing = await this.queue.getJob(followUpId);
    if (!existing) {
      await this.addJob(jobName, followUpId, refId);
      return;
    }
    const state = await existing.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'active') {
      return;
    }
    await this.removeJobQuietly(existing);
    await this.addJob(jobName, followUpId, refId);
  }

  private async removeJobQuietly(job: { remove: () => Promise<void> }): Promise<void> {
    await job.remove().catch((error: unknown) => {
      this.logger.warn(
        `Failed to remove existing Typesense reindex job: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
