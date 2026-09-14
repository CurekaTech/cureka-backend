import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { EntityManager, In, QueryDeepPartialEntity, Repository } from 'typeorm';
import {
  RETURN_SLA_ORANGE_AFTER_HOURS,
  RETURN_SLA_RED_AFTER_HOURS,
} from '../constants/return.constants';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnRequestItemEntity } from '../entities/return-request-item.entity';
import { ReturnRequestEntity } from '../entities/return-request.entity';
import { ReturnStatusHistoryEntity } from '../entities/return-status-history.entity';
import { ReturnSlaStatus } from '../interfaces/return-request.interface';
import { QUANTITY_BLOCKING_STATUSES } from '../utils/return-status-transition.util';

export type ReturnRequestListOptions = PaginationOptions & {
  status?: ReturnStatus;
  statuses?: ReturnStatus[];
  resolution?: ReturnResolution;
  orderId?: string;
  orderNumber?: string;
  returnNumber?: string;
  customerId?: string;
  reasonId?: string;
  sku?: string;
  productId?: string;
  assignedTo?: string;
  pickupRequired?: boolean;
  qcRequired?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  deliveredFrom?: Date;
  deliveredTo?: Date;
  slaStatus?: ReturnSlaStatus;
};

const SORTABLE: Record<string, string> = {
  createdAt: 'returnRequest.createdAt',
  updatedAt: 'returnRequest.updatedAt',
  status: 'returnRequest.status',
  returnNumber: 'returnRequest.returnNumber',
  orderNumber: 'returnRequest.orderNumber',
  deliveredAt: 'returnRequest.deliveredAt',
  estimatedRefundAmount: 'returnRequest.estimatedRefundAmount',
};

const DETAIL_RELATIONS = {
  items: true,
  history: true,
  customer: true,
  order: true,
} as const;

@Injectable()
export class ReturnRequestsRepository {
  constructor(
    @InjectRepository(ReturnRequestEntity)
    private readonly repo: Repository<ReturnRequestEntity>,
    @InjectRepository(ReturnRequestItemEntity)
    private readonly itemsRepo: Repository<ReturnRequestItemEntity>,
    @InjectRepository(ReturnStatusHistoryEntity)
    private readonly historyRepo: Repository<ReturnStatusHistoryEntity>,
  ) {}

