import { ConflictException, Injectable } from '@nestjs/common';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { generateUniqueRefId } from '@packages/common';
import { EntityManager } from 'typeorm';
import { COD_PAYOUT_DUPLICATE } from '../constants/cod-payout.constants';
import { RefundWalletAccountEntity } from '../entities/refund-wallet-account.entity';
import { RefundWalletEntryDirection, RefundWalletEntryType } from '../enums/refund-wallet-entry-type.enum';
import { RefundWalletLedgerEntity } from '../entities/refund-wallet-ledger.entity';
import { RefundWalletRepository } from '../repositories/refund-wallet.repository';

export type CreditRefundWalletInput = {
  customerId: string;
  amount: string;
  type: RefundWalletEntryType;
  payoutId: string;
  refundRequestId: string;
  returnRequestId: string | null;
  actorId: string;
};

@Injectable()
export class RefundWalletService {
  constructor(private readonly walletRepository: RefundWalletRepository) {}

  /**
   * Credits the refund-only wallet. Idempotent on `payoutId` so retries never
   * double-credit. This ledger is not a checkout tender until storefront spend
   * is wired separately.
   */
  async credit(
    input: CreditRefundWalletInput,
    manager: EntityManager,
  ): Promise<RefundWalletLedgerEntity> {
    const amount = roundMoney(parseMoney(input.amount));
    if (amount <= 0) {
      throw new ConflictException({
        code: COD_PAYOUT_DUPLICATE,
        message: 'Wallet credit amount must be greater than zero',
      });
    }

    const existing = await this.walletRepository.findLedgerByPayoutId(input.payoutId, manager);
    if (existing) {
      return existing;
    }

    const idempotencyKey = `cod-payout:${input.payoutId}`;
    const existingKey = await this.walletRepository.findLedgerByIdempotencyKey(
      idempotencyKey,
      manager,
    );
    if (existingKey) {
      return existingKey;
    }

    let account = await this.walletRepository.lockAccountByCustomerId(input.customerId, manager);
    if (!account) {
      const refId = await generateUniqueRefId('rfwallet', (candidate) =>
        this.walletRepository.existsAccountRefId(candidate, manager),
      );
      account = await this.walletRepository.saveAccount(
        {
          refId,
          customerId: input.customerId,
          availableBalance: '0.00',
          currency: 'INR',
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
        manager,
      );
      account =
        (await this.walletRepository.lockAccountByCustomerId(input.customerId, manager)) ?? account;
    }

    const nextBalance = roundMoney(parseMoney(account.availableBalance) + amount);
    const ledgerRefId = await generateUniqueRefId('rfwled', (candidate) =>
      this.walletRepository.existsLedgerRefId(candidate, manager),
    );

    try {
      const entry = await this.walletRepository.saveLedger(
        {
          refId: ledgerRefId,
          accountId: account.id,
          customerId: input.customerId,
          direction: RefundWalletEntryDirection.CREDIT,
          type: input.type,
          amount: toMoneyString(amount),
          balanceAfter: toMoneyString(nextBalance),
          currency: 'INR',
          payoutId: input.payoutId,
          refundRequestId: input.refundRequestId,
          returnRequestId: input.returnRequestId,
          idempotencyKey,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
        manager,
      );
      await manager.getRepository(RefundWalletAccountEntity).update(
        { id: account.id },
        { availableBalance: toMoneyString(nextBalance), updatedBy: input.actorId },
      );
      return entry;
    } catch (error) {
      const duplicate = await this.walletRepository.findLedgerByPayoutId(input.payoutId, manager);
      if (duplicate) return duplicate;
      throw error;
    }
  }
}
