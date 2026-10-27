import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { TYPESENSE_JOB_NAMES } from '../constants/typesense-queue.constants';
import { TypesenseQueueService } from './typesense-queue.service';

describe('TypesenseQueueService', () => {
  function createHarness() {
    const jobs = new Map<
      string,
      { id: string; state: string; getState: () => Promise<string>; remove: jest.Mock }
    >();
    const added: Array<{ name: string; refId: string; jobId: string }> = [];
    const queue = {
      getJob: jest.fn(async (jobId: string) => jobs.get(jobId) ?? null),
      add: jest.fn(async (name: string, data: { refId: string }, options: { jobId: string }) => {
        added.push({ name, refId: data.refId, jobId: options.jobId });
        const job = {
          id: options.jobId,
          state: 'waiting',
          getState: () => Promise.resolve(job.state),
          remove: jest.fn(async () => {
            jobs.delete(options.jobId);
          }),
        };
        jobs.set(options.jobId, job);
        return job;
      }),
    };
    const service = new TypesenseQueueService(queue as never);
    return { service, jobs, added, queue };
  }

  it('enqueues one category reindex job', async () => {
    const { service, added } = createHarness();

    await service.enqueueCategoryReindex('PER20265073');

    expect(added).toEqual([
      {
        name: TYPESENSE_JOB_NAMES.REINDEX_CATEGORY,
        refId: 'PER20265073',
        jobId: 'typesense-category-PER20265073',
      },
    ]);
  });

  it('leaves a waiting category job in place', async () => {
    const { service, added } = createHarness();

    await service.enqueueCategoryReindex('PER20265073');
    await service.enqueueCategoryReindex('PER20265073');

    expect(added).toHaveLength(1);
  });

  it('adds one follow-up when the category job is already active', async () => {
    const { service, jobs, added } = createHarness();

    await service.enqueueCategoryReindex('PER20265073');
    jobs.get('typesense-category-PER20265073')!.state = 'active';
    await service.enqueueCategoryReindex('PER20265073');
    await service.enqueueCategoryReindex('PER20265073');

    expect(added.map((job) => job.jobId)).toEqual([
      'typesense-category-PER20265073',
      'typesense-category-PER20265073-after',
    ]);
  });

  it('uses the typesense queue name', () => {
    expect(QUEUE_NAMES.TYPESENSE).toBe('typesense');
  });
});
