import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { AuditService } from '@modules/master/services/audit.service';
import { auditIdempotency } from '@modules/master/utils/audit-idempotency.util';
import { generateUniqueRefId } from '@packages/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { COD_PAYOUT_DUPLICATE } from '../constants/cod-payout.constants';
import { RefundWalletAccountEntity } from '../entities/refund-wallet-account.entity';
import { RefundWalletLedgerEntity } from '../entities/refund-wallet-ledger.entity';
import { RefundWalletReservationEntity } from '../entities/refund-wallet-reservation.entity';
import { RefundWalletAccountStatus } from '../enums/refund-wallet-account-status.enum';
import { RefundWalletEntryDirection, RefundWalletEntryType } from '../enums/refund-wallet-entry-type.enum';
import { RefundWalletReservationStatus } from '../enums/refund-wallet-reservation-status.enum';
import { RefundWalletRepository } from '../repositories/refund-wallet.repository';
import { paiseToRupees, rupeesToPaise } from '../utils/wallet-money.util';

export type CreditRefundWalletInput = {
  customerId: string;
  amount: string;
  type: RefundWalletEntryType;
  payoutId: string;
  refundRequestId: string;
  returnRequestId: string | null;
  actorId: string;
};

export type ReserveWalletInput = {
  customerId: string;
  amountPaise: number;
  paymentRequestId: string;
  idempotencyKey: string;
  expiresAt: Date;
  actorId: string;
};

@Injectable()
export class RefundWalletService {
  constructor(
    private readonly walletRepository: RefundWalletRepository,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async getOverview(customerId: string) {
    const account = await this.walletRepository.findAccountByCustomerId(customerId);
    if (!account) {
      return { balance: '0.00', reserved: '0.00', available: '0.00', currency: 'INR', status: 'ACTIVE' };
    }
    const balancePaise = rupeesToPaise(account.availableBalance);
    const reservedPaise = Number(account.reservedBalancePaise ?? 0);
    return {
      balance: paiseToRupees(balancePaise),
      reserved: paiseToRupees(reservedPaise),
      available: paiseToRupees(balancePaise - reservedPaise),
      currency: account.currency,
      status: account.status,
    };
  }

  async getCustomerTransactions(customerId: string, page = 1, limit = 20) {
    const [items, total] = await this.walletRepository.findCustomerLedgerPage(customerId, page, limit);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async getAdminOverview(customerId: string) {
    return this.getOverview(customerId);
  }

  async setAccountStatus(
    customerId: string,
    status: RefundWalletAccountStatus,
    actorId: string,
    performedBy?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const account = await this.walletRepository.findAccountByCustomerId(customerId, manager);
      if (!account) throw new NotFoundException('Wallet account not found');
      const previousStatus = account.status;
      await manager.getRepository(RefundWalletAccountEntity).update(
        { customerId },
        { status, updatedBy: actorId },
      );
      await this.auditService.enqueueCritical(manager, {
        entityType: AuditEntityType.WALLET_ACCOUNT,
        entityId: account.id,
        entityRefId: account.refId,
        action: 'WALLET_STATUS_CHANGED',
        performedBy: performedBy ?? actorId,
        idempotencyKey: auditIdempotency.write(
          AuditEntityType.WALLET_ACCOUNT,
          account.id,
          `status:${previousStatus}->${status}`,
          new Date().toISOString(),
        ),
        details: {
          customerId,
          previousStatus,
          status,
        },
      });
      return this.walletRepository.findAccountByCustomerId(customerId, manager);
    });
  }

