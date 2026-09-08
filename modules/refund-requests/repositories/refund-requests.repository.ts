import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { EntityManager, QueryDeepPartialEntity, Repository } from 'typeorm';
import {
  REFUND_SLA_ORANGE_AFTER_HOURS,
  REFUND_SLA_RED_AFTER_HOURS,
} from '../constants/refund-request.constants';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundReason } from '../enums/refund-reason.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestHistoryEntity } from '../entities/refund-request-history.entity';
import { RefundRequestEntity } from '../entities/refund-request.entity';
import { RefundSlaStatus } from '../interfaces/refund-request.interface';

export type RefundRequestListOptions = PaginationOptions & {
  status?: RefundRequestStatus;
  reason?: RefundReason;
  paymentProvider?: RefundPaymentProvider;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  assignedTo?: string;
  createdFrom?: Date;
  createdTo?: Date;
  slaStatus?: RefundSlaStatus;
};

const SORTABLE: Record<string, string> = {
  createdAt: 'refund.createdAt',
  updatedAt: 'refund.updatedAt',
  status: 'refund.status',
  requestedAmount: 'refund.requestedAmount',
  orderNumber: 'refund.orderNumber',
};

@Injectable()
export class RefundRequestsRepository {
  constructor(
    @InjectRepository(RefundRequestEntity)
    private readonly repo: Repository<RefundRequestEntity>,
    @InjectRepository(RefundRequestHistoryEntity)
    private readonly historyRepo: Repository<RefundRequestHistoryEntity>,
  ) {}

  create(
    data: Partial<RefundRequestEntity>,
    manager?: EntityManager,
  ): Promise<RefundRequestEntity> {
    const repository = manager?.getRepository(RefundRequestEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  addHistory(
    data: Partial<RefundRequestHistoryEntity>,
    manager?: EntityManager,
  ): Promise<RefundRequestHistoryEntity> {
    const repository = manager?.getRepository(RefundRequestHistoryEntity) ?? this.historyRepo;
    return repository.save(repository.create(data));
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findById(id: string, manager?: EntityManager): Promise<RefundRequestEntity | null> {
    const repository = manager?.getRepository(RefundRequestEntity) ?? this.repo;
    return repository.findOne({
      where: { id },
      relations: { customer: true, history: true, order: true },
    });
  }

  findByRefId(refId: string): Promise<RefundRequestEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: { customer: true, history: true, order: true },
    });
  }

