import { mapCustomerRefundView } from '../mappers/refund-request.mapper';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { REFUND_REQUEST_INITIATED_CUSTOMER_MESSAGE } from '../constants/refund-request.constants';

describe('customer refund view', () => {
  it('returns the 5–7 working-day message without internal comments', () => {
    const view = mapCustomerRefundView({
      id: 'rr-1',
      refId: 'RFN1',
      status: RefundRequestStatus.REQUESTED,
      requestedAmount: '1299.00',
      approvedAmount: null,
      currency: 'INR',
      createdAt: new Date('2026-09-08T10:00:00.000Z'),
      processedAt: null,
    } as never);
    expect(view.message).toBe(REFUND_REQUEST_INITIATED_CUSTOMER_MESSAGE);
    expect(view.displayStatus).toBe('Refund request initiated');
    expect(view).not.toHaveProperty('history');
    expect(view).not.toHaveProperty('approvedBy');
  });
});