  async getPendingReservations(page = 1, limit = 20) {
    const [items, total] = await this.walletRepository.findPendingReservations(page, limit);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findStalePendingReservations(expiredBefore: Date, limit: number) {
    return this.walletRepository.findStalePendingReservations(expiredBefore, limit);
  }

  async credit(input: CreditRefundWalletInput, manager: EntityManager): Promise<RefundWalletLedgerEntity> {
    const amountPaise = rupeesToPaise(input.amount);
    if (amountPaise <= 0) {
      throw new ConflictException({ code: COD_PAYOUT_DUPLICATE, message: 'Wallet credit amount must be greater than zero' });
    }

    const existing = await this.walletRepository.findLedgerByPayoutId(input.payoutId, manager);
    if (existing) return existing;
    const idempotencyKey = `cod-payout:${input.payoutId}`;
    const existingKey = await this.walletRepository.findLedgerByIdempotencyKey(idempotencyKey, manager);
    if (existingKey) return existingKey;

    const account = await this.getOrCreateAndLockAccount(input.customerId, input.actorId, manager);
    const nextBalancePaise = rupeesToPaise(account.availableBalance) + amountPaise;
    const amount = paiseToRupees(amountPaise);
    const nextBalance = paiseToRupees(nextBalancePaise);
    const ledgerRefId = await generateUniqueRefId('rfwled', (candidate) =>
      this.walletRepository.existsLedgerRefId(candidate, manager),
    );

    try {
      const entry = await this.walletRepository.saveLedger({
        refId: ledgerRefId,
        accountId: account.id,
        customerId: input.customerId,
        direction: RefundWalletEntryDirection.CREDIT,
        type: input.type,
        amount,
        balanceAfter: nextBalance,
        currency: 'INR',
        payoutId: input.payoutId,
        refundRequestId: input.refundRequestId,
        returnRequestId: input.returnRequestId,
        idempotencyKey,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      }, manager);
      await this.walletRepository.updateAccount(account.id, { availableBalance: nextBalance, updatedBy: input.actorId }, manager);
      return entry;
    } catch (error) {
      const duplicate = await this.walletRepository.findLedgerByPayoutId(input.payoutId, manager);
      if (duplicate) return duplicate;
      throw error;
    }
  }

  async debitForOrder(customerId: string, orderId: string, amountPaise: number, actorId: string, manager: EntityManager): Promise<RefundWalletLedgerEntity> {
    const idempotencyKey = `wallet-order:${orderId}`;
    const existing = await this.walletRepository.findLedgerByIdempotencyKey(idempotencyKey, manager);
    if (existing) return existing;
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('Wallet debit must be a positive paise amount');
    }
    const account = await this.lockAccount(customerId, manager);
    if (account.status !== RefundWalletAccountStatus.ACTIVE) throw new ConflictException('Wallet is not available for spending');
    const balancePaise = rupeesToPaise(account.availableBalance);
    const reservedPaise = Number(account.reservedBalancePaise ?? 0);
    if (balancePaise - reservedPaise < amountPaise) throw new ConflictException('Insufficient wallet balance');
    const nextBalance = paiseToRupees(balancePaise - amountPaise);
    const refId = await generateUniqueRefId('rfwled', (candidate) => this.walletRepository.existsLedgerRefId(candidate, manager));
    const entry = await this.walletRepository.saveLedger({
      refId, accountId: account.id, customerId,
      direction: RefundWalletEntryDirection.DEBIT,
      type: RefundWalletEntryType.CHECKOUT_DEBIT,
      amount: paiseToRupees(amountPaise), balanceAfter: nextBalance, currency: account.currency,
      payoutId: null, refundRequestId: null, returnRequestId: null,
      paymentRequestId: null, orderId, reservationId: null, idempotencyKey,
      createdBy: actorId, updatedBy: actorId,
    }, manager);
    await this.walletRepository.updateAccount(account.id, { availableBalance: nextBalance, updatedBy: actorId }, manager);
    return entry;
  }

