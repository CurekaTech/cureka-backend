import { GokwikQueueService } from './gokwik-queue.service';

type JobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed' | 'paused';

function createQueue() {
  const jobs = new Map<string, { id: string; state: JobState; resourceId?: string }>();
  const added: string[] = [];
  const queue = {
    getJob: jest.fn(async (id: string) => {
      const job = jobs.get(id);
      if (!job) return undefined;
      return {
        id,
        getState: async () => job.state,
        remove: jest.fn(async () => {
          jobs.delete(id);
        }),
      };
    }),
    add: jest.fn(async (_name: string, data: { resourceId: string }, options: { jobId: string }) => {
      added.push(options.jobId);
      jobs.set(options.jobId, {
        id: options.jobId,
        state: 'waiting',
        resourceId: data.resourceId,
      });
    }),
  };
  const service = new GokwikQueueService(queue as never);
  return { service, jobs, added, queue };
}

describe('GokwikQueueService collection enqueue', () => {
  it('adds one canonical job when none exists', async () => {
    const { service, added } = createQueue();
    await service.enqueueCollectionSync('c1');
    expect(added).toEqual(['gokwik-collection-c1']);
  });

  it('does not add a second job while the canonical job is waiting or delayed', async () => {
    const { service, jobs, added } = createQueue();
    jobs.set('gokwik-collection-c1', { id: 'gokwik-collection-c1', state: 'waiting' });
    await service.enqueueCollectionSync('c1');
    jobs.set('gokwik-collection-c1', { id: 'gokwik-collection-c1', state: 'delayed' });
    await service.enqueueCollectionSync('c1');
    expect(added).toEqual([]);
  });

  it('adds one follow-up when the canonical job is active', async () => {
    const { service, jobs, added } = createQueue();
    jobs.set('gokwik-collection-c1', { id: 'gokwik-collection-c1', state: 'active' });
    await service.enqueueCollectionSync('c1');
    await service.enqueueCollectionSync('c1');
    expect(added).toEqual(['gokwik-collection-c1-after']);
  });

  it('replaces a completed job instead of leaving the refresh dropped', async () => {
    const { service, jobs, added } = createQueue();
    jobs.set('gokwik-collection-c1', { id: 'gokwik-collection-c1', state: 'completed' });
    await service.enqueueCollectionSync('c1');
    expect(added).toEqual(['gokwik-collection-c1']);
    expect(jobs.get('gokwik-collection-c1')?.state).toBe('waiting');
  });

  it('adds the canonical job again when the follow-up is the active one', async () => {
    const { service, jobs, added } = createQueue();
    jobs.set('gokwik-collection-c1-after', { id: 'gokwik-collection-c1-after', state: 'active' });
    await service.enqueueCollectionSync('c1');
    expect(added).toEqual(['gokwik-collection-c1']);
  });
});
