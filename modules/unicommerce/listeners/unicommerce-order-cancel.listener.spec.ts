import { UnicommerceOrderService } from '../services/unicommerce-order.service';
import { UnicommerceOrderCancelListener } from './unicommerce-order-cancel.listener';
import { OrderCancelledEvent } from '@packages/events';

describe('UnicommerceOrderCancelListener', () => {
  const cancelSaleOrder = jest.fn();
  const service = { cancelSaleOrder } as unknown as UnicommerceOrderService;
  const listener = new UnicommerceOrderCancelListener(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Unicommerce cancelSaleOrder on ORDER_CANCELLED', async () => {
    cancelSaleOrder.mockResolvedValue({ successful: true });

    await listener.handle(new OrderCancelledEvent('oid', 'ORD1', 'Changed mind'));

    expect(cancelSaleOrder).toHaveBeenCalledWith({
      orderNumber: 'ORD1',
      reason: 'Changed mind',
    });
  });

  it('swallows Unicommerce errors so Cureka cancel stays intact', async () => {
    cancelSaleOrder.mockRejectedValue(new Error('Uniware down'));

    await expect(
      listener.handle(new OrderCancelledEvent('oid', 'ORD1', 'Changed mind')),
    ).resolves.toBeUndefined();
  });
});
