import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { AuditService } from '@modules/master/services/audit.service';
import { parseMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { ReturnRequestEntity } from '@modules/returns/entities/return-request.entity';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generateUniqueRefId } from '@packages/common';
import { EVENTS } from '@packages/events';
import { DataSource, EntityManager } from 'typeorm';
import { COD_PAYOUT_ALREADY_PAID, COD_PAYOUT_INVALID_STATUS, COD_PAYOUT_NOT_FOUND, COD_PAYOUT_UTR_REQUIRED, BANK_DETAILS_REQUIRED, BANK_ENCRYPTION_NOT_CONFIGURED, COD_REFUND_INITIATED_CUSTOMER_MESSAGE } from '../constants/cod-payout.constants';
import {
  FailCodPayoutDto,
  HoldCodPayoutDto,
  MarkCodPayoutPaidDto,
  ReopenCodPayoutVerificationDto,
  VerifyCodPayoutDto,
} from '../dto/cod-refund-payout.dto';
import { CodPayoutStatus } from '../enums/cod-payout-status.enum';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { RefundHistoryAction } from '../enums/refund-history-action.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundWalletEntryType } from '../enums/refund-wallet-entry-type.enum';
import { CodRefundPayoutEntity } from '../entities/cod-refund-payout.entity';
import { RefundRequestEntity } from '../entities/refund-request.entity';
import {
  ICodPayoutAdminView,
  ICustomerCodRefundView,
  IMaskedBankDetails,
} from '../interfaces/cod-refund-payout.interface';
import { IRefundAmountAllocation } from '../interfaces/refund-amount-allocation.interface';
import { RefundActor } from '../interfaces/refund-request.interface';
import { CodRefundPayoutsRepository } from '../repositories/cod-refund-payouts.repository';
import { RefundRequestsRepository } from '../repositories/refund-requests.repository';
import { decryptBankAccountNumber } from '../utils/bank-account-encryption.util';
import { canTransitionCodPayoutStatus } from '../utils/cod-payout-status-transition.util';
import { canTransitionRefundStatus } from '../utils/refund-status-transition.util';
import { ManualCodPayoutProvider } from './payout-providers/manual-cod-payout.provider';
import { RefundWalletService } from './refund-wallet.service';