  create(
    data: Partial<ReturnRequestEntity>,
    manager?: EntityManager,
  ): Promise<ReturnRequestEntity> {
    const repository = manager?.getRepository(ReturnRequestEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  createItems(
    data: Partial<ReturnRequestItemEntity>[],
    manager?: EntityManager,
  ): Promise<ReturnRequestItemEntity[]> {
    const repository = manager?.getRepository(ReturnRequestItemEntity) ?? this.itemsRepo;
    return repository.save(repository.create(data));
  }

  addHistory(
    data: Partial<ReturnStatusHistoryEntity>,
    manager?: EntityManager,
  ): Promise<ReturnStatusHistoryEntity> {
    const repository = manager?.getRepository(ReturnStatusHistoryEntity) ?? this.historyRepo;
    return repository.save(repository.create(data));
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  existsByReturnNumber(returnNumber: string): Promise<boolean> {
    return this.repo.exists({ where: { returnNumber } });
  }

  existsByItemRefId(refId: string): Promise<boolean> {
    return this.itemsRepo.exists({ where: { refId } });
  }

  findById(id: string, manager?: EntityManager): Promise<ReturnRequestEntity | null> {
    const repository = manager?.getRepository(ReturnRequestEntity) ?? this.repo;
    return repository.findOne({ where: { id }, relations: DETAIL_RELATIONS });
  }

  /** Accepts UUID, `refId`, or the customer-facing return number. */
  findByAnyIdentifier(
    identifier: string,
    manager?: EntityManager,
  ): Promise<ReturnRequestEntity | null> {
    const repository = manager?.getRepository(ReturnRequestEntity) ?? this.repo;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
    if (isUuid) {
      return this.findById(identifier, manager);
    }
    const normalized = identifier.trim().toUpperCase();
    return repository.findOne({
      where: [{ refId: normalized }, { returnNumber: normalized }],
      relations: DETAIL_RELATIONS,
    });
  }

  findByRefundRequestId(refundRequestId: string): Promise<ReturnRequestEntity | null> {
    return this.repo.findOne({
      where: { refundRequestId },
      relations: { items: true },
    });
  }

  async lockById(id: string, manager: EntityManager): Promise<ReturnRequestEntity | null> {
    return manager
      .getRepository(ReturnRequestEntity)
      .createQueryBuilder('returnRequest')
      .setLock('pessimistic_write')
      .where('returnRequest.id = :id', { id })
      .getOne();
  }

  async updateById(
    id: string,
    data: Partial<ReturnRequestEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(ReturnRequestEntity) ?? this.repo;
    await repository.update({ id }, data as QueryDeepPartialEntity<ReturnRequestEntity>);
  }

  async updateItemById(
    id: string,
    data: Partial<ReturnRequestItemEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(ReturnRequestItemEntity) ?? this.itemsRepo;
    await repository.update({ id }, data as QueryDeepPartialEntity<ReturnRequestItemEntity>);
  }

  findItemsByReturnRequestId(
    returnRequestId: string,
    manager?: EntityManager,
  ): Promise<ReturnRequestItemEntity[]> {
    const repository = manager?.getRepository(ReturnRequestItemEntity) ?? this.itemsRepo;
    return repository.find({ where: { returnRequestId } });
  }

  findHistory(returnRequestId: string): Promise<ReturnStatusHistoryEntity[]> {
    return this.historyRepo.find({
      where: { returnRequestId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Quantity already committed per order item across non-cancelled, non-rejected
   * returns. Drives the "requested quantity must not exceed available" rule.
   */
  async sumCommittedQuantityByOrderItem(
    orderItemIds: string[],
    options?: { excludeReturnRequestId?: string; manager?: EntityManager },
  ): Promise<Map<string, number>> {
    if (orderItemIds.length === 0) {
      return new Map();
    }
    const repository =
      options?.manager?.getRepository(ReturnRequestItemEntity) ?? this.itemsRepo;

    const qb = repository
      .createQueryBuilder('item')
      .innerJoin('item.returnRequest', 'returnRequest')
      .select('item.orderItemId', 'orderItemId')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'total')
      .where('item.orderItemId IN (:...orderItemIds)', { orderItemIds })
      .andWhere('returnRequest.status IN (:...statuses)', {
        statuses: QUANTITY_BLOCKING_STATUSES,
      })
      .groupBy('item.orderItemId');

    if (options?.excludeReturnRequestId) {
      qb.andWhere('returnRequest.id != :excludeId', {
        excludeId: options.excludeReturnRequestId,
      });
    }

    const rows = await qb.getRawMany<{ orderItemId: string; total: string }>();
    return new Map(rows.map((row) => [row.orderItemId, Number(row.total ?? 0)]));
  }

  /** Active (non-terminal) returns touching any of the given order items. */
  async findActiveByOrderItemIds(
    orderItemIds: string[],
    manager?: EntityManager,
  ): Promise<ReturnRequestItemEntity[]> {
    if (orderItemIds.length === 0) {
      return [];
    }
    const repository = manager?.getRepository(ReturnRequestItemEntity) ?? this.itemsRepo;
    return repository
      .createQueryBuilder('item')
      .innerJoinAndSelect('item.returnRequest', 'returnRequest')
      .where('item.orderItemId IN (:...orderItemIds)', { orderItemIds })
      .andWhere('returnRequest.status NOT IN (:...terminal)', {
        terminal: [
          ReturnStatus.COMPLETED,
          ReturnStatus.REJECTED,
          ReturnStatus.CANCELLED_BY_CUSTOMER,
        ],
      })
      .getMany();
  }

  findByOrderIdForCustomer(
    orderId: string,
    customerId: string,
  ): Promise<ReturnRequestEntity[]> {
    return this.repo.find({
      where: { orderId, customerId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(
    options: ReturnRequestListOptions,
  ): Promise<{ data: ReturnRequestEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? 'returnRequest.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('returnRequest')
      .leftJoinAndSelect('returnRequest.customer', 'customer')
      .leftJoinAndSelect('returnRequest.items', 'items')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('returnRequest.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('returnRequest.status = :status', { status: options.status });
    }
    if (options.statuses?.length) {
      qb.andWhere('returnRequest.status IN (:...statuses)', { statuses: options.statuses });
    }
    if (options.resolution) {
      qb.andWhere('returnRequest.resolution = :resolution', { resolution: options.resolution });
    }
    if (options.orderId) {
      qb.andWhere('returnRequest.orderId = :orderId', { orderId: options.orderId });
    }
    if (options.orderNumber) {
      qb.andWhere('returnRequest.orderNumber ILIKE :orderNumber', {
        orderNumber: `%${options.orderNumber}%`,
      });
    }
    if (options.returnNumber) {
      qb.andWhere('returnRequest.returnNumber ILIKE :returnNumber', {
        returnNumber: `%${options.returnNumber}%`,
      });
    }
    if (options.customerId) {
      qb.andWhere('returnRequest.customerId = :customerId', { customerId: options.customerId });
    }
    if (options.reasonId) {
      qb.andWhere('returnRequest.reasonId = :reasonId', { reasonId: options.reasonId });
    }
    if (options.assignedTo) {
      qb.andWhere('returnRequest.assignedToUserId = :assignedTo', {
        assignedTo: options.assignedTo,
      });
    }
    if (options.pickupRequired !== undefined) {
      qb.andWhere('returnRequest.pickupRequired = :pickupRequired', {
        pickupRequired: options.pickupRequired,
      });
    }
    if (options.qcRequired !== undefined) {
      qb.andWhere('returnRequest.qcRequired = :qcRequired', { qcRequired: options.qcRequired });
    }
    if (options.createdFrom) {
      qb.andWhere('returnRequest.createdAt >= :createdFrom', { createdFrom: options.createdFrom });
    }
    if (options.createdTo) {
      qb.andWhere('returnRequest.createdAt <= :createdTo', { createdTo: options.createdTo });
    }
    if (options.deliveredFrom) {
      qb.andWhere('returnRequest.deliveredAt >= :deliveredFrom', {
        deliveredFrom: options.deliveredFrom,
      });
    }
    if (options.deliveredTo) {
      qb.andWhere('returnRequest.deliveredAt <= :deliveredTo', {
        deliveredTo: options.deliveredTo,
      });
    }
    if (options.sku) {
      qb.andWhere('items.sku ILIKE :sku', { sku: `%${options.sku}%` });
    }
    if (options.productId) {
      qb.andWhere('items.productId = :productId', { productId: options.productId });
    }
    if (options.slaStatus) {
      const now = new Date();
      const orangeFrom = new Date(now.getTime() - RETURN_SLA_ORANGE_AFTER_HOURS * 36e5);
      const redFrom = new Date(now.getTime() - RETURN_SLA_RED_AFTER_HOURS * 36e5);
      if (options.slaStatus === 'GREEN') {
        qb.andWhere('returnRequest.createdAt > :orangeFrom', { orangeFrom });
      } else if (options.slaStatus === 'ORANGE') {
        qb.andWhere('returnRequest.createdAt <= :orangeFrom AND returnRequest.createdAt > :redFrom', {
          orangeFrom,
          redFrom,
        });
      } else {
        qb.andWhere('returnRequest.createdAt <= :redFrom', { redFrom });
      }
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        `(returnRequest.returnNumber ILIKE :search
          OR returnRequest.orderNumber ILIKE :search
          OR returnRequest.refId ILIKE :search
          OR items.sku ILIKE :search
          OR customer.firstName ILIKE :search
          OR customer.lastName ILIKE :search
          OR customer.email ILIKE :search
          OR customer.mobileNumber ILIKE :search)`,
        { search },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  findManyByIds(ids: string[]): Promise<ReturnRequestEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) }, relations: { items: true } });
  }
}
