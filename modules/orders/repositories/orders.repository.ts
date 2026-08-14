import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { OrderEntity } from '../entities/order.entity';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrderStatus } from '../enums/order-status.enum';

export interface AdminOrderListOptions {
  page: number;
  limit: number;
  search?: string;
  orderStatus?: OrderStatus;
  paymentStatus?: OrderPaymentStatus;
  paymentMethod?: OrderPaymentMethod;
  orderSource?: OrderSource;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
  ) {}

  create(data: Partial<OrderEntity>, manager?: EntityManager): Promise<OrderEntity> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  existsByOrderNumber(orderNumber: string): Promise<boolean> {
    return this.repo.exists({ where: { orderNumber } });
  }

  /** True when the user has a non-cancelled order that includes the product. */
  async userHasOrderedProduct(userId: string, productId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('order')
      .innerJoin('order.items', 'item')
      .where('order.userId = :userId', { userId })
      .andWhere('item.productId = :productId', { productId })
      .andWhere('order.orderStatus != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getCount();

    return count > 0;
  }

  findByIdAndUserId(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<OrderEntity | null> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.findOne({
      where: { id, userId },
      relations: { items: { product: { media: true } } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findByOrderNumberAndUserId(
    orderNumber: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<OrderEntity | null> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.findOne({
      where: { orderNumber, userId },
      relations: { items: { product: { media: true } } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  async findByOrderNumberAndUserIdForUpdate(
    orderNumber: string,
    userId: string,
    manager: EntityManager,
  ): Promise<OrderEntity | null> {
    const repository = manager.getRepository(OrderEntity);
    const locked = await repository
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.orderNumber = :orderNumber', { orderNumber })
      .andWhere('order.userId = :userId', { userId })
      .getOne();

    if (!locked) {
      return null;
    }

    return repository.findOne({
      where: { id: locked.id },
      relations: { items: { product: { media: true } } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findByIdWithItems(id: string, manager?: EntityManager): Promise<OrderEntity | null> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.findOne({
      where: { id },
      relations: { user: true, items: { variant: true } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findByIdOrRefId(idOrRefId: string): Promise<OrderEntity | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRefId);
    return this.repo.findOne({
      where: isUuid ? { id: idOrRefId } : { refId: idOrRefId },
      relations: { user: true, items: { product: { media: true } } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  /** Loads an order with items, their products (for refId), and the customer (for email). */
  findForUnicommercePush(id: string, manager?: EntityManager): Promise<OrderEntity | null> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.findOne({
      where: { id },
      relations: { user: true, items: { product: true } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  async findByUserPaginated(options: {
    userId: string;
    status?: OrderStatus;
    page: number;
    limit: number;
  }): Promise<{ data: OrderEntity[]; total: number }> {
    const { userId, status, page, limit } = options;
    const { skip, take } = buildSkipTake(page, limit);

    const where: FindOptionsWhere<OrderEntity> = { userId };
    if (status) {
      where.orderStatus = status;
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      relations: { items: { product: { media: true } } },
      order: { createdAt: 'DESC', items: { createdAt: 'ASC' } },
      skip,
      take,
    });

    return { data, total };
  }

  async findAllPaginated(
    options: AdminOrderListOptions,
  ): Promise<{ data: OrderEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrder = options.sortOrder ?? 'DESC';
    const SORTABLE: Record<string, string> = {
      createdAt: 'order.createdAt',
      placedAt: 'order.placedAt',
      orderNumber: 'order.orderNumber',
      grandTotal: 'order.grandTotal',
      orderStatus: 'order.orderStatus',
      paymentStatus: 'order.paymentStatus',
      recipientName: 'order.recipientName',
    };
    const sortColumn =
      (options.sortBy && SORTABLE[options.sortBy]) ?? SORTABLE.createdAt;

    const qb = this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .orderBy(sortColumn, sortOrder, 'NULLS LAST')
      .addOrderBy('items.createdAt', 'ASC')
      .skip(skip)
      .take(take);

    if (options.orderStatus) {
      qb.andWhere('order.orderStatus = :orderStatus', { orderStatus: options.orderStatus });
    }
    if (options.paymentStatus) {
      qb.andWhere('order.paymentStatus = :paymentStatus', {
        paymentStatus: options.paymentStatus,
      });
    }
    if (options.paymentMethod) {
      qb.andWhere('order.paymentMethod = :paymentMethod', {
        paymentMethod: options.paymentMethod,
      });
    }
    if (options.orderSource) {
      qb.andWhere('order.orderSource = :orderSource', {
        orderSource: options.orderSource,
      });
    }
    if (options.userId) {
      qb.andWhere('order.userId = :userId', { userId: options.userId });
    }
    if (options.fromDate) {
      qb.andWhere('order.createdAt >= :fromDate', { fromDate: options.fromDate });
    }
    if (options.toDate) {
      qb.andWhere('order.createdAt <= :toDate', { toDate: options.toDate });
    }
    if (options.search) {
      qb.andWhere(
        `(
          order.refId ILIKE :search
          OR order.orderNumber ILIKE :search
          OR order.recipientName ILIKE :search
          OR order.phoneNumber ILIKE :search
          OR user.firstName ILIKE :search
          OR user.lastName ILIKE :search
          OR user.email ILIKE :search
          OR user.mobileNumber ILIKE :search
          OR product.name ILIKE :search
          OR CAST(order.grandTotal AS text) LIKE :searchExact
        )`,
        { search: `%${options.search}%`, searchExact: `${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findPaidForSubscriptionAttach(params: {
    userId: string;
    productId: string;
    productVariantId: string;
    orderRef?: string;
  }): Promise<OrderEntity | null> {
    const { userId, productId, productVariantId, orderRef } = params;
    const candidates: OrderEntity[] = [];

    if (orderRef?.trim()) {
      const ref = orderRef.trim();
      const byNumber = await this.findByOrderNumberAndUserId(ref, userId);
      if (byNumber) candidates.push(byNumber);
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRe.test(ref)) {
        const byId = await this.findByIdAndUserId(ref, userId);
        if (byId) candidates.push(byId);
      }
      const byRefId = await this.repo.findOne({
        where: { userId, refId: ref },
        relations: { items: true },
      });
      if (byRefId) candidates.push(byRefId);
      const escaped = ref.replace(/[%_]/g, '');
      if (escaped) {
        const byNotes = await this.repo.findOne({
          where: { userId, notes: ILike(`%${escaped}%`) },
          relations: { items: true },
          order: { placedAt: 'DESC' },
        });
        if (byNotes) candidates.push(byNotes);
      }
    }

    const recent = await this.repo.find({
      where: { userId, paymentStatus: OrderPaymentStatus.PAID },
      relations: { items: true },
      order: { placedAt: 'DESC' },
      take: 20,
    });
    candidates.push(...recent);

    const seen = new Set<string>();
    for (const order of candidates) {
      if (!order || seen.has(order.id)) continue;
      seen.add(order.id);
      if (order.paymentStatus !== OrderPaymentStatus.PAID) continue;
      const hasItem = order.items?.some(
        (item) => item.productId === productId && item.variantId === productVariantId,
      );
      if (hasItem) return order;
    }

    return null;
  }

  updateById(id: string, data: Partial<OrderEntity>, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.update({ id }, data).then(() => undefined);
  }
}
