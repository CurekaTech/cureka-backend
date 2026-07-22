import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { TestimonialEntity } from '../entities/testimonial.entity';

export interface TestimonialFindOptions extends PaginationOptions {
  status?: MasterStatus;
}

@Injectable()
export class TestimonialRepository {
  constructor(
    @InjectRepository(TestimonialEntity)
    private readonly repo: Repository<TestimonialEntity>,
  ) {}

  async create(data: Partial<TestimonialEntity>): Promise<TestimonialEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<TestimonialEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<TestimonialEntity>,
  ): Promise<TestimonialEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: TestimonialFindOptions,
  ): Promise<{ data: TestimonialEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'item.createdAt',
      name: 'item.name',
      city: 'item.city',
      rating: 'item.rating',
      sortOrder: 'item.sortOrder',
      status: 'item.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'item.sortOrder';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('item')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('item.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('item.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere(
        '(item.name ILIKE :search OR item.city ILIKE :search OR item.description ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveForStorefront(limit?: number): Promise<TestimonialEntity[]> {
    const qb = this.repo
      .createQueryBuilder('item')
      .where('item.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('item.sort_order', 'ASC')
      .addOrderBy('item.created_at', 'ASC');

    if (limit != null) {
      qb.take(limit);
    }

    return qb.getMany();
  }
}
