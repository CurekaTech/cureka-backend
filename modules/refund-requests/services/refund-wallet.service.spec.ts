import { ConflictException } from '@nestjs/common';
import { RefundWalletEntryType } from '../enums/refund-wallet-entry-type.enum';
import { RefundWalletService } from './refund-wallet.service';

describe('RefundWalletService', () => {
  const existingEntry = { id: 'led-1', payoutId: 'payout-1' };
  const walletRepository = {
    findLedgerByPayoutId: jest.fn(),
    findLedgerByIdempotencyKey: jest.fn(),
    lockAccountByCustomerId: jest.fn(),
    saveAccount: jest.fn(),
    existsAccountRefId: jest.fn().mockResolvedValue(false),
    existsLedgerRefId: jest.fn().mockResolvedValue(false),
    saveLedger: jest.fn(),
  };

  const service = new RefundWalletService(walletRepository as never);
  const manager = {
    getRepository: jest.fn().mockReturnValue({ update: jest.fn() }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the existing ledger row instead of crediting twice', async () => {
    walletRepository.findLedgerByPayoutId.mockResolvedValue(existingEntry);
    const result = await service.credit(
      {
        customerId: 'user-1',
        amount: '50.00',
        type: RefundWalletEntryType.COD_REFUND,
        payoutId: 'payout-1',
        refundRequestId: 'rr-1',
        returnRequestId: 'ret-1',
        actorId: 'admin-1',
      },
      manager as never,
    );
    expect(result).toBe(existingEntry);
    expect(walletRepository.saveLedger).not.toHaveBeenCalled();
  });

  it('rejects a zero credit', async () => {
    await expect(
      service.credit(
        {
          customerId: 'user-1',
          amount: '0.00',
          type: RefundWalletEntryType.COD_REFUND,
          payoutId: 'payout-1',
          refundRequestId: 'rr-1',
          returnRequestId: null,
          actorId: 'admin-1',
        },
        manager as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
