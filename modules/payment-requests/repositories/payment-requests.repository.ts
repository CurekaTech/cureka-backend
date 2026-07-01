import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Repository } from 'typeorm';
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

  /**
   * Fetch a single payment request by PK, including full relations:
   * - customer (user record)
   * - items → product (name, refId)
   * - items → variant (sku, sellingPrice, attribute values)
   */
  findById(id: string, manager?: EntityManager): Promise<PaymentRequestEntity | null> {
    const repository = manager ? manager.getRepository(PaymentRequestEntity) : this.repo;
    return repository.findOne({
      where: { id },
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
}