  async consumeReservationForPaymentRequest(paymentRequestId: string, orderId: string, actorId: string, manager: EntityManager): Promise<RefundWalletLedgerEntity | null> {
    const reservation = await this.walletRepository.findReservationByPaymentRequestId(paymentRequestId, manager);
    if (!reservation) return null;
    return this.consumeReservation(reservation.id, orderId, actorId, manager);
  }
  async reserve(input: ReserveWalletInput, manager: EntityManager): Promise<RefundWalletReservationEntity> {
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new BadRequestException('Wallet reservation must be a positive paise amount');
    }
    const existing = await this.walletRepository.findReservationByIdempotencyKey(input.idempotencyKey, manager);
    if (existing) {
      if (existing.customerId !== input.customerId || Number(existing.amountPaise) !== input.amountPaise) {
        throw new ConflictException('Wallet reservation idempotency key was reused with different details');
      }
      return existing;
    }

    const account = await this.lockAccount(input.customerId, manager);
    if (account.status !== RefundWalletAccountStatus.ACTIVE) {
      throw new ConflictException('Wallet is not available for spending');
    }
    const availablePaise = rupeesToPaise(account.availableBalance) - Number(account.reservedBalancePaise ?? 0);
    if (input.amountPaise > availablePaise) {
      throw new ConflictException('Insufficient wallet balance');
    }