  findByIdOrRefId(idOrRefId: string, manager?: EntityManager): Promise<RefundRequestEntity | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idOrRefId,
    );
    if (isUuid) {
      return this.findById(idOrRefId, manager);
    }
    const repository = manager?.getRepository(RefundRequestEntity) ?? this.repo;
    return repository.findOne({
      where: { refId: idOrRefId.trim().toUpperCase() },
      relations: { customer: true, history: true, order: true },
    });
  }

  findActiveByOrderId(
    orderId: string,
    manager?: EntityManager,
  ): Promise<RefundRequestEntity | null> {
    const repository = manager?.getRepository(RefundRequestEntity) ?? this.repo;
    return repository
      .createQueryBuilder('refund')
      .leftJoinAndSelect('refund.customer', 'customer')
      .where('refund.orderId = :orderId', { orderId })
      .andWhere('refund.status NOT IN (:...terminal)', {
        terminal: [
          RefundRequestStatus.REJECTED,
          RefundRequestStatus.CANCELLED,
          RefundRequestStatus.CLOSED,
        ],
      })
      .orderBy('refund.createdAt', 'DESC')
      .getOne();
  }

  findLatestByOrderId(orderId: string): Promise<RefundRequestEntity | null> {
    return this.repo.findOne({
      where: { orderId },
      relations: { customer: true },
      order: { createdAt: 'DESC' },
    });
  }

  findByMerchantRefundReference(
    merchantRefundReference: string,
  ): Promise<RefundRequestEntity | null> {
    return this.repo.findOne({
      where: { merchantRefundReference },
      relations: { customer: true, history: true },
    });
  }

  findByProviderRefundId(providerRefundId: string): Promise<RefundRequestEntity | null> {
    return this.repo.findOne({
      where: { providerRefundId },
      relations: { customer: true, history: true },
    });
  }

  async lockById(id: string, manager: EntityManager): Promise<RefundRequestEntity | null> {
    return manager
      .getRepository(RefundRequestEntity)
      .createQueryBuilder('refund')
      .setLock('pessimistic_write')
      .where('refund.id = :id', { id })
      .getOne();
  }

  async updateById(
    id: string,
    data: Partial<RefundRequestEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(RefundRequestEntity) ?? this.repo;
    await repository.update({ id }, data as QueryDeepPartialEntity<RefundRequestEntity>);
  }

  async sumActiveAmountsForOrder(
    orderId: string,
    excludingId?: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repository = manager?.getRepository(RefundRequestEntity) ?? this.repo;
    const qb = repository
      .createQueryBuilder('refund')
      .select(
        `COALESCE(SUM(CAST(COALESCE(refund.approvedAmount, refund.requestedAmount) AS numeric)), 0)`,
        'total',
      )
      .where('refund.orderId = :orderId', { orderId })
      .andWhere('refund.status NOT IN (:...excluded)', {
        excluded: [
          RefundRequestStatus.REJECTED,
          RefundRequestStatus.CANCELLED,
          RefundRequestStatus.FAILED,
        ],
      });
    if (excludingId) {
      qb.andWhere('refund.id != :excludingId', { excludingId });
    }
    const raw = await qb.getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  async findAllPaginated(
    options: RefundRequestListOptions,
  ): Promise<{ data: RefundRequestEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? 'refund.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('refund')
      .leftJoinAndSelect('refund.customer', 'customer')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('refund.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('refund.status = :status', { status: options.status });
    }
    if (options.reason) {
      qb.andWhere('refund.reason = :reason', { reason: options.reason });
    }
    if (options.paymentProvider) {
      qb.andWhere('refund.paymentProvider = :paymentProvider', {
        paymentProvider: options.paymentProvider,
      });
    }
    if (options.orderId) {
      qb.andWhere('refund.orderId = :orderId', { orderId: options.orderId });
    }
    if (options.orderNumber) {
      qb.andWhere('refund.orderNumber ILIKE :orderNumber', {
        orderNumber: `%${options.orderNumber}%`,
      });
    }
    if (options.customerId) {
      qb.andWhere('refund.customerId = :customerId', { customerId: options.customerId });
    }
    if (options.assignedTo) {
      qb.andWhere('refund.assignedToUserId = :assignedTo', { assignedTo: options.assignedTo });
    }
    if (options.createdFrom) {
      qb.andWhere('refund.createdAt >= :createdFrom', { createdFrom: options.createdFrom });
    }
    if (options.createdTo) {
      qb.andWhere('refund.createdAt <= :createdTo', { createdTo: options.createdTo });
    }
    if (options.slaStatus) {
      const now = new Date();
      const orangeFrom = new Date(now.getTime() - REFUND_SLA_ORANGE_AFTER_HOURS * 36e5);
      const redFrom = new Date(now.getTime() - REFUND_SLA_RED_AFTER_HOURS * 36e5);
      if (options.slaStatus === 'GREEN') {
        qb.andWhere('refund.createdAt > :orangeFrom', { orangeFrom });
      } else if (options.slaStatus === 'ORANGE') {
        qb.andWhere('refund.createdAt <= :orangeFrom AND refund.createdAt > :redFrom', {
          orangeFrom,
          redFrom,
        });
      } else {
        qb.andWhere('refund.createdAt <= :redFrom', { redFrom });
      }
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        `(refund.orderNumber ILIKE :search
          OR refund.providerRefundId ILIKE :search
          OR refund.merchantRefundReference ILIKE :search
          OR customer.firstName ILIKE :search
          OR customer.lastName ILIKE :search
          OR customer.email ILIKE :search
          OR customer.mobileNumber ILIKE :search
          OR TRIM(CONCAT(COALESCE(customer.firstName, ''), ' ', COALESCE(customer.lastName, ''))) ILIKE :search)`,
        { search },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
