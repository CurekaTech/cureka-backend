import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RefundWalletAccountEntity } from '../entities/refund-wallet-account.entity';
import { RefundWalletLedgerEntity } from '../entities/refund-wallet-ledger.entity';
import { RefundWalletReservationEntity } from '../entities/refund-wallet-reservation.entity';
import { RefundWalletReservationStatus } from '../enums/refund-wallet-reservation-status.enum';

@Injectable()
export class RefundWalletRepository {
  constructor(
    @InjectRepository(RefundWalletAccountEntity)
    private readonly accounts: Repository<RefundWalletAccountEntity>,
    @InjectRepository(RefundWalletLedgerEntity)
    private readonly ledger: Repository<RefundWalletLedgerEntity>,
    @InjectRepository(RefundWalletReservationEntity)
    private readonly reservations: Repository<RefundWalletReservationEntity>,
  ) {}

  findAccountByCustomerId(customerId: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletAccountEntity) ?? this.accounts;
    return repository.findOne({ where: { customerId } });
  }

  findCustomerLedgerPage(customerId: string, page: number, limit: number) {
    return this.ledger.findAndCount({
      where: { customerId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async saveAccountStatus(customerId: string, status: RefundWalletAccountEntity['status'], actorId: string) {
    return this.accounts.update({ customerId }, { status, updatedBy: actorId });
  }

  findPendingReservations(page: number, limit: number) {
    return this.reservations.findAndCount({
      where: { status: RefundWalletReservationStatus.PENDING },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findStalePendingReservations(expiredBefore: Date, limit: number) {
    return this.reservations
      .createQueryBuilder('reservation')
      .where('reservation.status = :status', { status: RefundWalletReservationStatus.PENDING })
      .andWhere('reservation.expiresAt < :expiredBefore', { expiredBefore })
      .orderBy('reservation.expiresAt', 'ASC')
      .take(limit)
      .getMany();
  }

  lockReservationByPaymentRequestId(paymentRequestId: string, manager: EntityManager) {
    return manager
      .getRepository(RefundWalletReservationEntity)
      .createQueryBuilder('reservation')
      .setLock('pessimistic_write')
      .where('reservation.paymentRequestId = :paymentRequestId', { paymentRequestId })
      .getOne();
  }

  lockAccountByCustomerId(customerId: string, manager: EntityManager) {
    return manager
      .getRepository(RefundWalletAccountEntity)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.customerId = :customerId', { customerId })
      .getOne();
  }

  saveAccount(data: Partial<RefundWalletAccountEntity>, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletAccountEntity) ?? this.accounts;
    return repository.save(repository.create(data));
  }

  findLedgerByIdempotencyKey(idempotencyKey: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.findOne({ where: { idempotencyKey } });
  }

  findLedgerByPayoutId(payoutId: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.findOne({ where: { payoutId } });
  }

  findLedgerByReservationId(reservationId: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.findOne({ where: { reservationId } });
  }

  saveLedger(data: Partial<RefundWalletLedgerEntity>, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.save(repository.create(data));
  }

  findReservationByPaymentRequestId(paymentRequestId: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletReservationEntity) ?? this.reservations;
    return repository.findOne({ where: { paymentRequestId } });
  }

  insertAccountIfAbsent(data: {
    refId: string; customerId: string; actorId: string;
  }, manager: EntityManager) {
    return manager.query(
      `INSERT INTO "refund_wallet_accounts" ("ref_id", "customer_id", "available_balance", "reserved_balance_paise", "status", "currency", "created_by", "updated_by")
       VALUES ($1, $2, 0, 0, 'ACTIVE', 'INR', $3, $3)
       ON CONFLICT ("customer_id") DO NOTHING`,
      [data.refId, data.customerId, data.actorId],
    );
  }
  findReservationByIdempotencyKey(idempotencyKey: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletReservationEntity) ?? this.reservations;
    return repository.findOne({ where: { idempotencyKey } });
  }

  lockReservationById(id: string, manager: EntityManager) {
    return manager
      .getRepository(RefundWalletReservationEntity)
      .createQueryBuilder('reservation')
      .setLock('pessimistic_write')
      .where('reservation.id = :id', { id })
      .getOne();
  }

  saveReservation(data: Partial<RefundWalletReservationEntity>, manager: EntityManager) {
    const repository = manager.getRepository(RefundWalletReservationEntity);
    return repository.save(repository.create(data));
  }

  updateAccount(accountId: string, data: Partial<RefundWalletAccountEntity>, manager: EntityManager) {
    return manager.getRepository(RefundWalletAccountEntity).update({ id: accountId }, data);
  }

  updateReservation(id: string, data: Partial<RefundWalletReservationEntity>, manager: EntityManager) {
    return manager.getRepository(RefundWalletReservationEntity).update({ id }, data);
  }

  async existsAccountRefId(refId: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletAccountEntity) ?? this.accounts;
    return repository.exists({ where: { refId } });
  }

  async existsLedgerRefId(refId: string, manager?: EntityManager) {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.exists({ where: { refId } });
  }

  async existsReservationRefId(refId: string, manager: EntityManager) {
    return manager.getRepository(RefundWalletReservationEntity).exists({ where: { refId } });
  }
}
