import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, ILike, In, Not, QueryDeepPartialEntity, Repository } from 'typeorm';
import { OrderEntity } from '../entities/order.entity';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { resolveAdminListPaymentRequestStatuses } from '../utils/admin-order-list-payment-requests.util';

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
      relations: { user: true, items: { product: { media: true }, variant: true } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findByOrderNumber(orderNumber: string, manager?: EntityManager): Promise<OrderEntity | null> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.findOne({
      where: { orderNumber },
      relations: { user: true, items: { product: { media: true }, variant: true } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findById(id: string, manager?: EntityManager): Promise<OrderEntity | null> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  /** Idempotency helper for failed payment-request → order materialization. */
  findFailedByPaymentRequestRef(
    paymentRequestRefId: string,
  ): Promise<OrderEntity | null> {
    return this.repo.findOne({
      where: {
        paymentStatus: OrderPaymentStatus.FAILED,
        notes: ILike(`%payment request ${paymentRequestRefId}%`),
      },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Real order created from a payment request (paid or failed), linked via notes. */
  findLinkedToPaymentRequestRef(paymentRequestRefId: string): Promise<OrderEntity | null> {
    return this.repo.findOne({
      where: { notes: ILike(`%payment request ${paymentRequestRefId}%`) },
      relations: { user: true, items: { product: { media: true }, variant: true } },
      order: { createdAt: 'DESC', items: { createdAt: 'ASC' } },
    });
  }

  findRecentPlacedByUserId(userId: string, limit = 3): Promise<OrderEntity[]> {
    return this.repo.find({
      where: { userId, orderStatus: Not(OrderStatus.PENDING) },
      relations: { user: true, items: { product: { media: true } } },
      order: { placedAt: 'DESC', createdAt: 'DESC', items: { createdAt: 'ASC' } },
      take: limit,
    });
  }

  async getCustomerOrderStats(userId: string): Promise<{ count: number; totalSpent: string }> {
    const row = await this.repo
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(order.grandTotal), 0)', 'total')
      .where('order.userId = :userId', { userId })
      .andWhere('order.orderStatus != :pending', { pending: OrderStatus.PENDING })
      .getRawOne<{ count: string; total: string }>();
    return {
      count: Number(row?.count ?? 0),
      totalSpent: String(row?.total ?? '0'),
    };
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
    paymentStatus?: OrderPaymentStatus;
    paymentMethod?: OrderPaymentMethod;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<{ data: OrderEntity[]; total: number }> {
    const { userId, page, limit } = options;
    const { skip, take } = buildSkipTake(page, limit);
    const sortOrder = options.sortOrder ?? 'DESC';
    const SORTABLE: Record<string, string> = {
      createdAt: 'order.createdAt',
      placedAt: 'order.placedAt',
      orderNumber: 'order.orderNumber',
      grandTotal: 'order.grandTotal',
      orderStatus: 'order.orderStatus',
      paymentStatus: 'order.paymentStatus',
    };
    const sortColumn =
      (options.sortBy && SORTABLE[options.sortBy]) ?? SORTABLE.createdAt;

    const qb = this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.media', 'media')
      .where('order.userId = :userId', { userId })
      .orderBy(sortColumn, sortOrder, 'NULLS LAST')
      .addOrderBy('items.createdAt', 'ASC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('order.orderStatus = :orderStatus', { orderStatus: options.status });
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
    if (options.fromDate) {
      qb.andWhere('order.createdAt >= :fromDate', { fromDate: options.fromDate });
    }
    if (options.toDate) {
      qb.andWhere('order.createdAt <= :toDate', { toDate: options.toDate });
    }
    if (options.search?.trim()) {
      qb.andWhere(
        `(
          order.refId ILIKE :search
          OR order.orderNumber ILIKE :search
          OR order.recipientName ILIKE :search
          OR order.phoneNumber ILIKE :search
          OR product.name ILIKE :search
          OR items.productName ILIKE :search
          OR CAST(order.grandTotal AS text) LIKE :searchExact
        )`,
        {
          search: `%${options.search.trim()}%`,
          searchExact: `${options.search.trim()}%`,
        },
      );
    }

    const [data, total] = await qb.getManyAndCount();
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

  findByIds(ids: string[]): Promise<OrderEntity[]> {
    if (!ids.length) {
      return Promise.resolve([]);
    }
    return this.repo.find({
      where: { id: In(ids) },
      relations: { user: true, items: { product: { media: true }, variant: true } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  /**
   * Admin list keys: real orders plus unpaid admin-created payment requests (`PAY…`).
   * Those drafts are not `orders` rows until payment is captured.
   */
  async findAdminListKeys(options: AdminOrderListOptions): Promise<{
    keys: Array<{ id: string; recordType: 'ORDER' | 'PAYMENT_REQUEST' }>;
    total: number;
  }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrderSql = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const sortColumnSql = this.resolveAdminListSortColumn(options.sortBy);
    const params: unknown[] = [];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    const orderWhere: string[] = ['o.deleted_at IS NULL'];
    if (options.orderStatus) {
      orderWhere.push(`o.order_status = ${push(options.orderStatus)}`);
    }
    if (options.paymentStatus) {
      orderWhere.push(`o.payment_status = ${push(options.paymentStatus)}`);
    }
    if (options.paymentMethod) {
      orderWhere.push(`o.payment_method = ${push(options.paymentMethod)}`);
    }
    if (options.orderSource) {
      orderWhere.push(`o.order_source = ${push(options.orderSource)}`);
    }
    if (options.userId) {
      orderWhere.push(`o.user_id = ${push(options.userId)}`);
    }
    if (options.fromDate) {
      orderWhere.push(`o.created_at >= ${push(options.fromDate)}`);
    }
    if (options.toDate) {
      orderWhere.push(`o.created_at <= ${push(options.toDate)}`);
    }
    if (options.search?.trim()) {
      const searchLike = push(`%${options.search.trim()}%`);
      const searchExact = push(`${options.search.trim()}%`);
      orderWhere.push(`(
        o.ref_id ILIKE ${searchLike}
        OR o.order_number ILIKE ${searchLike}
        OR o.recipient_name ILIKE ${searchLike}
        OR o.phone_number ILIKE ${searchLike}
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = o.user_id
            AND u.deleted_at IS NULL
            AND (
              u.first_name ILIKE ${searchLike}
              OR u.last_name ILIKE ${searchLike}
              OR u.email ILIKE ${searchLike}
              OR u.mobile_number ILIKE ${searchLike}
            )
        )
        OR EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.deleted_at IS NULL
            AND oi.product_name ILIKE ${searchLike}
        )
        OR CAST(o.grand_total AS text) LIKE ${searchExact}
      )`);
    }

    const orderSelect = `
      SELECT
        o.id::text AS id,
        'ORDER' AS "recordType",
        COALESCE(o.placed_at, o.created_at) AS "sortAt",
        o.created_at AS "createdAt",
        o.order_number AS "orderNumber",
        o.grand_total AS "grandTotal",
        o.order_status::text AS "orderStatus",
        o.payment_status::text AS "paymentStatus",
        o.recipient_name AS "recipientName"
      FROM orders o
      WHERE ${orderWhere.join(' AND ')}
    `;

    const prStatuses = resolveAdminListPaymentRequestStatuses({
      orderSource: options.orderSource,
      orderStatus: options.orderStatus,
      paymentStatus: options.paymentStatus,
    });

    let prSelect: string | null = null;
    if (prStatuses.length) {
      const prWhere: string[] = [
        'pr.deleted_at IS NULL',
        `pr.order_source = ${push(OrderSource.ADMIN)}`,
        `pr.status IN (${prStatuses.map((status) => push(status)).join(', ')})`,
        `UPPER(COALESCE(pr.payment_provider, '')) <> 'COD'`,
        `NOT EXISTS (
          SELECT 1 FROM orders linked
          WHERE linked.deleted_at IS NULL
            AND linked.notes ILIKE ('%payment request ' || pr.ref_id || '%')
        )`,
      ];

      if (options.paymentMethod) {
        prWhere.push(
          `${this.adminListPaymentRequestMethodSql('pr')} = ${push(options.paymentMethod)}`,
        );
      }
      if (options.userId) {
        prWhere.push(`pr.customer_id = ${push(options.userId)}`);
      }
      if (options.fromDate) {
        prWhere.push(`pr.created_at >= ${push(options.fromDate)}`);
      }
      if (options.toDate) {
        prWhere.push(`pr.created_at <= ${push(options.toDate)}`);
      }
      if (options.search?.trim()) {
        const searchLike = push(`%${options.search.trim()}%`);
        const searchExact = push(`${options.search.trim()}%`);
        prWhere.push(`(
          pr.ref_id ILIKE ${searchLike}
          OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = pr.customer_id
              AND u.deleted_at IS NULL
              AND (
                u.first_name ILIKE ${searchLike}
                OR u.last_name ILIKE ${searchLike}
                OR u.email ILIKE ${searchLike}
                OR u.mobile_number ILIKE ${searchLike}
              )
          )
          OR EXISTS (
            SELECT 1 FROM payment_request_items pri
            INNER JOIN products p ON p.id = pri.product_id AND p.deleted_at IS NULL
            WHERE pri.payment_request_id = pr.id
              AND pri.deleted_at IS NULL
              AND p.name ILIKE ${searchLike}
          )
          OR CAST(pr.total_amount AS text) LIKE ${searchExact}
        )`);
      }

      prSelect = `
        SELECT
          pr.id::text AS id,
          'PAYMENT_REQUEST' AS "recordType",
          pr.created_at AS "sortAt",
          pr.created_at AS "createdAt",
          pr.ref_id AS "orderNumber",
          pr.total_amount AS "grandTotal",
          CASE pr.status::text
            WHEN 'PAID' THEN 'CONFIRMED'
            WHEN 'CANCELLED' THEN 'CANCELLED'
            WHEN 'EXPIRED' THEN 'CANCELLED'
            ELSE 'PENDING'
          END AS "orderStatus",
          CASE pr.status::text
            WHEN 'PAID' THEN 'PAID'
            WHEN 'FAILED' THEN 'FAILED'
            ELSE 'PENDING'
          END AS "paymentStatus",
          COALESCE(u.first_name, u.last_name, '') AS "recipientName"
        FROM payment_requests pr
        LEFT JOIN users u ON u.id = pr.customer_id AND u.deleted_at IS NULL
        WHERE ${prWhere.join(' AND ')}
      `;
    }

    const unionBody = [orderSelect, prSelect].filter(Boolean).join(' UNION ALL ');
    const limitParam = push(take);
    const offsetParam = push(skip);

    const rows = (await this.repo.query(
      `
        SELECT id, "recordType"
        FROM (${unionBody}) AS combined
        ORDER BY ${sortColumnSql} ${sortOrderSql} NULLS LAST
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    )) as Array<{ id: string; recordType: 'ORDER' | 'PAYMENT_REQUEST' }>;

    const countRows = (await this.repo.query(
      `SELECT COUNT(*)::int AS total FROM (${unionBody}) AS combined`,
      params.slice(0, params.length - 2),
    )) as Array<{ total: number }>;

    return {
      keys: rows,
      total: countRows[0]?.total ?? 0,
    };
  }

  private resolveAdminListSortColumn(sortBy?: string): string {
    const SORTABLE: Record<string, string> = {
      createdAt: '"createdAt"',
      placedAt: '"sortAt"',
      orderNumber: '"orderNumber"',
      grandTotal: '"grandTotal"',
      orderStatus: '"orderStatus"',
      paymentStatus: '"paymentStatus"',
      recipientName: '"recipientName"',
    };
    return (sortBy && SORTABLE[sortBy]) ?? SORTABLE.placedAt!;
  }

  private adminListPaymentRequestMethodSql(alias: string): string {
    return `CASE
      WHEN UPPER(COALESCE(${alias}.payment_provider, '')) = 'COD' THEN 'COD'
      WHEN UPPER(COALESCE(${alias}.payment_provider, '')) = 'CASHFREE' THEN 'CASHFREE'
      WHEN UPPER(COALESCE(${alias}.payment_provider, '')) = 'WALLET' THEN 'WALLET'
      WHEN UPPER(COALESCE(${alias}.payment_provider, '')) = 'GOKWIK_PREPAID' THEN 'GOKWIK_PREPAID'
      ELSE 'RAZORPAY'
    END`;
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
    return repository
      .update({ id }, data as QueryDeepPartialEntity<OrderEntity>)
      .then(() => undefined);
  }
}
