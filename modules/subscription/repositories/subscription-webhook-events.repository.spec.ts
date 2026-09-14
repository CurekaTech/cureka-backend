import { SubscriptionWebhookEventsRepository } from '../repositories/subscription-webhook-events.repository';

describe('SubscriptionWebhookEventsRepository', () => {
  it('treats unique constraint 23505 as a duplicate event', async () => {
    const repo = {
      insert: jest.fn().mockRejectedValue({ code: '23505' }),
    };
    const service = new SubscriptionWebhookEventsRepository(repo as never);
    await expect(
      service.tryRecord({ provider: 'RAZORPAY', eventId: 'payment.captured:pay_1', eventType: 'payment.captured' }),
    ).resolves.toBe(false);
  });

  it('records a new event', async () => {
    const repo = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new SubscriptionWebhookEventsRepository(repo as never);
    await expect(
      service.tryRecord({ provider: 'RAZORPAY', eventId: 'payment.captured:pay_2', eventType: 'payment.captured' }),
    ).resolves.toBe(true);
  });
});