    const refId = await generateUniqueRefId('rfwres', (candidate) =>
      this.walletRepository.existsReservationRefId(candidate, manager),
    );
    try {
      const reservation = await this.walletRepository.saveReservation({
        refId,
        accountId: account.id,
        customerId: input.customerId,
        paymentRequestId: input.paymentRequestId,
        orderId: null,
        amountPaise: String(input.amountPaise),
        status: RefundWalletReservationStatus.PENDING,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt,
        settledAt: null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      }, manager);
      const nextReserved = Number(account.reservedBalancePaise ?? 0) + input.amountPaise;
      await this.walletRepository.updateAccount(account.id, { reservedBalancePaise: String(nextReserved), updatedBy: input.actorId }, manager);
      return reservation;
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const duplicate = await this.walletRepository.findReservationByIdempotencyKey(input.idempotencyKey, manager);
      if (duplicate) {
        if (duplicate.customerId !== input.customerId || Number(duplicate.amountPaise) !== input.amountPaise) {
          throw new ConflictException('Wallet reservation idempotency key was reused with different details');
        }
        return duplicate;
      }
      throw error;
    }
  }

  /**
   * Releases a PENDING reservation for a payment request.
   * Callers must ensure the payment request is not PAID (or pass allowWhenPaid=false default).
   * Safe under concurrent consume: reservation row lock + status check.
   */
  async releaseReservationForPaymentRequest(
    paymentRequestId: string,
    actorId: string,
    manager: EntityManager,
  ): Promise<RefundWalletReservationEntity | null> {
    const reservation = await this.walletRepository.lockReservationByPaymentRequestId(paymentRequestId, manager);
    if (!reservation) return null;
    return this.releaseReservation(reservation.id, actorId, manager);
  }

  async consumeReservation(reservationId: string, orderId: string, actorId: string, manager: EntityManager): Promise<RefundWalletLedgerEntity> {
    const reservation = await this.walletRepository.lockReservationById(reservationId, manager);
    if (!reservation) throw new NotFoundException('Wallet reservation not found');
    const priorLedger = await this.walletRepository.findLedgerByReservationId(reservation.id, manager);
    if (reservation.status === RefundWalletReservationStatus.CONSUMED && priorLedger) return priorLedger;
    if (reservation.status !== RefundWalletReservationStatus.PENDING) {
      throw new ConflictException('Wallet reservation is no longer pending');
    }

    const account = await this.lockAccount(reservation.customerId, manager);
    const amountPaise = Number(reservation.amountPaise);
    const balancePaise = rupeesToPaise(account.availableBalance);
    const reservedPaise = Number(account.reservedBalancePaise ?? 0);
    if (balancePaise < amountPaise || reservedPaise < amountPaise) {
      throw new ConflictException('Wallet reservation balance invariant failed');
    }
    const nextBalance = paiseToRupees(balancePaise - amountPaise);
    const ledgerRefId = await generateUniqueRefId('rfwled', (candidate) =>
      this.walletRepository.existsLedgerRefId(candidate, manager),
    );
    const entry = await this.walletRepository.saveLedger({
      refId: ledgerRefId,
      accountId: account.id,
      customerId: reservation.customerId,
      direction: RefundWalletEntryDirection.DEBIT,
      type: RefundWalletEntryType.CHECKOUT_DEBIT,
      amount: paiseToRupees(amountPaise),
      balanceAfter: nextBalance,
      currency: account.currency,
      payoutId: null,
      refundRequestId: null,
      returnRequestId: null,
      paymentRequestId: reservation.paymentRequestId,
      orderId,
      reservationId: reservation.id,
      idempotencyKey: `wallet-reservation-consume:${reservation.id}`,
      createdBy: actorId,
      updatedBy: actorId,
    }, manager);
    await this.walletRepository.updateAccount(account.id, {
      availableBalance: nextBalance,
      reservedBalancePaise: String(reservedPaise - amountPaise),
      updatedBy: actorId,
    }, manager);
    await this.walletRepository.updateReservation(reservation.id, {
      status: RefundWalletReservationStatus.CONSUMED,
      orderId,
      settledAt: new Date(),
      updatedBy: actorId,
    }, manager);
    return entry;
  }

  async releaseReservation(reservationId: string, actorId: string, manager: EntityManager): Promise<RefundWalletReservationEntity> {
    const reservation = await this.walletRepository.lockReservationById(reservationId, manager);
    if (!reservation) throw new NotFoundException('Wallet reservation not found');
    // Idempotent: already released, or already consumed by a successful settlement race.
    if (
      reservation.status === RefundWalletReservationStatus.RELEASED ||
      reservation.status === RefundWalletReservationStatus.CONSUMED
    ) {
      return reservation;
    }
    if (reservation.status !== RefundWalletReservationStatus.PENDING) {
      throw new ConflictException('Wallet reservation cannot be released');
    }
    const account = await this.lockAccount(reservation.customerId, manager);
    const amountPaise = Number(reservation.amountPaise);
    const reservedPaise = Number(account.reservedBalancePaise ?? 0);
    if (reservedPaise < amountPaise) throw new ConflictException('Wallet reserved balance invariant failed');
    await this.walletRepository.updateAccount(account.id, {
      reservedBalancePaise: String(reservedPaise - amountPaise),
      updatedBy: actorId,
    }, manager);
    await this.walletRepository.updateReservation(reservation.id, {
      status: RefundWalletReservationStatus.RELEASED,
      settledAt: new Date(),
      updatedBy: actorId,
    }, manager);
    return reservation;
  }

  private async lockAccount(customerId: string, manager: EntityManager): Promise<RefundWalletAccountEntity> {
    const account = await this.walletRepository.lockAccountByCustomerId(customerId, manager);
    if (!account) throw new NotFoundException('Wallet account not found');
    return account;
  }

  private async getOrCreateAndLockAccount(customerId: string, actorId: string, manager: EntityManager) {
    let account = await this.walletRepository.lockAccountByCustomerId(customerId, manager);
    if (!account) {
      const refId = await generateUniqueRefId('rfwallet', (candidate) =>
        this.walletRepository.existsAccountRefId(candidate, manager),
      );
      await this.walletRepository.insertAccountIfAbsent({ refId, customerId, actorId }, manager);
      account = await this.walletRepository.lockAccountByCustomerId(customerId, manager);
    }
    if (!account) throw new ConflictException('Unable to create wallet account');
    return account;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      const driver = error as { code?: string; driverError?: { code?: string } };
      return driver.code === '23505' || driver.driverError?.code === '23505';
    }
    const driver = error.driverError as { code?: string } | undefined;
    return driver?.code === '23505';
  }
}
