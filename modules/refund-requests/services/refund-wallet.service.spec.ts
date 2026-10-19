import { ConflictException } from '@nestjs/common';
import { RefundWalletEntryType } from '../enums/refund-wallet-entry-type.enum';
import { RefundWalletReservationStatus } from '../enums/refund-wallet-reservation-status.enum';
import { RefundWalletService } from './refund-wallet.service';

describe('RefundWalletService', () => {
  const walletRepository = {
    findAccountByCustomerId: jest.fn(),
    findLedgerByPayoutId: jest.fn(),
    findLedgerByIdempotencyKey: jest.fn(),
    findLedgerByReservationId: jest.fn(),
    findReservationByIdempotencyKey: jest.fn(),
    findReservationByPaymentRequestId: jest.fn(),
    lockReservationById: jest.fn(),
    lockReservationByPaymentRequestId: jest.fn(),
    lockAccountByCustomerId: jest.fn(),
    saveAccount: jest.fn(),
    saveReservation: jest.fn(),
    updateAccount: jest.fn(),
    updateReservation: jest.fn(),
    existsAccountRefId: jest.fn().mockResolvedValue(false),
    existsLedgerRefId: jest.fn().mockResolvedValue(false),
    existsReservationRefId: jest.fn().mockResolvedValue(false),
    saveLedger: jest.fn(),
  };
  const dataSource = { transaction: jest.fn(async (fn: any) => fn({})) };
  const auditService = { enqueueCritical: jest.fn() };
  const ordersRepository = { find: jest.fn().mockResolvedValue([]) };
  const service = new RefundWalletService(
    walletRepository as never,
    dataSource as never,
    auditService as never,
    ordersRepository as never,
  );
  const manager = {} as never;

  beforeEach(() => jest.clearAllMocks());

  it('returns the existing ledger row instead of crediting twice', async () => {
    const existing = { id: 'led-1', payoutId: 'payout-1' };
    walletRepository.findLedgerByPayoutId.mockResolvedValue(existing);
    await expect(service.credit({
      customerId: 'user-1', amount: '50.00', type: RefundWalletEntryType.COD_REFUND,
      payoutId: 'payout-1', refundRequestId: 'rr-1', returnRequestId: 'ret-1', actorId: 'admin-1',
    }, manager)).resolves.toBe(existing);
    expect(walletRepository.saveLedger).not.toHaveBeenCalled();
  });

  it('rejects a zero credit', async () => {
    await expect(service.credit({
      customerId: 'user-1', amount: '0.00', type: RefundWalletEntryType.COD_REFUND,
      payoutId: 'payout-1', refundRequestId: 'rr-1', returnRequestId: null, actorId: 'admin-1',
    }, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds legacy rupee balances using integer paise arithmetic', async () => {
    const account = { id: 'account-id', availableBalance: '0.10' };
    walletRepository.findLedgerByPayoutId.mockResolvedValue(null);
    walletRepository.findLedgerByIdempotencyKey.mockResolvedValue(null);
    walletRepository.lockAccountByCustomerId.mockResolvedValue(account);
    walletRepository.saveLedger.mockImplementation(async (entry: any) => entry);

    await service.credit({
      customerId: 'user-1', amount: '0.20', type: RefundWalletEntryType.COD_REFUND,
      payoutId: 'payout-2', refundRequestId: 'rr-2', returnRequestId: null, actorId: 'admin-1',
    }, manager);

    expect(walletRepository.saveLedger).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '0.20', balanceAfter: '0.30' }), manager,
    );
    expect(walletRepository.updateAccount).toHaveBeenCalledWith(
      'account-id', { availableBalance: '0.30', updatedBy: 'admin-1' }, manager,
    );
  });

  it('reserves only available paise under the account lock', async () => {
    walletRepository.findReservationByIdempotencyKey.mockResolvedValue(null);
    walletRepository.lockAccountByCustomerId.mockResolvedValue({
      id: 'account-id', status: 'ACTIVE', availableBalance: '10.00', reservedBalancePaise: '500',
    });
    walletRepository.saveReservation.mockImplementation(async (data: any) => ({ id: 'reservation-id', ...data }));

    const result = await service.reserve({
      customerId: 'user-1', amountPaise: 500, paymentRequestId: 'payment-id',
      idempotencyKey: 'checkout:payment-id', expiresAt: new Date(), actorId: 'user-1',
    }, manager);

    expect(result.amountPaise).toBe('500');
    expect(walletRepository.updateAccount).toHaveBeenCalledWith(
      'account-id', { reservedBalancePaise: '1000', updatedBy: 'user-1' }, manager,
    );
  });

  it('rejects reservations that exceed available balance', async () => {
    walletRepository.findReservationByIdempotencyKey.mockResolvedValue(null);
    walletRepository.lockAccountByCustomerId.mockResolvedValue({
      id: 'account-id', status: 'ACTIVE', availableBalance: '10.00', reservedBalancePaise: '950',
    });
    await expect(service.reserve({
      customerId: 'user-1', amountPaise: 100, paymentRequestId: 'payment-id',
      idempotencyKey: 'checkout:payment-id', expiresAt: new Date(), actorId: 'user-1',
    }, manager)).rejects.toThrow('Insufficient wallet balance');
    expect(walletRepository.saveReservation).not.toHaveBeenCalled();
  });

  it('returns the same reservation for a matching idempotency key', async () => {
    const existing = { id: 'reservation-id', customerId: 'user-1', amountPaise: '500' };
    walletRepository.findReservationByIdempotencyKey.mockResolvedValue(existing);
    await expect(service.reserve({
      customerId: 'user-1', amountPaise: 500, paymentRequestId: 'payment-id',
      idempotencyKey: 'checkout:payment-id', expiresAt: new Date(), actorId: 'user-1',
    }, manager)).resolves.toBe(existing);
    expect(walletRepository.lockAccountByCustomerId).not.toHaveBeenCalled();
  });

  it('consumes a reservation once and records the matching debit', async () => {
    const reservation = {
      id: 'reservation-id', customerId: 'user-1', accountId: 'account-id', amountPaise: '500',
      paymentRequestId: 'payment-id', status: RefundWalletReservationStatus.PENDING,
    };
    walletRepository.lockReservationById.mockResolvedValue(reservation);
    walletRepository.findLedgerByReservationId.mockResolvedValue(null);
    walletRepository.lockAccountByCustomerId.mockResolvedValue({
      id: 'account-id', currency: 'INR', availableBalance: '10.00', reservedBalancePaise: '500',
    });
    walletRepository.saveLedger.mockImplementation(async (data: any) => ({ id: 'ledger-id', ...data }));

    const result = await service.consumeReservation('reservation-id', 'order-id', 'webhook', manager);

    expect(result).toMatchObject({
      direction: 'DEBIT', type: RefundWalletEntryType.CHECKOUT_DEBIT,
      amount: '5.00', balanceAfter: '5.00', reservationId: 'reservation-id',
    });
    expect(walletRepository.updateAccount).toHaveBeenCalledWith('account-id', {
      availableBalance: '5.00', reservedBalancePaise: '0', updatedBy: 'webhook',
    }, manager);
    expect(walletRepository.updateReservation).toHaveBeenCalledWith('reservation-id', {
      status: RefundWalletReservationStatus.CONSUMED, orderId: 'order-id',
      settledAt: expect.any(Date), updatedBy: 'webhook',
    }, manager);
  });

  it('does not consume a released reservation', async () => {
    walletRepository.lockReservationById.mockResolvedValue({
      id: 'reservation-id', status: RefundWalletReservationStatus.RELEASED,
    });
    await expect(service.consumeReservation('reservation-id', 'order-id', 'webhook', manager))
      .rejects.toThrow('Wallet reservation is no longer pending');
  });

  it('releases a pending reservation and decrements reserved paise', async () => {
    walletRepository.lockReservationById.mockResolvedValue({
      id: 'reservation-id',
      customerId: 'user-1',
      amountPaise: '500',
      status: RefundWalletReservationStatus.PENDING,
    });
    walletRepository.lockAccountByCustomerId.mockResolvedValue({
      id: 'account-id', reservedBalancePaise: '500',
    });

    await service.releaseReservation('reservation-id', 'system', manager);

    expect(walletRepository.updateAccount).toHaveBeenCalledWith(
      'account-id', { reservedBalancePaise: '0', updatedBy: 'system' }, manager,
    );
    expect(walletRepository.updateReservation).toHaveBeenCalledWith(
      'reservation-id',
      expect.objectContaining({ status: RefundWalletReservationStatus.RELEASED }),
      manager,
    );
  });

  it('is idempotent when releasing an already consumed reservation', async () => {
    const consumed = {
      id: 'reservation-id', status: RefundWalletReservationStatus.CONSUMED,
    };
    walletRepository.lockReservationById.mockResolvedValue(consumed);
    await expect(service.releaseReservation('reservation-id', 'system', manager))
      .resolves.toBe(consumed);
    expect(walletRepository.updateAccount).not.toHaveBeenCalled();
  });

  it('releases by payment request id when a pending reservation exists', async () => {
    walletRepository.lockReservationByPaymentRequestId.mockResolvedValue({
      id: 'reservation-id',
      customerId: 'user-1',
      amountPaise: '250',
      status: RefundWalletReservationStatus.PENDING,
    });
    walletRepository.lockReservationById.mockResolvedValue({
      id: 'reservation-id',
      customerId: 'user-1',
      amountPaise: '250',
      status: RefundWalletReservationStatus.PENDING,
    });
    walletRepository.lockAccountByCustomerId.mockResolvedValue({
      id: 'account-id', reservedBalancePaise: '250',
    });

    await service.releaseReservationForPaymentRequest('pr-1', 'webhook', manager);
    expect(walletRepository.updateReservation).toHaveBeenCalled();
  });
});
