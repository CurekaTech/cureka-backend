import { applyMasterListOrdering } from '../utils/master-list-query.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { SupportFaqEntity } from '../entities/support-faq.entity';
import { SupportContentStatus } from '../enums/support-content-status.enum';

export interface SupportFaqFindOptions extends PaginationOptions {
  categoryRefId?: string;
  status?: SupportContentStatus;
}

@Injectable()
export class SupportFaqsRepository {
  constructor(
    @InjectRepository(SupportFaqEntity)
    private readonly repo: Repository<SupportFaqEntity>,
  ) {}

  async create(data: Partial<SupportFaqEntity>): Promise<SupportFaqEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<SupportFaqEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<SupportFaqEntity>,
  ): Promise<SupportFaqEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: SupportFaqFindOptions,
  ): Promise<{ data: SupportFaqEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo.createQueryBuilder('faq').skip(skip).take(take);

    applyMasterListOrdering(qb, 'faq', options.status, 'faq.sortOrder', 'ASC');
    qb.addOrderBy('faq.createdAt', 'DESC');

    if (options.categoryRefId) {
      qb.andWhere('faq.category_ref_id = :categoryRefId', {
        categoryRefId: options.categoryRefId,
      });
    }

    if (options.status) {
      qb.andWhere('faq.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere('(faq.question ILIKE :search OR faq.answer ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
