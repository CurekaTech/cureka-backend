import { Queue } from 'bullmq';

const TEST_TENURE_JOB = 'test-tenure-renewal';

/**
 * Production keeps the daily 03:00 renewal. TechBV adds a one-minute pass so
 * 2-minute, 5-minute, 30-minute, 1-hour, and 1-day tenures can be observed without waiting overnight.
 */
export async function syncTestTenureRenewalJob(
  queue: Queue,
  enabled: boolean,
  jobId: string,
): Promise<void> {
  const repeats = await queue.getRepeatableJobs();
  for (const job of repeats) {
    if (job.name === TEST_TENURE_JOB || job.id === jobId) {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  if (!enabled) return;
  await queue.add(
    TEST_TENURE_JOB,
    {},
    {
      repeat: { every: 60_000 },
      jobId,
      removeOnComplete: true,
      removeOnFail: 20,
    },
  );
}
