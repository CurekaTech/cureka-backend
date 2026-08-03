import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Not, Repository } from 'typeorm';
import { PaymentRequestEntity } from '../entities/payment-request.entity';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';

@Injectable()
export class PaymentRequestsRepository {
  constructor(
    @InjectRepository(PaymentRequestEntity)
    private readonly repo: Repository<PaymentRequestEntity>,
  ) {}

  create(data: Partial<PaymentRequestEntity>, manager?: EntityManager): Promise<PaymentRequestEntity> {
    const repository = manager ? manager.getRepository(PaymentRequestEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  async updateById(
    id: string,
    data: Partial<PaymentRequestEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(PaymentRequestEntity) : this.repo;
    await repository.update({ id }, data);
  }

  async markPaidIfUnpaid(
    id: string,
    data: Partial<PaymentRequestEntity>,
  ): Promise<boolean> {
    const result = await this.repo.update(
      { id, status: Not(PaymentRequestStatus.PAID) },
      data,
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Fetch a single payment request by PK, including full relations:
   * - customer (user record)
   * - items → product (name, refId)
   * - items → variant (sku, sellingPrice, attribute values)
   */
  findById(idOrRefId: string, manager?: EntityManager): Promise<PaymentRequestEntity | null> {
    const repository = manager ? manager.getRepository(PaymentRequestEntity) : this.repo;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRefId);
    return repository.findOne({
      where: isUuid ? { id: idOrRefId } : { refId: idOrRefId },
      relations: {
        customer: true,
        items: {
          product: true,
          variant: {
            attributeValues: true,
          },
        },
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findByProviderReferenceId(providerReferenceId: string): Promise<PaymentRequestEntity | null> {
    return this.repo.findOne({
      where: { providerReferenceId },
      relations: {
        items: {
          product: true,
          variant: true,
        },
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  /**
   * Paginated list with customer + product name joins for the admin listing page.
   *
   * search param matches against:
   *   - refId (Order ID)
   *   - customer firstName / lastName / email / mobileNumber
   *   - product name
   *   - totalAmount
   *   - providerReferenceId (Razorpay payment link ID)
   */
  async findPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: PaymentRequestStatus;
    customerId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{ data: PaymentRequestEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const qb = this.repo
      .createQueryBuilder('request')
      // join customer for name display and search
      .leftJoinAndSelect('request.customer', 'customer')
      // join items and their product for name display and search
      .leftJoinAndSelect('request.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.variant', 'variant')
      .orderBy('request.createdAt', 'DESC')
      .addOrderBy('items.createdAt', 'ASC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('request.status = :status', { status: options.status });
    }

    if (options.customerId) {
      qb.andWhere('request.customerId = :customerId', { customerId: options.customerId });
    }

    if (options.fromDate) {
      qb.andWhere('request.createdAt >= :fromDate', { fromDate: options.fromDate });
    }
    if (options.toDate) {
      qb.andWhere('request.createdAt <= :toDate', { toDate: options.toDate });
    }

    if (options.search) {
      qb.andWhere(
        `(
          request.refId ILIKE :search
          OR request.providerReferenceId ILIKE :search
          OR customer.firstName ILIKE :search
          OR customer.lastName ILIKE :search
          OR customer.email ILIKE :search
          OR customer.mobileNumber ILIKE :search
          OR product.name ILIKE :search
          OR CAST(request.totalAmount AS text) LIKE :searchExact
        )`,
        { search: `%${options.search}%`, searchExact: `${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  findByIds(ids: string[]): Promise<PaymentRequestEntity[]> {
    if (!ids.length) {
      return Promise.resolve([]);
    }
    return this.repo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.customer', 'customer')
      .leftJoinAndSelect('request.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.variant', 'variant')
      .where('request.id IN (:...ids)', { ids })
      .orderBy('items.createdAt', 'ASC')
      .getMany();
  }

  /**
   * Unified admin list: payment_requests + storefront/GoKwik COD orders.
   * Returns page keys only; caller hydrates full rows.
   */
  async findAdminListKeys(options: {
    page: number;
    limit: number;
    search?: string;
    status?: PaymentRequestStatus;
    customerId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    keys: Array<{ id: string; recordType: 'PAYMENT_REQUEST' | 'COD_ORDER'; createdAt: Date }>;
    total: number;
  }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const params: unknown[] = [];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    // COD orders never have LINK_GENERATED / EXPIRED — skip that branch for those filters.
    const includeCod =
      !options.status ||
      options.status === PaymentRequestStatus.PAYMENT_PENDING ||
      options.status === PaymentRequestStatus.PAID ||
      options.status === PaymentRequestStatus.CANCELLED;

    const prWhere: string[] = ['pr.deleted_at IS NULL'];
    const orderWhere: string[] = [];

    if (includeCod) {
      orderWhere.push('o.deleted_at IS NULL', `o.payment_method = ${push('COD')}`);
    }

    if (options.status) {
      prWhere.push(`pr.status = ${push(options.status)}`);
      if (includeCod) {
        if (options.status === PaymentRequestStatus.CANCELLED) {
          orderWhere.push(`o.order_status = ${push('CANCELLED')}`);
        } else if (options.status === PaymentRequestStatus.PAID) {
          orderWhere.push(`o.order_status != ${push('CANCELLED')}`);
          orderWhere.push(`o.payment_status = ${push('PAID')}`);
        } else if (options.status === PaymentRequestStatus.PAYMENT_PENDING) {
          orderWhere.push(`o.order_status != ${push('CANCELLED')}`);
          orderWhere.push(`o.payment_status != ${push('PAID')}`);
        }
      }
    }

    if (options.customerId) {
      const customerParam = push(options.customerId);
      prWhere.push(`pr.customer_id = ${customerParam}`);
      if (includeCod) {
        orderWhere.push(`o.user_id = ${customerParam}`);
      }
    }

    if (options.fromDate) {
      const fromParam = push(options.fromDate);
      prWhere.push(`pr.created_at >= ${fromParam}`);
      if (includeCod) {
        orderWhere.push(`o.created_at >= ${fromParam}`);
      }
    }
    if (options.toDate) {
      const toParam = push(options.toDate);
      prWhere.push(`pr.created_at <= ${toParam}`);
      if (includeCod) {
        orderWhere.push(`o.created_at <= ${toParam}`);
      }
    }

    if (options.search?.trim()) {
      const searchLike = push(`%${options.search.trim()}%`);
      const searchExact = push(`${options.search.trim()}%`);
      prWhere.push(`(
        pr.ref_id ILIKE ${searchLike}
        OR pr.provider_reference_id ILIKE ${searchLike}
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
      if (includeCod) {
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
    }

    const prSelect = `
      SELECT pr.id::text AS id, 'PAYMENT_REQUEST' AS "recordType", pr.created_at AS "createdAt"
      FROM payment_requests pr
      WHERE ${prWhere.join(' AND ')}
    `;
    const codSelect =
      includeCod && orderWhere.length
        ? `
      SELECT o.id::text AS id, 'COD_ORDER' AS "recordType", o.created_at AS "createdAt"
      FROM orders o
      WHERE ${orderWhere.join(' AND ')}
    `
        : null;

    const unionBody = codSelect ? `${prSelect} UNION ALL ${codSelect}` : prSelect;
    const limitParam = push(take);
    const offsetParam = push(skip);

    const rows = (await this.repo.query(
      `
        SELECT id, "recordType", "createdAt"
        FROM (${unionBody}) AS combined
        ORDER BY "createdAt" DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    )) as Array<{ id: string; recordType: 'PAYMENT_REQUEST' | 'COD_ORDER'; createdAt: Date }>;

    const countRows = (await this.repo.query(
      `SELECT COUNT(*)::int AS total FROM (${unionBody}) AS combined`,
      params.slice(0, params.length - 2),
    )) as Array<{ total: number }>;

    return {
      keys: rows,
      total: countRows[0]?.total ?? 0,
    };
  }
}
