import { DataSource } from 'typeorm';
import { OrderHistoryService } from './order-history.service';

describe('OrderHistoryService', () => {
  const query = jest.fn();
  const service = new OrderHistoryService({ query } as unknown as DataSource);

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('COUNT(*)')) {
        return [{ total: 1 }];
      }
      return [
        {
          record_type: 'CANCELLATION',
          id: 'ord-1',
          order_id: 'ord-1',
          order_number: 'ORD1',
          customer_id: 'user-1',
          customer_name: 'Ada Lovelace',
          customer_email: 'a@example.com',
          customer_mobile: '9999999999',
          workflow_status: 'PROCESSING',
          unicommerce_status: 'PENDING',
          shipway_status: 'NOT_REQUIRED',
          last_error: null,
          reason: 'Changed mind',
          requested_at: new Date('2026-09-14T10:00:00.000Z'),
          attempt_count: 1,
          reverse_awb: null,
        },
      ];
    });
  });

  it('returns mapped cancellation rows for the admin history page', async () => {
    const result = await service.list({ page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      recordType: 'CANCELLATION',
      orderNumber: 'ORD1',
      workflowStatus: 'PROCESSING',
      unicommerceStatus: 'PENDING',
    });
  });

  it('does not send LIMIT/OFFSET binds to the count query', async () => {
    await service.list({
      page: 2,
      limit: 10,
      search: 'ORD1',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    });

    const listCall = query.mock.calls.find(([sql]) => !String(sql).includes('COUNT(*)'));
    const countCall = query.mock.calls.find(([sql]) => String(sql).includes('COUNT(*)'));
    const listParams = listCall?.[1] as unknown[];
    const countParams = countCall?.[1] as unknown[];

    expect(listParams?.slice(-2)).toEqual([10, 10]);
    expect(countParams).toEqual(listParams?.slice(0, -2));
  });

  it('can list only returns', async () => {
    await service.list({ requestType: 'RETURN', page: 1, limit: 20 });

    const sql = query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain("'RETURN'::text");
    expect(sql).not.toContain("'CANCELLATION'::text");
  });
});
