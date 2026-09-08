describe('GokwikCancelService auto-refund removal', () => {
  const apiService = { updateOrder: jest.fn() };
  const repository = { findOrderByOrderId: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const { GokwikCancelService } = await import('./gokwik-cancel.service');
    const service = new GokwikCancelService(repository as never, apiService as never);
    repository.findOrderByOrderId.mockResolvedValue({
      order: {
        orderNumber: 'ORD1',
        paymentMethod: 'GOKWIK_PREPAID',
        paymentStatus: 'PAID',
        grandTotal: '500.00',
      },
      prepaidAmount: '500.00',
    });
    apiService.updateOrder.mockResolvedValue({ success: true, data: {} });
    await service.notifyOrderCancelled('order-1', 'Customer cancelled');
  });

  it('notifies GoKwik of cancellation without refund_amount', () => {
    expect(apiService.updateOrder).toHaveBeenCalledWith({
      merchant_order_id: 'ORD1',
      order_status: 'Cancelled',
      order_note: 'Customer cancelled',
    });
    expect(apiService.updateOrder.mock.calls[0][0].refund_amount).toBeUndefined();
  });
});