@Injectable()
export class CodRefundPayoutService {
  private readonly logger = new Logger(CodRefundPayoutService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly payoutsRepository: CodRefundPayoutsRepository,
    private readonly refundRequestsRepository: RefundRequestsRepository,
    private readonly walletService: RefundWalletService,
    private readonly manualProvider: ManualCodPayoutProvider,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getByRefundRequestId(refundRequestId: string): Promise<CodRefundPayoutEntity | null> {
    return this.payoutsRepository.findByRefundRequestId(refundRequestId);
  }

  toAdminView(entity: CodRefundPayoutEntity): ICodPayoutAdminView {
    return {
      id: entity.id,
      refId: entity.refId,
      refundRequestId: entity.refundRequestId,
      returnRequestId: entity.returnRequestId,
      orderId: entity.orderId,
      customerId: entity.customerId,
      amount: entity.amount,
      currency: entity.currency,
      refundMethod: entity.refundMethod,
      status: entity.status,
      bankDetails: this.maskedFromPayout(entity),
      processedBy: entity.processedBy,
      processedAt: entity.processedAt,
      verifiedBy: entity.verifiedBy,
      verifiedAt: entity.verifiedAt,
      utr: entity.utr,
      transferDate: entity.transferDate,
      paymentProofPath: entity.paymentProofPath,
      failureReason: entity.failureReason,
      internalNotes: entity.internalNotes,
      customerVisibleNotes: entity.customerVisibleNotes,
      providerCode: entity.providerCode,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  customerViewFromReturn(returnRequest: ReturnRequestEntity): ICustomerCodRefundView | null {
    if (!returnRequest.refundMethod && !returnRequest.bankAccountNumberLast4) {
      return null;
    }
    return {
      required: returnRequest.refundMethod !== null,
      method: returnRequest.refundMethod,
      allowedMethods: [CodRefundMethod.BANK_ACCOUNT, CodRefundMethod.WALLET],
      walletEnabled: true,
      bankDetails: this.maskedFromReturn(returnRequest),
      payoutStatus: null,
      customerMessage: COD_REFUND_INITIATED_CUSTOMER_MESSAGE,
    };
  }

  /**
   * Creates the COD payout row when a return is handed to the refund workflow.
   * Does not move money. Duplicate calls return the existing row.
   */
  async createForReturnRefund(params: {
    refund: RefundRequestEntity;
    allocation: IRefundAmountAllocation;
    actor: RefundActor;
    manager?: EntityManager;
  }): Promise<CodRefundPayoutEntity | null> {
    const payoutAmount =
      parseMoney(params.allocation.codAmount) + parseMoney(params.allocation.originalWalletAmount);
    if (payoutAmount <= 0) {
      return null;
    }

    const existing = await this.payoutsRepository.findByRefundRequestId(
      params.refund.id,
      params.manager,
    );
    if (existing) {
      return existing;
    }

    const returnRequest = params.refund.returnRequestId
      ? await (params.manager ?? this.dataSource).getRepository(ReturnRequestEntity).findOne({
          where: { id: params.refund.returnRequestId },
        })
      : null;

    const method =
      parseMoney(params.allocation.codAmount) <= 0 &&
      parseMoney(params.allocation.originalWalletAmount) > 0
        ? CodRefundMethod.WALLET
        : returnRequest?.refundMethod ??
          params.allocation.codRefundMethod ??
          CodRefundMethod.BANK_ACCOUNT;

    const hasBank =
      method === CodRefundMethod.BANK_ACCOUNT && Boolean(returnRequest?.bankAccountNumberLast4);

    const refId = await generateUniqueRefId('codpo', async (candidate) => {
      const found = await (params.manager ?? this.dataSource)
        .getRepository(CodRefundPayoutEntity)
        .exists({ where: { refId: candidate } });
      return found;
    });

    const created = await this.payoutsRepository.create(
      {
        refId,
        refundRequestId: params.refund.id,
        returnRequestId: params.refund.returnRequestId,
        orderId: params.refund.orderId,
        customerId: params.refund.customerId ?? returnRequest?.customerId ?? '',
        amount: toMoneyString(payoutAmount),
        currency: params.refund.currency,
        refundMethod: method,
        status:
          method === CodRefundMethod.WALLET
            ? CodPayoutStatus.READY_FOR_PAYOUT
            : hasBank
              ? CodPayoutStatus.DETAILS_SUBMITTED
              : CodPayoutStatus.PENDING_DETAILS,
        accountHolderName: returnRequest?.bankAccountHolderName ?? null,
        maskedAccountNumber: returnRequest?.bankAccountNumberLast4
          ? `XXXXXX${returnRequest.bankAccountNumberLast4}`
          : null,
        accountNumberLast4: returnRequest?.bankAccountNumberLast4 ?? null,
        ifsc: returnRequest?.bankIfsc ?? null,
        bankName: returnRequest?.bankName ?? null,
        accountType: returnRequest?.bankAccountType ?? null,
        providerCode: this.manualProvider.code,
        createdBy: params.actor.email ?? params.actor.id,
        updatedBy: params.actor.email ?? params.actor.id,
      },
      params.manager,
    );

    this.logger.log(
      {
        payoutId: created.id,
        refundRequestId: params.refund.id,
        method,
        status: created.status,
        amount: created.amount,
        accountNumberLast4: created.accountNumberLast4,
      },
      'COD payout record created; no money moved',
    );

    await this.auditService.log({
      entityType: AuditEntityType.COD_PAYOUT,
      entityId: created.id,
      entityRefId: created.refId,
      action: 'CREATED',
      performedBy: params.actor.email ?? params.actor.id,
      details: {
        refundRequestId: params.refund.id,
        returnRequestId: params.refund.returnRequestId,
        method,
        status: created.status,
        accountNumberLast4: created.accountNumberLast4,
      },
    });

    return created;
  }

  /**
   * Called after Finance initiates the refund. Wallet credits immediately.
   * Bank transfers stay unpaid until a UTR is recorded.
   */
  async onRefundInitiated(
    refund: RefundRequestEntity,
    actor: RefundActor,
    manager: EntityManager,
  ): Promise<CodRefundPayoutEntity | null> {
    const payout = await this.payoutsRepository.findByRefundRequestId(refund.id, manager);
    if (!payout) {
      return null;
    }
    if (payout.status === CodPayoutStatus.PAID) {
      return payout;
    }

    if (payout.refundMethod === CodRefundMethod.WALLET) {
      return this.creditWalletAndComplete(payout, refund, actor, manager);
    }

    if (
      payout.status === CodPayoutStatus.PENDING_DETAILS ||
      !payout.accountNumberLast4
    ) {
      throw new BadRequestException({
        code: BANK_DETAILS_REQUIRED,
        message: 'Bank account details are required before a COD bank refund can be processed',
      });
    }

    await this.manualProvider.submit({
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
    });

    const next =
      payout.status === CodPayoutStatus.READY_FOR_PAYOUT ||
      payout.status === CodPayoutStatus.DETAILS_SUBMITTED ||
      payout.status === CodPayoutStatus.UNDER_VERIFICATION
        ? CodPayoutStatus.READY_FOR_PAYOUT
        : payout.status;

    if (next !== payout.status) {
      this.assertPayoutTransition(payout.status, next);
      await this.payoutsRepository.updateById(
        payout.id,
        { status: next, updatedBy: actor.email ?? actor.id },
        manager,
      );
      payout.status = next;
    }

    return payout;
  }

  async getAdminPayout(refundRequestId: string, actor: RefundActor): Promise<ICodPayoutAdminView> {
    const payout = await this.requirePayoutByRefund(refundRequestId);
    await this.auditService.log({
      entityType: AuditEntityType.COD_PAYOUT,
      entityId: payout.id,
      entityRefId: payout.refId,
      action: 'VIEWED',
      performedBy: actor.email ?? actor.id,
      details: { accountNumberLast4: payout.accountNumberLast4, status: payout.status },
    });
    return this.toAdminView(payout);
  }

  async revealAccountNumber(
    refundRequestId: string,
    actor: RefundActor,
  ): Promise<{ accountNumber: string; accountHolderName: string | null; ifsc: string | null }> {
    const payout = await this.requirePayoutByRefund(refundRequestId);
    if (!payout.returnRequestId) {
      throw new NotFoundException({
        code: BANK_DETAILS_REQUIRED,
        message: 'No bank details are stored for this payout',
      });
    }
    const returnRequest = await this.dataSource.getRepository(ReturnRequestEntity).findOne({
      where: { id: payout.returnRequestId },
    });
    if (!returnRequest?.bankAccountNumberEncrypted) {
      throw new NotFoundException({
        code: BANK_DETAILS_REQUIRED,
        message: 'No bank details are stored for this payout',
      });
    }

    let accountNumber: string;
    try {
      accountNumber = decryptBankAccountNumber(returnRequest.bankAccountNumberEncrypted);
    } catch {
      throw new BadRequestException({
        code: BANK_ENCRYPTION_NOT_CONFIGURED,
        message: 'Bank details could not be decrypted',
      });
    }

    await this.auditService.log({
      entityType: AuditEntityType.COD_PAYOUT,
      entityId: payout.id,
      entityRefId: payout.refId,
      action: 'BANK_DETAILS_REVEALED',
      performedBy: actor.email ?? actor.id,
      details: { accountNumberLast4: payout.accountNumberLast4 },
    });

    this.logger.log(
      {
        payoutId: payout.id,
        actorId: actor.id,
        accountNumberLast4: payout.accountNumberLast4,
      },
      'COD bank details revealed to authorized finance user',
    );

    return {
      accountNumber,
      accountHolderName: payout.accountHolderName,
      ifsc: payout.ifsc,
    };
  }

  async verify(
    refundRequestId: string,
    dto: VerifyCodPayoutDto,
    actor: RefundActor,
  ): Promise<ICodPayoutAdminView> {
    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      this.assertPayoutTransition(payout.status, CodPayoutStatus.READY_FOR_PAYOUT);
      if (payout.refundMethod === CodRefundMethod.BANK_ACCOUNT && !payout.accountNumberLast4) {
        throw new BadRequestException({
          code: BANK_DETAILS_REQUIRED,
          message: 'Cannot verify a payout that has no bank details',
        });
      }
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.READY_FOR_PAYOUT,
          verifiedBy: actor.id,
          verifiedAt: new Date(),
          internalNotes: dto.comment?.trim() ?? payout.internalNotes,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.READY_FOR_PAYOUT;
    }, 'VERIFIED');
  }

  async markProcessing(
    refundRequestId: string,
    actor: RefundActor,
    comment?: string,
  ): Promise<ICodPayoutAdminView> {
    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      this.assertPayoutTransition(payout.status, CodPayoutStatus.PROCESSING);
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.PROCESSING,
          processedBy: actor.id,
          processedAt: new Date(),
          internalNotes: comment?.trim() ?? payout.internalNotes,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.PROCESSING;
    }, 'PROCESSING');
  }

  async markPaid(
    refundRequestId: string,
    dto: MarkCodPayoutPaidDto,
    actor: RefundActor,
  ): Promise<ICodPayoutAdminView> {
    const utr = dto.utr.trim();
    if (!utr) {
      throw new BadRequestException({
        code: COD_PAYOUT_UTR_REQUIRED,
        message: 'UTR / transaction reference is required to mark a bank transfer as paid',
      });
    }

    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      if (payout.status === CodPayoutStatus.PAID) {
        throw new ConflictException({
          code: COD_PAYOUT_ALREADY_PAID,
          message: 'This COD payout has already been marked paid',
        });
      }
      if (payout.refundMethod === CodRefundMethod.WALLET) {
        throw new BadRequestException({
          code: COD_PAYOUT_INVALID_STATUS,
          message: 'Wallet refunds complete when the ledger credit succeeds, not via UTR',
        });
      }
      this.assertPayoutTransition(payout.status, CodPayoutStatus.PAID);
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.PAID,
          utr,
          transferDate: dto.transferDate,
          paymentProofPath: dto.paymentProofPath?.trim() ?? payout.paymentProofPath,
          processedBy: actor.id,
          processedAt: new Date(),
          failureReason: null,
          customerVisibleNotes: dto.customerVisibleNotes?.trim() ?? payout.customerVisibleNotes,
          internalNotes: dto.internalNotes?.trim() ?? payout.internalNotes,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.PAID;
      payout.utr = utr;
      await this.completeRefundIfSettled(payout.refundRequestId, actor, manager, {
        codStatus: 'COMPLETED',
      });
    }, 'PAID');
  }

  async markFailed(
    refundRequestId: string,
    dto: FailCodPayoutDto,
    actor: RefundActor,
  ): Promise<ICodPayoutAdminView> {
    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      this.assertPayoutTransition(payout.status, CodPayoutStatus.FAILED);
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.FAILED,
          failureReason: dto.reason.trim(),
          internalNotes: dto.internalNotes?.trim() ?? payout.internalNotes,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.FAILED;
    }, 'FAILED');
  }

  async hold(
    refundRequestId: string,
    dto: HoldCodPayoutDto,
    actor: RefundActor,
  ): Promise<ICodPayoutAdminView> {
    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      this.assertPayoutTransition(payout.status, CodPayoutStatus.ON_HOLD);
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.ON_HOLD,
          failureReason: dto.reason.trim(),
          internalNotes: dto.internalNotes?.trim() ?? payout.internalNotes,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.ON_HOLD;
    }, 'ON_HOLD');
  }

  async retry(refundRequestId: string, actor: RefundActor, comment: string): Promise<ICodPayoutAdminView> {
    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      this.assertPayoutTransition(payout.status, CodPayoutStatus.READY_FOR_PAYOUT);
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.READY_FOR_PAYOUT,
          failureReason: null,
          internalNotes: comment.trim(),
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.READY_FOR_PAYOUT;
    }, 'RETRIED');
  }

  async reopenVerification(
    refundRequestId: string,
    dto: ReopenCodPayoutVerificationDto,
    actor: RefundActor,
  ): Promise<ICodPayoutAdminView> {
    return this.mutate(refundRequestId, actor, async (payout, manager) => {
      if (payout.status === CodPayoutStatus.PAID) {
        throw new ConflictException({
          code: COD_PAYOUT_ALREADY_PAID,
          message: 'A paid payout cannot be reopened',
        });
      }
      this.assertPayoutTransition(payout.status, CodPayoutStatus.PENDING_DETAILS);
      await this.payoutsRepository.updateById(
        payout.id,
        {
          status: CodPayoutStatus.PENDING_DETAILS,
          internalNotes: dto.reason.trim(),
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      payout.status = CodPayoutStatus.PENDING_DETAILS;

      if (payout.returnRequestId) {
        await manager.getRepository(ReturnRequestEntity).update(
          { id: payout.returnRequestId },
          { bankDetailsLocked: false, updatedBy: actor.email ?? actor.id },
        );
      }
    }, 'VERIFICATION_REOPENED');
  }

  async completeRefundIfSettled(
    refundRequestId: string,
    actor: RefundActor,
    manager: EntityManager,
    patch: Partial<IRefundAmountAllocation>,
  ): Promise<void> {
    const refund = await this.refundRequestsRepository.lockById(refundRequestId, manager);
    if (!refund) return;
    if (
      refund.status === RefundRequestStatus.PROCESSED ||
      refund.status === RefundRequestStatus.CLOSED
    ) {
      return;
    }

    const allocation: IRefundAmountAllocation = {
      ...(refund.amountAllocation ?? {
        currency: refund.currency,
        totalAmount: refund.approvedAmount ?? refund.requestedAmount,
        onlineAmount: '0.00',
        originalWalletAmount: '0.00',
        codAmount: '0.00',
        onlineProvider: null,
        codRefundMethod: null,
        onlineStatus: 'COMPLETED',
        originalWalletStatus: 'COMPLETED',
        codStatus: 'PENDING',
      }),
      ...patch,
    };

    await this.refundRequestsRepository.updateById(
      refund.id,
      { amountAllocation: allocation, updatedBy: actor.email ?? actor.id },
      manager,
    );

    const settled =
      allocation.onlineStatus === 'COMPLETED' &&
      allocation.originalWalletStatus === 'COMPLETED' &&
      allocation.codStatus === 'COMPLETED';
    if (!settled) {
      return;
    }

    if (!canTransitionRefundStatus(refund.status, RefundRequestStatus.PROCESSED)) {
      return;
    }

    await this.refundRequestsRepository.updateById(
      refund.id,
      {
        status: RefundRequestStatus.PROCESSED,
        processedAt: new Date(),
        amountAllocation: allocation,
        updatedBy: actor.email ?? actor.id,
      },
      manager,
    );
    await this.refundRequestsRepository.addHistory(
      {
        refundRequestId: refund.id,
        fromStatus: refund.status,
        toStatus: RefundRequestStatus.PROCESSED,
        action: RefundHistoryAction.PROCESSED,
        comment: 'All refund components completed',
        performedBy: actor.email ?? actor.id,
        performedByRole: actor.role ?? null,
        metadata: { allocation },
      },
      manager,
    );
    await this.eventEmitter.emitAsync(EVENTS.REFUND_PROCESSED, { refundRequestId: refund.id });
  }

  private async creditWalletAndComplete(
    payout: CodRefundPayoutEntity,
    refund: RefundRequestEntity,
    actor: RefundActor,
    manager: EntityManager,
  ): Promise<CodRefundPayoutEntity> {
    if (!payout.customerId) {
      throw new BadRequestException({
        code: COD_PAYOUT_INVALID_STATUS,
        message: 'Customer is required to credit the refund wallet',
      });
    }
    if (payout.status !== CodPayoutStatus.PAID) {
      this.assertPayoutTransition(payout.status, CodPayoutStatus.PAID);
    }

    const entry = await this.walletService.credit(
      {
        customerId: payout.customerId,
        amount: payout.amount,
        type: RefundWalletEntryType.COD_REFUND,
        payoutId: payout.id,
        refundRequestId: refund.id,
        returnRequestId: payout.returnRequestId,
        actorId: actor.email ?? actor.id,
      },
      manager,
    );

    await this.payoutsRepository.updateById(
      payout.id,
      {
        status: CodPayoutStatus.PAID,
        walletLedgerId: entry.id,
        processedBy: actor.id,
        processedAt: new Date(),
        utr: entry.refId,
        updatedBy: actor.email ?? actor.id,
      },
      manager,
    );
    payout.status = CodPayoutStatus.PAID;
    payout.walletLedgerId = entry.id;

    await this.completeRefundIfSettled(refund.id, actor, manager, { codStatus: 'COMPLETED' });
    await this.eventEmitter.emitAsync(EVENTS.REFUND_WALLET_CREDITED, {
      payoutId: payout.id,
      refundRequestId: refund.id,
      customerId: payout.customerId,
    });
    return payout;
  }

  private async mutate(
    refundRequestId: string,
    actor: RefundActor,
    apply: (payout: CodRefundPayoutEntity, manager: EntityManager) => Promise<void>,
    action: string,
  ): Promise<ICodPayoutAdminView> {
    const result = await this.dataSource.transaction(async (manager) => {
      const found = await this.payoutsRepository.findByRefundRequestId(refundRequestId, manager);
      if (!found) {
        throw new NotFoundException({
          code: COD_PAYOUT_NOT_FOUND,
          message: 'COD payout not found for this refund request',
        });
      }
      const locked = await this.payoutsRepository.lockById(found.id, manager);
      if (!locked) {
        throw new NotFoundException({
          code: COD_PAYOUT_NOT_FOUND,
          message: 'COD payout not found for this refund request',
        });
      }
      await apply(locked, manager);
      return (await this.payoutsRepository.findById(locked.id, manager)) ?? locked;
    });

    await this.auditService.log({
      entityType: AuditEntityType.COD_PAYOUT,
      entityId: result.id,
      entityRefId: result.refId,
      action,
      performedBy: actor.email ?? actor.id,
      details: {
        status: result.status,
        accountNumberLast4: result.accountNumberLast4,
        utrPresent: Boolean(result.utr),
      },
    });
    return this.toAdminView(result);
  }

  private async requirePayoutByRefund(refundRequestId: string): Promise<CodRefundPayoutEntity> {
    const payout = await this.payoutsRepository.findByRefundRequestId(refundRequestId);
    if (!payout) {
      throw new NotFoundException({
        code: COD_PAYOUT_NOT_FOUND,
        message: 'COD payout not found for this refund request',
      });
    }
    return payout;
  }

  private assertPayoutTransition(from: CodPayoutStatus, to: CodPayoutStatus): void {
    if (!canTransitionCodPayoutStatus(from, to)) {
      throw new BadRequestException({
        code: COD_PAYOUT_INVALID_STATUS,
        message: `Cannot move COD payout from ${from} to ${to}`,
      });
    }
  }

  private maskedFromPayout(entity: CodRefundPayoutEntity): IMaskedBankDetails | null {
    if (entity.refundMethod !== CodRefundMethod.BANK_ACCOUNT) {
      return null;
    }
    return {
      accountHolderName: entity.accountHolderName,
      accountNumberMasked: entity.maskedAccountNumber,
      ifsc: entity.ifsc,
      bankName: entity.bankName,
      accountType: entity.accountType,
      submittedAt: entity.createdAt,
      locked: entity.status !== CodPayoutStatus.PENDING_DETAILS,
    };
  }

  private maskedFromReturn(entity: ReturnRequestEntity): IMaskedBankDetails | null {
    if (entity.refundMethod !== CodRefundMethod.BANK_ACCOUNT) {
      return null;
    }
    return {
      accountHolderName: entity.bankAccountHolderName,
      accountNumberMasked: entity.bankAccountNumberLast4
        ? `XXXXXX${entity.bankAccountNumberLast4}`
        : null,
      ifsc: entity.bankIfsc,
      bankName: entity.bankName,
      accountType: entity.bankAccountType,
      submittedAt: entity.bankDetailsSubmittedAt,
      locked: entity.bankDetailsLocked,
    };
  }
}
