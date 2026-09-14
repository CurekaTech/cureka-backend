import { BadRequestException } from '@nestjs/common';
import { CodPayoutStatus } from '../enums/cod-payout-status.enum';
import { CodRefundPayoutService } from './cod-refund-payout.service';

describe('CodRefundPayoutService.markPaid', () => {
  const payoutsRepository = {
    findByRefundRequestId: jest.fn(),
    lockById: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
    create: jest.fn(),
  };
  const refundRequestsRepository = {
    lockById: jest.fn(),
    updateById: jest.fn(),
    addHistory: jest.fn(),
  };
  const walletService = { credit: jest.fn() };
  const manualProvider = { code: 'MANUAL', submit: jest.fn() };
  const auditService = { log: jest.fn() };
  const eventEmitter = { emitAsync: jest.fn() };
  const dataSource = {
    transaction: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => fn({})),
    getRepository: jest.fn(),
  };

  const service = new CodRefundPayoutService(
    dataSource as never,
    payoutsRepository as never,
    refundRequestsRepository as never,
    walletService as never,
    manualProvider as never,
    auditService as never,
    eventEmitter as never,
  );

  const actor = { id: 'admin-1', email: 'a@b.com', role: 'admin', type: 'ADMIN' as never };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses to mark a bank payout paid without a UTR', async () => {
    await expect(
      service.markPaid('rr-1', { utr: '  ', transferDate: '2026-09-10' } as never, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks paid with a UTR and completes the refund when other components are done', async () => {
    const payout = {
      id: 'payout-1',
      refId: 'COD1',
      refundRequestId: 'rr-1',
      returnRequestId: 'ret-1',
      status: CodPayoutStatus.PROCESSING,
      refundMethod: 'BANK_ACCOUNT',
      accountNumberLast4: '4321',
      amount: '150.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    payoutsRepository.findByRefundRequestId.mockResolvedValue(payout);
    payoutsRepository.lockById.mockResolvedValue(payout);
    payoutsRepository.findById.mockResolvedValue({ ...payout, status: CodPayoutStatus.PAID, utr: 'UTR123456' });
    refundRequestsRepository.lockById.mockResolvedValue({
      id: 'rr-1',
      status: 'PROCESSING',
      amountAllocation: {
        onlineStatus: 'COMPLETED',
        originalWalletStatus: 'COMPLETED',
        codStatus: 'PENDING',
      },
      currency: 'INR',
      approvedAmount: '150.00',
      requestedAmount: '150.00',
    });

    const view = await service.markPaid(
      'rr-1',
      { utr: 'UTR123456', transferDate: '2026-09-10' },
      actor,
    );
    expect(view.utr).toBe('UTR123456');
    expect(payoutsRepository.updateById).toHaveBeenCalledWith(
      'payout-1',
      expect.objectContaining({ status: CodPayoutStatus.PAID, utr: 'UTR123456' }),
      expect.anything(),
    );
    expect(refundRequestsRepository.updateById).toHaveBeenCalledWith(
      'rr-1',
      expect.objectContaining({ status: 'PROCESSED' }),
      expect.anything(),
    );
  });
});
