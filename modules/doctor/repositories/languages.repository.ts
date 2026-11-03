import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { LanguageEntity } from '../entities/language.entity';

@Injectable()
export class LanguagesRepository {
  constructor(
    @InjectRepository(LanguageEntity)
    private readonly repo: Repository<LanguageEntity>,
  ) {}

  create(data: Partial<LanguageEntity>) {
    return this.repo.save(this.repo.create(data));
  }

  findByRefId(refId: string) {
    return this.repo.findOne({ where: { refId } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  existsByRefId(refId: string) {
    return this.repo.exists({ where: { refId } });
  }

  async existsByCode(code: string, excludeRefId?: string) {
    const qb = this.repo
      .createQueryBuilder('l')
      .where('LOWER(l.code) = LOWER(:code)', { code })
      .andWhere('l.deletedAt IS NULL');
    if (excludeRefId) qb.andWhere('l.refId != :excludeRefId', { excludeRefId });
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(refId: string, data: Partial<LanguageEntity>) {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  softDeleteByRefId(refId: string) {
    return this.repo.softDelete({ refId });
  }

  async findAllPaginated(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: MasterStatus;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const qb = this.repo
      .createQueryBuilder('l')
      .orderBy('l.createdAt', options.sortOrder ?? 'DESC')
      .skip(skip)
      .take(take);
    if (options.search) {
      qb.andWhere('(l.name ILIKE :search OR l.code ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }
    if (options.status) qb.andWhere('l.status = :status', { status: options.status });
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
