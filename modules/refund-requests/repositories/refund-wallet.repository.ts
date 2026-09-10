import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RefundWalletAccountEntity } from '../entities/refund-wallet-account.entity';
import { RefundWalletLedgerEntity } from '../entities/refund-wallet-ledger.entity';

@Injectable()
export class RefundWalletRepository {
  constructor(
    @InjectRepository(RefundWalletAccountEntity)
    private readonly accounts: Repository<RefundWalletAccountEntity>,
    @InjectRepository(RefundWalletLedgerEntity)
    private readonly ledger: Repository<RefundWalletLedgerEntity>,
  ) {}

  findAccountByCustomerId(
    customerId: string,
    manager?: EntityManager,
  ): Promise<RefundWalletAccountEntity | null> {
    const repository = manager?.getRepository(RefundWalletAccountEntity) ?? this.accounts;
    return repository.findOne({ where: { customerId } });
  }

  async lockAccountByCustomerId(
    customerId: string,
    manager: EntityManager,
  ): Promise<RefundWalletAccountEntity | null> {
    return manager
      .getRepository(RefundWalletAccountEntity)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.customerId = :customerId', { customerId })
      .getOne();
  }

  saveAccount(
    data: Partial<RefundWalletAccountEntity>,
    manager?: EntityManager,
  ): Promise<RefundWalletAccountEntity> {
    const repository = manager?.getRepository(RefundWalletAccountEntity) ?? this.accounts;
    return repository.save(repository.create(data));
  }

  findLedgerByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<RefundWalletLedgerEntity | null> {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.findOne({ where: { idempotencyKey } });
  }

  findLedgerByPayoutId(
    payoutId: string,
    manager?: EntityManager,
  ): Promise<RefundWalletLedgerEntity | null> {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.findOne({ where: { payoutId } });
  }

  saveLedger(
    data: Partial<RefundWalletLedgerEntity>,
    manager?: EntityManager,
  ): Promise<RefundWalletLedgerEntity> {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.save(repository.create(data));
  }

  async existsAccountRefId(refId: string, manager?: EntityManager): Promise<boolean> {
    const repository = manager?.getRepository(RefundWalletAccountEntity) ?? this.accounts;
    return repository.exists({ where: { refId } });
  }

  async existsLedgerRefId(refId: string, manager?: EntityManager): Promise<boolean> {
    const repository = manager?.getRepository(RefundWalletLedgerEntity) ?? this.ledger;
    return repository.exists({ where: { refId } });
  }
}
